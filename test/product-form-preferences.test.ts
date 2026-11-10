import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { ProductFormPreferencesService } from '../src/services/domains/products/ProductFormPreferencesService.ts';

test('product form defaults and tone choices persist in the database and can be cleared', async () => {
  await DatabaseManager.getInstance().initialize();
  AuthService.login('admin', 'admin123');

  const service = new ProductFormPreferencesService();
  const tone = `test-tone-${Date.now()}`;
  service.saveField('tone', tone);
  assert.equal(service.getPreferences().tone, tone);

  service.saveField('color', 'حليبي');
  service.replacePreferences({ tone });
  assert.deepEqual(service.getPreferences(), { tone });

  service.clearField('tone');
  assert.equal(Object.prototype.hasOwnProperty.call(service.getPreferences(), 'tone'), false);
  assert.deepEqual(service.getPreferences(), {});

  assert.equal(service.addTone(tone), tone);
  assert.ok(service.getTones().includes(tone));
  assert.throws(() => service.addTone(tone), /موجود بالفعل/);

  service.saveField('tone', tone);
  service.deleteTone(tone);
  assert.ok(!service.getTones().includes(tone));
  assert.equal(Object.prototype.hasOwnProperty.call(service.getPreferences(), 'tone'), false);
});
