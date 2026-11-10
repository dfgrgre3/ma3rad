import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CentralLicenseService } from '../src/services/domains/licensing/CentralLicenseService.ts';
import { CentralTelemetryService } from '../src/services/domains/licensing/CentralTelemetryService.ts';

const root = globalThis as any;
root.window.ceramisys = root.window.ceramisys || {};
const centralApi = root.window.ceramisys.central || {};
const previousCentralRequest = centralApi.request;
let activated = false;
let configured = true;

function resetLicense(storage: Storage = globalThis.localStorage): void {
  storage.removeItem('central_device_credential');
  storage.removeItem('central_server_url');
  storage.removeItem('central_last_validated_at');
  storage.removeItem('central_first_run_activated');
  activated = false;
  configured = true;
}

function fakeCentralRequest(handler: () => Promise<any> | any): void {
  root.window.ceramisys = root.window.ceramisys || {};
  root.window.ceramisys.central = root.window.ceramisys.central || {};
  root.window.ceramisys.central.request = async () => {
    const response = await handler();
    return { ok: response.ok, status: response.status, body: await response.json() };
  };
}

function restoreCentralRequest(): void {
  root.window.ceramisys.central.request = previousCentralRequest;
}

root.window.ceramisys.central = {
  ...centralApi,
  getServerUrl: async () => configured ? 'https://license.example.com' : '',
  getStatus: async () => ({ configured, activated }),
  clearCredential: async () => { activated = false; return { ok: true }; },
};

test('activation gate requires the main-process credential, not a leftover UI flag', async () => {
  resetLicense();
  globalThis.localStorage.setItem('central_first_run_activated', '1');
  assert.equal(await CentralLicenseService.hasCompletedFirstRunActivation(), false);

  activated = true;
  assert.equal(await CentralLicenseService.hasCompletedFirstRunActivation(), true);

  await CentralLicenseService.clearActivation();
  assert.equal(await CentralLicenseService.hasCompletedFirstRunActivation(), false);
});

test('license validation fails closed without a credential or after a definitive rejection', async () => {
  resetLicense();
  assert.equal(await CentralLicenseService.validate(), false);

  activated = true;
  fakeCentralRequest(() => ({ ok: false, status: 401, json: async () => ({}) }));
  try {
    assert.equal(await CentralLicenseService.validate(), false);
  } finally {
    restoreCentralRequest();
  }
});

test('license validation succeeds and tolerates a temporary outage only within the grace window', async () => {
  resetLicense();
  activated = true;

  fakeCentralRequest(() => ({ ok: true, status: 200, json: async () => ({}) }));
  assert.equal(await CentralLicenseService.validate(), true);
  restoreCentralRequest();

  fakeCentralRequest(() => { throw new Error('offline'); });
  try {
    assert.equal(await CentralLicenseService.validate(), true, 'still inside the grace window');
  } finally {
    restoreCentralRequest();
  }
});

test('license validation fails closed once the offline grace window expires', async () => {
  resetLicense();
  activated = true;
  globalThis.localStorage.setItem('central_last_validated_at', String(Date.now() - 15 * 24 * 60 * 60 * 1000));

  fakeCentralRequest(() => { throw new Error('offline'); });
  try {
    assert.equal(await CentralLicenseService.validate(), false);
  } finally {
    restoreCentralRequest();
  }
});

test('signed configuration cannot be accepted when its signature is unverifiable', () => {
  // keep this test independent: no network, no cached key
  return CentralLicenseService.verifyConfig({
    schemaVersion: 1,
    configurationVersion: 1,
    config: { modules: [] },
    signature: 'not-a-real-signature',
  }).then((valid) => {
    assert.equal(valid, false);
  });
});

test('fetchConfig does not cache configuration whose signature cannot be verified', async () => {
  resetLicense();
  configured = true;
  activated = true;
  globalThis.localStorage.removeItem('central_cached_config');
  const paths: string[] = [];
  root.window.ceramisys.central.request = async (request: { path: string }) => {
    paths.push(request.path);
    return {
      ok: true,
      status: 200,
      body: request.path.endsWith('/current')
        ? { schemaVersion: 1, configurationVersion: 9, config: { modules: [] }, signature: 'invalid' }
        : { publicKey: 'invalid' },
    };
  };

  try {
    assert.equal(await CentralLicenseService.fetchConfig(), null);
    assert.equal(globalThis.localStorage.getItem('central_cached_config'), null);
    assert.deepEqual(paths, ['/api/v1/configuration/current', '/api/v1/configuration/public-key']);
  } finally {
    restoreCentralRequest();
  }
});

test('central releases surface only the latest version newer than the installed one', async () => {
  resetLicense();
  configured = true;
  activated = true;
  globalThis.localStorage.removeItem('central_cached_config');

  fakeCentralRequest(() => ({
    ok: true,
    status: 200,
    json: async () => [
      {
        id: 'rel_1', version: '1.1.4', release_notes: 'current build', download_url: '',
        min_required_version: '0.0.0', is_mandatory: false, created_at: '2026-11-01T00:00:00Z',
      },
      {
        id: 'rel_2', version: '1.1.3', release_notes: 'older build', download_url: '',
        min_required_version: '0.0.0', is_mandatory: false, created_at: '2026-10-20T00:00:00Z',
      },
      {
        id: 'rel_3', version: '1.2.0', release_notes: '- جديدة ميزة\n- إصلاح', download_url: 'https://github.com/dfgrgre3/ma3rad/releases/download/v1.2.0/CeramiSys-Setup-1.2.0-x64.exe',
        min_required_version: '1.1.0', is_mandatory: true, created_at: '2026-11-06T00:00:00Z',
      },
    ],
  }));

  try {
    const update = await CentralTelemetryService.checkForUpdates('1.1.4');
    assert.equal(update?.version, '1.2.0', 'only strictly newer releases are surfaced');
    assert.equal(update?.is_mandatory, 1);
    assert.equal(update?.release_notes, '- جديدة ميزة\n- إصلاح');

    const current = await CentralTelemetryService.checkForUpdates('1.2.0');
    assert.equal(current, null, 'the installed version never reports itself as an update');
  } finally {
    restoreCentralRequest();
  }
});

test('central error telemetry is skipped when the secured Electron bridge is unavailable', async () => {
  const central = root.window.ceramisys.central;
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  root.window.ceramisys.central = undefined;
  console.warn = (...args) => { warnings.push(args); };

  try {
    await assert.doesNotReject(() => CentralTelemetryService.reportError({
      title: 'Renderer error',
      description: 'Bridge is unavailable',
    }));
    assert.equal(warnings.length, 0, 'missing Electron bridge is an expected no-op');
  } finally {
    root.window.ceramisys.central = central;
    console.warn = originalWarn;
  }
});
