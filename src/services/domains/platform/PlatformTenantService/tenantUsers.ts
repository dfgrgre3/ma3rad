import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { provisioningQueueService } from '../ProvisioningQueueService';
import { provisioningExecutorService } from '../ProvisioningExecutorService';
import type {
  PlatformTenantUser,
  PlatformTenantUserDirectoryEntry,
  PlatformTenantUserInput,
  PlatformTenantUserProvisioningResult,
} from '../platformTypes';
import { nowIso, generateTemporaryPassword, generateActivationCode, addDays } from '../platformUtils';
import type { TenantServiceContext } from './context';
import { generateUsername } from './helpers';
import { mapTenantUser } from './mappers';

export function listTenantUsers(ctx: TenantServiceContext, tenantId: string): PlatformTenantUser[] {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.view');
  const rows = ctx.db.query<any>('SELECT * FROM platform_tenant_users WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId]);
  return rows.map(mapTenantUser);
}

export function listAllTenantUsers(
  ctx: TenantServiceContext,
  filters: { tenantId?: string; provisioningStatus?: string; status?: string; search?: string } = {},
): PlatformTenantUserDirectoryEntry[] {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.view');
  const tenants = ctx.db.query<any>('SELECT id, name, code FROM platform_tenants ORDER BY name ASC');
  const tenantName = new Map<string, { name: string; code: string | null }>();
  for (const t of tenants) tenantName.set(String(t.id), { name: String(t.name ?? t.id), code: t.code ?? null });

  const tenantIds = filters.tenantId ? [filters.tenantId] : [...tenantName.keys()];
  const result: PlatformTenantUserDirectoryEntry[] = [];
  for (const tenantId of tenantIds) {
    let sql = 'SELECT * FROM platform_tenant_users WHERE tenant_id = ?';
    const params: any[] = [tenantId];
    if (filters.provisioningStatus) { sql += ' AND provisioning_status = ?'; params.push(filters.provisioningStatus); }
    if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
    if (filters.search) {
      sql += ' AND (full_name LIKE ? OR username LIKE ? OR email LIKE ?)';
      const like = `%${filters.search}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY created_at DESC';
    for (const row of ctx.db.query<any>(sql, params)) {
      const meta = tenantName.get(tenantId);
      result.push({ ...mapTenantUser(row), tenantName: meta?.name ?? tenantId, tenantCode: meta?.code ?? null });
    }
  }
  return result;
}

export function createTenantUser(ctx: TenantServiceContext, tenantId: string, input: PlatformTenantUserInput): PlatformTenantUserProvisioningResult {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const tenant = ctx.getTenant(tenantId);
  if (!tenant) throw new Error('العميل غير موجود.');

  const fullName = input.fullName.trim();
  if (fullName.length < 2) throw new Error('اسم المستخدم مطلوب (حرفان على الأقل).');

  let username = input.username?.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24);
  if (!username) {
    username = generateUsername(ctx.db, fullName, tenantId);
  } else {
    const unique = username;
    let conflict = ctx.db.query<any>('SELECT 1 FROM platform_tenant_users WHERE tenant_id = ? AND username = ?', [tenantId, unique])[0];
    let index = 2;
    while (conflict) {
      username = `${unique}${index}`;
      conflict = ctx.db.query<any>('SELECT 1 FROM platform_tenant_users WHERE tenant_id = ? AND username = ?', [tenantId, username])[0];
      index++;
    }
  }

  const id = `tu_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();
  const provisionIdentity = input.provisionIdentity !== false;
  const mode: 'INVITE' | 'DIRECT_CREATE' = input.provisioningMode === 'INVITE' ? 'INVITE' : 'DIRECT_CREATE';
  const inviteCode = generateActivationCode();
  const temporaryPassword = input.password || generateTemporaryPassword();
  const inviteCodeHash = bcrypt.hashSync(inviteCode, 10);
  const tempPasswordHash = bcrypt.hashSync(temporaryPassword, 10);
  const inviteExpiresAt = addDays(new Date(), 7).toISOString();
  const provisioningStatus = !provisionIdentity ? 'DIRECTORY_ONLY' : mode === 'INVITE' ? 'INVITED' : 'PENDING';
  const status = provisionIdentity && mode === 'INVITE' ? 'INVITED' : 'ACTIVE';

  ctx.db.run(
    `INSERT INTO platform_tenant_users
      (id, tenant_id, username, full_name, email, phone, role, status, notes, provisioning_status, provisioning_mode, scope,
       invite_code, temporary_password, invite_expires_at, password_hash, is_active, provisioned, identity_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, ?)`,
    [id, tenantId, username, fullName, input.email?.trim() ?? null, input.phone?.trim() ?? null,
     input.role ?? 'USER', status, input.notes ?? null, provisioningStatus, provisionIdentity ? mode : null,
     input.scope ?? null, provisionIdentity ? inviteCodeHash : null, provisionIdentity ? tempPasswordHash : null,
     provisionIdentity ? inviteExpiresAt : null, tempPasswordHash, now, now]
  );

  if (provisionIdentity) {
    provisioningQueueService.enqueue(tenantId, id, 'TENANT_USER_PROVISION', {
      tenantId,
      tenantUserId: id,
      username,
      fullName,
      email: input.email?.trim() ?? null,
      phone: input.phone?.trim() ?? null,
      role: input.role ?? 'USER',
      scope: input.scope ?? null,
      mode,
    }, inviteExpiresAt);
    provisioningExecutorService.requestDrain();
  }

  ctx.audit('إنشاء مستخدم عميل', 'TENANT_USER', id, { tenantId, username, role: input.role ?? 'USER', provisioningStatus });

  return {
    user: ctx.getTenantUser(id)!,
    inviteCode: provisionIdentity ? inviteCode : null,
    temporaryPassword,
    loginUrl: `${ctx.setting('platform.clientUrl', 'https://app.ceramisys.com')}/login`,
    provisioned: false,
    message: provisionIdentity
      ? (mode === 'INVITE' ? 'تم إنشاء الدعوة بنجاح' : 'تم إنشاء طلب التوفير بنجاح')
      : 'تم إنشاء المستخدم في الدليل فقط',
  };
}

export function updateTenantUser(ctx: TenantServiceContext, id: string, input: PlatformTenantUserInput): PlatformTenantUser {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const existing = ctx.getTenantUser(id);
  if (!existing) throw new Error('المستخدم غير موجود.');

  const fullName = input.fullName.trim();
  if (fullName.length < 2) throw new Error('اسم المستخدم مطلوب.');

  let username = existing.username;
  if (input.username?.trim()) {
    username = input.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24);
    if (username !== existing.username) {
      const conflict = ctx.db.query<any>('SELECT 1 FROM platform_tenant_users WHERE tenant_id = ? AND username = ? AND id <> ?', [existing.tenantId, username, id])[0];
      if (conflict) throw new Error('اسم المستخدم مستخدم بالفعل لهذا العميل.');
    }
  }

  const now = nowIso();
  ctx.db.run(
    `UPDATE platform_tenant_users SET
       username = ?, full_name = ?, email = ?, phone = ?, role = ?, updated_at = ?
     WHERE id = ?`,
    [username, fullName, input.email?.trim() ?? null, input.phone?.trim() ?? null, input.role ?? existing.role, now, id]
  );

  ctx.audit('تحديث مستخدم عميل', 'TENANT_USER', id, { tenantId: existing.tenantId });

  const updated = ctx.getTenantUser(id);
  if (!updated) throw new Error('فشل تحديث المستخدم.');
  return updated;
}

export function setTenantUserActive(ctx: TenantServiceContext, id: string, active: boolean): PlatformTenantUser {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const existing = ctx.getTenantUser(id);
  if (!existing) throw new Error('المستخدم غير موجود.');

  const now = nowIso();
  ctx.db.run('UPDATE platform_tenant_users SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, now, id]);

  ctx.audit(active ? 'تفعيل مستخدم عميل' : 'تعطيل مستخدم عميل', 'TENANT_USER', id, { tenantId: existing.tenantId });

  const updated = ctx.getTenantUser(id);
  if (!updated) throw new Error('فشل تحديث المستخدم.');
  return updated;
}

export function deleteTenantUser(ctx: TenantServiceContext, id: string): void {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.delete');

  const existing = ctx.getTenantUser(id);
  if (!existing) throw new Error('المستخدم غير موجود.');

  ctx.db.run('DELETE FROM platform_tenant_users WHERE id = ?', [id]);
  ctx.audit('حذف مستخدم عميل', 'TENANT_USER', id, { tenantId: existing.tenantId });
}

export function resendTenantUserInvite(ctx: TenantServiceContext, id: string): PlatformTenantUserProvisioningResult {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const existing = ctx.getTenantUser(id);
  if (!existing) throw new Error('المستخدم غير موجود.');

  const raw = ctx.db.query<any>('SELECT * FROM platform_tenant_users WHERE id = ?', [id])[0];
  if (!raw) throw new Error('المستخدم غير موجود.');

  const inviteCode = generateActivationCode();
  const temporaryPassword = generateTemporaryPassword();
  const inviteCodeHash = bcrypt.hashSync(inviteCode, 10);
  const tempPasswordHash = bcrypt.hashSync(temporaryPassword, 10);
  const inviteExpiresAt = addDays(new Date(), 7).toISOString();
  const now = nowIso();

  ctx.db.run(
    `UPDATE platform_tenant_users
       SET invite_code = ?, temporary_password = ?, password_hash = ?, invite_expires_at = ?,
           provisioning_status = 'INVITED', status = 'INVITED', last_error = NULL, updated_at = ?
     WHERE id = ?`,
    [inviteCodeHash, tempPasswordHash, tempPasswordHash, inviteExpiresAt, now, id]
  );

  provisioningQueueService.enqueue(String(raw.tenant_id ?? raw.tenantId), id, 'TENANT_USER_PROVISION', {
    tenantId: String(raw.tenant_id ?? raw.tenantId),
    tenantUserId: id,
    username: raw.username ?? null,
    fullName: raw.full_name ?? raw.fullName ?? null,
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    role: raw.role ?? null,
    scope: raw.scope ?? null,
    mode: 'INVITE',
  }, inviteExpiresAt);
  provisioningExecutorService.requestDrain();

  ctx.audit('إعادة إرسال دعوة مستخدم عميل', 'TENANT_USER', id, { tenantId: existing.tenantId });

  return {
    user: ctx.getTenantUser(id)!,
    inviteCode,
    temporaryPassword,
    loginUrl: `${ctx.setting('platform.clientUrl', 'https://app.ceramisys.com')}/login`,
    provisioned: false,
    message: 'تم إعادة إرسال الدعوة بنجاح',
  };
}

export function markTenantUserProvisioned(ctx: TenantServiceContext, id: string, identityUserId?: string): PlatformTenantUser {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const existing = ctx.getTenantUser(id);
  if (!existing) throw new Error('المستخدم غير موجود.');

  const now = nowIso();
  ctx.db.run(
    `UPDATE platform_tenant_users
       SET provisioned = 1, provisioning_status = 'PROVISIONED', provisioned_at = ?, identity_user_id = COALESCE(?, identity_user_id), updated_at = ?
     WHERE id = ?`,
    [now, identityUserId ?? null, now, id]
  );

  ctx.audit('وضع علامة مستخدم عميل كمُجهز', 'TENANT_USER', id, { tenantId: existing.tenantId, identityUserId });

  const updated = ctx.getTenantUser(id);
  if (!updated) throw new Error('فشل تحديث المستخدم.');
  return updated;
}
