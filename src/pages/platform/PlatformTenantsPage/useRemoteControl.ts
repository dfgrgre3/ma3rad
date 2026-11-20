import React from 'react';
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import type { PlatformDevice, PlatformTenantOverride } from '../../../services/domains/platform/platformTypes';
import { useToast } from '../../../components/ui/Toast';
import type { TabKey } from './constants';

/** Safely parse a JSON details blob once; returns {} on malformed input. */
const parseDetails = (details?: string | null): Record<string, unknown> => {
  if (!details) return {};
  try {
    const parsed: unknown = JSON.parse(details);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

interface UseRemoteControlOptions {
  detailId: string | null;
  tab: TabKey;
  centralActive: boolean;
  run: (action: () => unknown, message: string) => void;
}

export function useRemoteControl({ detailId, tab, centralActive, run }: UseRemoteControlOptions) {
  const toast = useToast();

  // Remote Control state
  const [remoteDevices, setRemoteDevices] = React.useState<PlatformDevice[]>([]);
  const [remoteConfig, setRemoteConfig] = React.useState<any[]>([]);
  const [remoteHistory, setRemoteHistory] = React.useState<any[]>([]);
  const [remoteControlData, setRemoteControlData] = React.useState<{
    tenant: any;
    appliedConfig: any;
    configPushHistory: any[];
    devices: any[];
    lastSync: any;
  } | null>(null);
  const [configForm, setConfigForm] = React.useState({ key: '', value: '', scope: 'TENANT', targetDeviceIds: [] as string[] });
  const [configSending, setConfigSending] = React.useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = React.useState<string[]>([]);
  const [forceSyncWorking, setForceSyncWorking] = React.useState(false);

  /** Local-mode history: audit entries whose action/details look like config pushes. */
  const loadLocalRemoteHistory = React.useCallback(() => {
    if (!detailId) { setRemoteHistory([]); return; }
    try {
      const logs = platformAdminService.getTenantProfile(detailId).activityLog
        .filter((entry) => entry.entityType === 'CONFIG_PUSH' || entry.action.includes('إعداد') || entry.action.includes('تكوين'))
        .map((entry) => {
          const details = parseDetails(entry.details);
          return {
            id: entry.id,
            type: 'CONFIG_PUSH',
            key: details.key ?? '—',
            value: details.value ?? '—',
            targetCount: details.targetCount ?? 0,
            status: entry.action.includes('نجاح') ? 'SUCCESS' : entry.action.includes('فشل') ? 'FAILED' : 'PENDING',
            error: details.error ?? null,
            result: details.result ?? null,
            createdAt: entry.createdAt,
          };
        });
      setRemoteHistory(logs);
    } catch (err) {
      toast.error('تعذر تحميل السجل', err instanceof Error ? err.message : undefined);
    }
  }, [detailId, toast]);

  const loadRemoteControlData = React.useCallback(() => {
    if (!detailId) { setRemoteControlData(null); return; }
    if (centralActive) {
      centralPlatformClient.getTenantRemoteControl(detailId)
        .then((data: any) => {
          setRemoteControlData(data);
          setRemoteDevices(Array.isArray(data?.devices) ? data.devices : []);
          setRemoteHistory(Array.isArray(data?.configPushHistory) ? data.configPushHistory : []);
          setRemoteConfig(data?.appliedConfig ? [{
            id: data.appliedConfig.id,
            key: data.appliedConfig.key ?? 'applied_config',
            value: data.appliedConfig.value ?? '',
            scope: data.appliedConfig.scope ?? 'TENANT',
            status: 'APPLIED',
            appliedAt: data.appliedConfig.appliedAt,
            createdAt: data.appliedConfig.createdAt,
          }] : []);
        })
        .catch((err) => toast.error('تعذر تحميل بيانات التحكم عن بعد', err instanceof Error ? err.message : undefined));
      return;
    }
    try {
      const data = platformAdminService.getTenantRemoteControl(detailId);
      setRemoteControlData(data);
      setRemoteDevices(platformAdminService.listDevices(detailId));
      loadLocalRemoteHistory();
      try {
        const overrideList = platformAdminService.listTenantOverrides(detailId);
        setRemoteConfig(overrideList.map((o: PlatformTenantOverride) => ({
          id: o.id,
          key: o.code,
          value: o.value || (o.isEnabled ? 'true' : 'false'),
          scope: 'TENANT',
          status: o.isEnabled ? 'APPLIED' : 'DISABLED',
          appliedAt: o.updatedAt,
          createdAt: o.createdAt,
        })));
      } catch {
        setRemoteConfig([]);
      }
    } catch (err) {
      toast.error('تعذر تحميل بيانات التحكم عن بعد', err instanceof Error ? err.message : undefined);
    }
  }, [detailId, toast, centralActive, loadLocalRemoteHistory]);

  const toggleDeviceStatus = (device: PlatformDevice) => {
    if (centralActive) {
      if (device.status === 'ACTIVE') {
        run(() => centralPlatformClient.suspendDevice(device.id), 'تم إيقاف الجهاز');
        return;
      }
      // The central API exposes suspend/release/revoke but no device re-activation.
      toast.error('إعادة تفعيل جهاز غير مدعومة في الوضع المركزي', 'استخدم «تحرير الجهاز» ثم أعد ربطه من العميل.');
      return;
    }
    if (!detailId) return;
    const newStatus = device.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    run(() => {
      platformAdminService.setDeviceStatus(device.id, newStatus);
      loadRemoteControlData();
    }, `تم ${newStatus === 'ACTIVE' ? 'تفعيل' : 'إيقاف'} الجهاز`);
  };

  const pushConfig = () => {
    if (!detailId || !configForm.key.trim()) return;
    if (configForm.scope === 'DEVICE' && selectedDeviceIds.length === 0) {
      toast.error('اختر جهازاً واحداً على الأقل');
      return;
    }
    setConfigSending(true);
    if (centralActive) {
      centralPlatformClient.pushTenantConfig(detailId, {
        key: configForm.key,
        value: configForm.value,
        scope: configForm.scope,
        targetDeviceIds: configForm.scope === 'DEVICE' ? selectedDeviceIds : undefined,
      })
        .then((result: any) => {
          toast.success('تم دفع التكوين', `معرف العملية: ${result?.id ?? ''}`);
          setConfigForm({ ...configForm, key: '', value: '' });
          setSelectedDeviceIds([]);
          loadRemoteControlData();
        })
        .catch((err) => toast.error('فشل دفع التكوين', err instanceof Error ? err.message : undefined))
        .finally(() => setConfigSending(false));
      return;
    }
    try {
      const result = platformAdminService.pushTenantConfig(detailId, {
        [configForm.key]: configForm.value,
        targetDeviceIds: configForm.scope === 'DEVICE' ? selectedDeviceIds : undefined,
      });
      toast.success('تم دفع التكوين', `معرف العملية: ${result.id}`);
      setConfigForm({ ...configForm, key: '', value: '' });
      setSelectedDeviceIds([]);
      loadRemoteControlData();
    } catch (err) {
      toast.error('فشل دفع التكوين', err instanceof Error ? err.message : undefined);
    } finally {
      setConfigSending(false);
    }
  };

  const forceSync = () => {
    if (!detailId) return;
    setForceSyncWorking(true);
    if (centralActive) {
      centralPlatformClient.forceTenantSync(detailId)
        .then(() => {
          toast.success('تم طلب مزامنة إجبارية', 'ستبدأ المزامنة خلال ثوانٍ');
          loadRemoteControlData();
        })
        .catch((err) => toast.error('فشل طلب المزامنة', err instanceof Error ? err.message : undefined))
        .finally(() => setForceSyncWorking(false));
      return;
    }
    try {
      platformAdminService.forceTenantSync(detailId);
      toast.success('تم طلب مزامنة إجبارية', 'ستبدأ المزامنة خلال ثوانٍ');
      loadRemoteControlData();
    } catch (err) {
      toast.error('فشل طلب المزامنة', err instanceof Error ? err.message : undefined);
    } finally {
      setForceSyncWorking(false);
    }
  };

  // Load remote data when detailId changes
  React.useEffect(() => {
    if (detailId && tab === 'remote') {
      loadRemoteControlData();
    }
  }, [detailId, tab, loadRemoteControlData]);

  return {
    remoteDevices,
    remoteConfig,
    remoteHistory,
    remoteControlData,
    configForm,
    setConfigForm,
    configSending,
    selectedDeviceIds,
    setSelectedDeviceIds,
    forceSyncWorking,
    loadRemoteControlData,
    toggleDeviceStatus,
    pushConfig,
    forceSync,
  };
}

export type RemoteControlState = ReturnType<typeof useRemoteControl>;
