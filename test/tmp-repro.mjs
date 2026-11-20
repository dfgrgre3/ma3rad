import './integration.setup.ts';
const { DatabaseManager } = await import('../src/database/repositories/databaseManager.ts');
const { PermissionService } = await import('../src/services/domains/auth/PermissionService.ts');
const db = DatabaseManager.getInstance();
await db.initialize();
PermissionService.seed();
const before = new Set(PermissionService.getRolePermissions('MANAGER'));
db.run('DELETE FROM role_permissions WHERE role_code = ?', ['MANAGER']);
for (const p of PermissionService.getCatalog()) {
  db.run('INSERT INTO role_permissions (role_code, permission_code) VALUES (?, ?)', ['MANAGER', p.code]);
}
PermissionService.seed();
const after = new Set(PermissionService.getRolePermissions('MANAGER'));
const added = [...after].filter(c=>!before.has(c));
const removed = [...before].filter(c=>!after.has(c));
console.log('added', added.length, added);
console.log('removed', removed.length, removed);
process.exit(0);
