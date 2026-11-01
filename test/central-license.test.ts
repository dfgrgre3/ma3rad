import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CentralLicenseService } from '../src/services/CentralLicenseService.ts';

const root = globalThis as any;
const previousCentralRequest = root.window?.ceramisys?.central?.request;

function resetLicense(storage: Storage = globalThis.localStorage): void {
  storage.removeItem('central_device_credential');
  storage.removeItem('central_last_validated_at');
  storage.removeItem('central_first_run_activated');
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
  if (previousCentralRequest) root.window.ceramisys.central.request = previousCentralRequest;
  else delete root.window.ceramisys?.central?.request;
}

test('activation gate requires the device credential, not a leftover UI flag', () => {
  resetLicense();
  globalThis.localStorage.setItem('central_first_run_activated', '1');
  assert.equal(CentralLicenseService.hasCompletedFirstRunActivation(), false);

  CentralLicenseService.setCredential('cred-123');
  assert.equal(CentralLicenseService.hasCompletedFirstRunActivation(), true);

  CentralLicenseService.clearActivation();
  assert.equal(CentralLicenseService.hasCompletedFirstRunActivation(), false);
});

test('license validation fails closed without a credential or after a definitive rejection', async () => {
  resetLicense();
  assert.equal(await CentralLicenseService.validate(), false);

  CentralLicenseService.setServerUrl('https://license.example.com');
  CentralLicenseService.setCredential('cred-123');
  fakeCentralRequest(() => ({ ok: false, status: 401, json: async () => ({}) }));
  try {
    assert.equal(await CentralLicenseService.validate(), false);
  } finally {
    restoreCentralRequest();
  }
});

test('license validation succeeds and tolerates a temporary outage only within the grace window', async () => {
  resetLicense();
  CentralLicenseService.setServerUrl('https://license.example.com');
  CentralLicenseService.setCredential('cred-123');

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
  CentralLicenseService.setServerUrl('https://license.example.com');
  CentralLicenseService.setCredential('cred-123');
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
  CentralLicenseService.setServerUrl('https://license.example.com');
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
