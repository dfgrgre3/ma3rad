import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CentralLicenseService } from '../src/services/CentralLicenseService.ts';

const realFetch = globalThis.fetch;

function resetLicense(storage: Storage = globalThis.localStorage): void {
  storage.removeItem('central_device_credential');
  storage.removeItem('central_last_validated_at');
  storage.removeItem('central_first_run_activated');
}

function fakeFetch(handler: () => Promise<any> | any): void {
  (globalThis as any).fetch = async () => handler();
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
  fakeFetch(() => ({ ok: false, status: 401, json: async () => ({}) }));
  try {
    assert.equal(await CentralLicenseService.validate(), false);
  } finally {
    (globalThis as any).fetch = realFetch;
  }
});

test('license validation succeeds and tolerates a temporary outage only within the grace window', async () => {
  resetLicense();
  CentralLicenseService.setServerUrl('https://license.example.com');
  CentralLicenseService.setCredential('cred-123');

  fakeFetch(() => ({ ok: true, status: 200, json: async () => ({}) }));
  assert.equal(await CentralLicenseService.validate(), true);
  (globalThis as any).fetch = realFetch;

  fakeFetch(() => { throw new Error('offline'); });
  try {
    assert.equal(await CentralLicenseService.validate(), true, 'still inside the grace window');
  } finally {
    (globalThis as any).fetch = realFetch;
  }
});

test('license validation fails closed once the offline grace window expires', async () => {
  resetLicense();
  CentralLicenseService.setServerUrl('https://license.example.com');
  CentralLicenseService.setCredential('cred-123');
  globalThis.localStorage.setItem('central_last_validated_at', String(Date.now() - 15 * 24 * 60 * 60 * 1000));

  fakeFetch(() => { throw new Error('offline'); });
  try {
    assert.equal(await CentralLicenseService.validate(), false);
  } finally {
    (globalThis as any).fetch = realFetch;
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
