import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlatformStaff,
  PlatformStaffRole,
  PlatformStaffRoleDefinition,
  PlatformTenantUser,
} from './platformTypes';

test('should model platform staff with distinct specialized roles', () => {
  const supportAgent: PlatformStaff = {
    id: 'staff_sup_01',
    fullName: 'مهندس أحمد كمال',
    email: 'ahmed@ceramisys.cloud',
    phone: '01011112222',
    role: 'SUPPORT_AGENT',
    username: 'ahmed.kamal',
    isActive: true,
    mfaEnabled: false,
    mfaEnforcement: 'off',
    dataScope: 'ALL',
    dataScopeTenantIds: null,
    failedLoginAttempts: 0,
    createdAt: '2026-11-14T20:00:00Z',
    updatedAt: '2026-11-14T20:00:00Z',
  };

  assert.strictEqual(supportAgent.role, 'SUPPORT_AGENT');
  assert.strictEqual(supportAgent.isActive, true);
  assert.ok(supportAgent.email?.includes('@'));
});

test('should define clear role boundaries preventing support from issuing licenses or editing billing', () => {
  const roles: PlatformStaffRoleDefinition[] = [
    {
      role: 'SUPPORT_AGENT',
      title: 'موظف دعم فني',
      description: 'استعراض التذاكر ومساعدة العملاء',
      allowedModules: ['support', 'devices.view'],
      restrictedModules: ['billing.manage', 'licenses.issue', 'plans.manage'],
    },
    {
      role: 'BILLING_SPECIALIST',
      title: 'أخصائي الفواتير',
      description: 'إدارة وتوليد الفواتير',
      allowedModules: ['billing', 'plans.view'],
      restrictedModules: ['operations.manage', 'licenses.issue'],
    },
  ];

  const supportRole = roles.find((r) => r.role === 'SUPPORT_AGENT')!;
  assert.ok(supportRole.restrictedModules?.includes('billing.manage'));
  assert.ok(supportRole.restrictedModules?.includes('licenses.issue'));
  assert.ok(supportRole.allowedModules?.includes('support'));
});

test('should model tenant ERP users distinctly from platform staff', () => {
  const tenantUser: PlatformTenantUser = {
    id: 'tusr_101',
    tenantId: 'tenant_gold_ceramics',
    fullName: 'محمود عبد الرحيم',
    username: 'm_abdelrahim',
    email: 'm.abdelrahim@gold-ceramics.com',
    role: 'ACCOUNTANT',
    status: 'ACTIVE',
    isActive: true,
    provisioningStatus: 'INVITED',
    provisioningMode: 'INVITE',
    identityUserId: 'ident_tusr_101',
    scope: 'BRANCH:main',
    createdAt: '2026-11-14T20:00:00Z',
    updatedAt: '2026-11-14T20:00:00Z',
  };

  assert.strictEqual(tenantUser.tenantId, 'tenant_gold_ceramics');
  assert.strictEqual(tenantUser.role, 'ACCOUNTANT');
  assert.strictEqual(tenantUser.status, 'ACTIVE');
  assert.strictEqual(tenantUser.provisioningStatus, 'INVITED');
  assert.ok(tenantUser.identityUserId);
});
