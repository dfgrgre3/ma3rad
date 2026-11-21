import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { platformPolicyService } from '../src/services/domains/platform/PlatformPolicyService.ts';

function ensurePlatformOwner(db: DatabaseManager) {
  const existing = db.query<any>(`SELECT id FROM users WHERE username = 'platform'`)[0];
  if (existing) return;
  const passwordHash = bcrypt.hashSync('Platform@2026', 10);
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
     VALUES ('usr_platform_test', 'platform', ?, 'مالك المنصة', 'SUPER_ADMIN', 1, ?, ?)`,
    [passwordHash, now, now]
  );
}

test('policies service: seed, draft, submit, approve, versions, restore, retention, export', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  ensurePlatformOwner(db);
  AuthService.login('platform', 'Platform@2026');

  // Seed creates the six standard documents.
  const docs = platformPolicyService.listPolicyDocuments();
  assert.equal(docs.length, 6);
  assert.ok(docs.some((d) => d.slug === 'terms'));

  // terms/privacy migrate from legacy settings keys when present.
  db.run(`INSERT OR REPLACE INTO platform_settings (key, value) VALUES ('policy.terms', 'شروط قديمة')`);
  // Re-seed is a no-op once documents exist; verify terms doc exists regardless.
  const terms = platformPolicyService.getPolicyDocument('terms');
  assert.equal(terms.slug, 'terms');

  // Draft → submit → approve → published version.
  const saved = platformPolicyService.savePolicyDraft({
    slug: 'terms',
    content: 'شروط جديدة كلياً',
    changeSummary: 'إصدار أول',
  });
  assert.equal(saved.status, 'DRAFT');

  const submitted = platformPolicyService.submitPolicyForApproval('terms');
  assert.equal(submitted.status, 'PENDING_APPROVAL');

  const published = platformPolicyService.approvePolicyPublish('terms');
  assert.equal(published.status, 'PUBLISHED');
  assert.equal(published.publishedContent, 'شروط جديدة كلياً');
  assert.equal(published.versions.length, 1);
  assert.equal(published.versions[0].version, 1);
  assert.equal(published.versions[0].isCurrent, true);

  // Second publish creates version 2 and flips is_current.
  platformPolicyService.savePolicyDraft({ slug: 'terms', content: 'شروط v2' });
  platformPolicyService.submitPolicyForApproval('terms');
  const v2 = platformPolicyService.approvePolicyPublish('terms');
  assert.equal(v2.currentVersion, 2);
  assert.equal(v2.versions.filter((v) => v.isCurrent).length, 1);

  // Restore v1 → draft diverges from published.
  const restored = platformPolicyService.restorePolicyVersion('terms', 1);
  assert.equal(restored.status, 'DRAFT');
  assert.equal(restored.draftContent, 'شروط جديدة كلياً');

  // Reject path: submit then reject → back to DRAFT with note.
  platformPolicyService.submitPolicyForApproval('terms');
  const rejected = platformPolicyService.rejectPolicy('terms', 'تحتاج مراجعة قانونية');
  assert.equal(rejected.status, 'DRAFT');
  assert.equal(rejected.reviewNote, 'تحتاج مراجعة قانونية');

  // Retention round-trip.
  const retention = platformPolicyService.saveRetentionPolicy({ auditRetentionDays: 400, notificationLogRetentionDays: 60 });
  assert.equal(retention.auditRetentionDays, 400);
  assert.equal(retention.notificationLogRetentionDays, 60);
  const loaded = platformPolicyService.getRetentionPolicy();
  assert.equal(loaded.auditRetentionDays, 400);

  // Export bundle.
  const bundle = platformPolicyService.exportPoliciesBundle();
  assert.equal(bundle.documents.length, 6);
  assert.equal(bundle.retention.auditRetentionDays, 400);

  AuthService.logout();
});
