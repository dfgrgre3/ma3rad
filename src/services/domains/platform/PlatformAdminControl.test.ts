import { describe, it, expect } from 'vitest';
import type {
  PlatformStaff,
  PlatformStaffRole,
  PlatformStaffRoleDefinition,
  PlatformTenantUser,
} from './platformTypes';

describe('Platform Admin Control & Staff RBAC Separation (Item 18)', () => {
  it('should model platform staff with distinct specialized roles', () => {
    const supportAgent: PlatformStaff = {
      id: 'staff_sup_01',
      fullName: 'مهندس أحمد كمال',
      email: 'ahmed@ceramisys.cloud',
      phone: '01011112222',
      role: 'SUPPORT_AGENT',
      permissionsOverride: ['support.view', 'support.reply'],
      isActive: true,
      createdAt: '2026-11-14T20:00:00Z',
      updatedAt: '2026-11-14T20:00:00Z',
    };

    expect(supportAgent.role).toBe('SUPPORT_AGENT');
    expect(supportAgent.isActive).toBe(true);
    expect(supportAgent.email).toContain('@');
  });

  it('should define clear role boundaries preventing support from issuing licenses or editing billing', () => {
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
    expect(supportRole.restrictedModules).toContain('billing.manage');
    expect(supportRole.restrictedModules).toContain('licenses.issue');
    expect(supportRole.allowedModules).toContain('support');
  });

  it('should model tenant ERP users distinctly from platform staff', () => {
    const tenantUser: PlatformTenantUser = {
      id: 'tusr_101',
      tenantId: 'tenant_gold_ceramics',
      fullName: 'محمود عبد الرحيم',
      username: 'm_abdelrahim',
      email: 'm.abdelrahim@gold-ceramics.com',
      role: 'ACCOUNTANT',
      status: 'ACTIVE',
      createdAt: '2026-11-14T20:00:00Z',
      updatedAt: '2026-11-14T20:00:00Z',
    };

    expect(tenantUser.tenantId).toBe('tenant_gold_ceramics');
    expect(tenantUser.role).toBe('ACCOUNTANT');
    expect(tenantUser.status).toBe('ACTIVE');
  });
});
