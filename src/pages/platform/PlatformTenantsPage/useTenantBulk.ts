import React from 'react';
import { platformAdminService, PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import type {
  PlatformTenant,
  PlatformTenantProfile,
  PlatformTenantStatus,
} from '../../../services/domains/platform/platformTypes';
import { useToast } from '../../../components/ui/Toast';
import { downloadCsv } from '../components/PlatformUI';
import { activationText, buildActivation } from './activation';

interface UseTenantBulkOptions {
  tenants: PlatformTenant[];
  centralActive: boolean;
  detailId: string | null;
  loadProfile: (id: string) => void;
  load: () => void;
}

export function useTenantBulk({ tenants, centralActive, detailId, loadProfile, load }: UseTenantBulkOptions) {
  const toast = useToast();

  // Bulk operations state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkActionOpen, setBulkActionOpen] = React.useState(false);
  const [bulkActionType, setBulkActionType] = React.useState<'status' | 'plan' | 'activation' | 'export'>('status');
  const [bulkStatus, setBulkStatus] = React.useState<PlatformTenantStatus>('SUSPENDED');
  const [bulkPlanId, setBulkPlanId] = React.useState('');
  const [bulkMonths, setBulkMonths] = React.useState(12);
  const [bulkChannels, setBulkChannels] = React.useState<string[]>(['EMAIL']);
  const [bulkWorking, setBulkWorking] = React.useState(false);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(tenants.map(t => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const executeBulkAction = async () => {
    if (selectedIds.size === 0) {
      toast.error('لا يوجد عملاء محددون');
      return;
    }
    setBulkWorking(true);
    try {
      const ids = Array.from(selectedIds);
      if (centralActive) {
        if (bulkActionType === 'status') {
          let success = 0;
          const failed: Array<{ tenantId: string; error: string }> = [];
          for (const id of ids) {
            try { await centralPlatformClient.setTenantStatus(id, bulkStatus); success += 1; }
            catch (err) { failed.push({ tenantId: id, error: err instanceof Error ? err.message : 'فشل' }); }
          }
          toast.success('اكتمل تغيير الحالة', `نجح: ${success}، فشل: ${failed.length}`);
          failed.forEach((f) => toast.error(`فشل ${f.tenantId}`, f.error));
        } else if (bulkActionType === 'plan') {
          if (!bulkPlanId) { toast.error('اختر باقة'); setBulkWorking(false); return; }
          let success = 0;
          const failed: Array<{ tenantId: string; error: string }> = [];
          for (const id of ids) {
            try {
              await centralPlatformClient.changeSubscriptionPlan(id, bulkPlanId, { months: bulkMonths });
              success += 1;
            } catch (err) { failed.push({ tenantId: id, error: err instanceof Error ? err.message : 'فشل' }); }
          }
          toast.success('اكتمل تغيير الباقة', `نجح: ${success}، فشل: ${failed.length}`);
          failed.forEach((f) => toast.error(`فشل ${f.tenantId}`, f.error));
        } else if (bulkActionType === 'activation') {
          const blocks: string[] = [];
          const failed: Array<{ tenantId: string; error: string }> = [];
          for (const id of ids) {
            try {
              const profileData: any = await centralPlatformClient.getTenantProfile(id);
              blocks.push(activationText(buildActivation(profileData as PlatformTenantProfile, null)));
            } catch (err) { failed.push({ tenantId: id, error: err instanceof Error ? err.message : 'فشل' }); }
          }
          if (blocks.length) {
            const blob = new Blob([blocks.join('\n\n---\n\n')], { type: 'text/plain;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `platform-activations-${new Date().toISOString().slice(0, 10)}.txt`;
            link.click();
            URL.revokeObjectURL(link.href);
          }
          toast.success('تم تجهيز بيانات التفعيل', `نجح: ${blocks.length}، فشل: ${failed.length}`);
          failed.forEach((f) => toast.error(`فشل ${f.tenantId}`, f.error));
        } else if (bulkActionType === 'export') {
          const selected = tenants.filter((t) => selectedIds.has(t.id));
          downloadCsv(`platform-customers-bulk-${new Date().toISOString().slice(0, 10)}.csv`, [
            ['رقم العميل', 'Tenant ID', 'الشركة', 'النشاط', 'المسؤول', 'الهاتف', 'البريد', 'الدولة', 'المدينة', 'العنوان', 'تاريخ التسجيل', 'الباقة', 'الحالة', 'بداية الاشتراك', 'نهاية الاشتراك', 'الأجهزة المسموحة', 'الأجهزة المستخدمة', 'الفروع'],
            ...selected.map((tenant) => [
              tenant.code, tenant.id, tenant.name, tenant.businessType ?? '', tenant.contactName ?? '',
              tenant.phone ?? '', tenant.email ?? '', tenant.country ?? '', tenant.city ?? '', tenant.address ?? '',
              tenant.createdAt, tenant.planName ?? '', PLATFORM_TENANT_STATUS_LABELS[tenant.status],
              tenant.subscriptionStartedAt ?? '', tenant.subscriptionExpiresAt ?? '',
              tenant.devicesLimit, tenant.devicesUsed ?? 0, tenant.branchesLimit,
            ]),
          ]);
          toast.success('تم تصدير البيانات', `${selected.length} عميل`);
        }
        setBulkActionOpen(false);
        setSelectedIds(new Set());
        load();
        if (detailId) loadProfile(detailId);
        return;
      }
      switch (bulkActionType) {
        case 'status': {
          const result = platformAdminService.bulkChangeTenantStatus({ tenantIds: ids, status: bulkStatus });
          toast.success('اكتمل تغيير الحالة', `نجح: ${result.success}، فشل: ${result.failed.length}`);
          if (result.failed.length > 0) {
            result.failed.forEach(f => toast.error(`فشل ${f.tenantId}`, f.error));
          }
          break;
        }
        case 'plan': {
          if (!bulkPlanId) { toast.error('اختر باقة'); return; }
          const result = await platformAdminService.bulkChangeTenantPlan({ tenantIds: ids, planId: bulkPlanId, months: bulkMonths });
          toast.success('اكتمل تغيير الباقة', `نجح: ${result.success}، فشل: ${result.failed.length}`);
          if (result.failed.length > 0) {
            result.failed.forEach(f => toast.error(`فشل ${f.tenantId}`, f.error));
          }
          break;
        }
        case 'activation': {
          const result = platformAdminService.bulkSendActivation({ tenantIds: ids });
          toast.success('تم إرسال بيانات التفعيل', `نجح: ${result.success}، فشل: ${result.failed.length}`);
          if (result.failed.length > 0) {
            result.failed.forEach(f => toast.error(`فشل ${f.tenantId}`, f.error));
          }
          break;
        }
        case 'export': {
          const csv = platformAdminService.bulkExportTenants({ tenantIds: ids });
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `platform-customers-bulk-${new Date().toISOString().slice(0,10)}.csv`;
          link.click();
          URL.revokeObjectURL(link.href);
          toast.success('تم تصدير البيانات', `${ids.length} عميل`);
          break;
        }
      }
      setBulkActionOpen(false);
      setSelectedIds(new Set());
      load();
      if (detailId) loadProfile(detailId);
    } catch (err) {
      toast.error('فشل العملية المجمعة', err instanceof Error ? err.message : undefined);
    } finally {
      setBulkWorking(false);
    }
  };

  return {
    selectedIds,
    setSelectedIds,
    bulkActionOpen,
    setBulkActionOpen,
    bulkActionType,
    setBulkActionType,
    bulkStatus,
    setBulkStatus,
    bulkPlanId,
    setBulkPlanId,
    bulkMonths,
    setBulkMonths,
    bulkChannels,
    setBulkChannels,
    bulkWorking,
    handleSelectAll,
    handleSelectOne,
    executeBulkAction,
  };
}

export type TenantBulkState = ReturnType<typeof useTenantBulk>;
