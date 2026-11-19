import React from 'react';
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import type { PlatformTenantOverride } from '../../../services/domains/platform/platformTypes';
import { useToast } from '../../../components/ui/Toast';
import type { TabKey } from './constants';

interface UseRemoteControlOptions {
  detailId: string | null;
  tab: TabKey;
  centralActive: boolean;
  run: (action: () => unknown, message: string) => void;
}

export function useRemoteControl({ detailId, tab, centralActive, run }: UseRemoteControlOptions) {
  const toast = useToast();

  // Remote Control state
  const [remoteDevices, setRemoteDevices] = React.useState<any[]>([]);
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

  const loadRemoteDevices = React.useCallback(() => {
    if (!detailId) { setRemoteDevices([]); return; }
    if (centralActive) {
      centralPlatformClient.getTenantRemoteControl(detailId)
        .then((data: any) => setRemoteDevices(Array.isArray(data?.devices) ? data.devices : []))
        .catch(() => setRemoteDevices([]));
      return;
    }
    try {
      const devices = platformAdminService.listDevices().filter((d) => d.tenantId === detailId);
      setRemoteDevices(devices);
    } catch (err) {
      toast.error('تعذر تحميل الأجهزة', err instanceof Error ? err.message : undefined);
    }
  }, [detailId, toast, centralActive]);

  const loadRemoteHistory = React.useCallback(() => {
    if (!detailId) { setRemoteHistory([]); return; }
    if (centralActive) {
      centralPlatformClient.getTenantRemoteControl(detailId)
        .then((data: any) => {
          const history = Array.isArray(data?.configPushHistory) ? data.configPushHistory : [];
          setRemoteHistory(history.map((entry: any) => ({
            id: entry.id,
            type: 'CONFIG_PUSH',
            key: entry.key ?? entry.configKey ?? '—',
            value: entry.value ?? entry.configValue ?? '—',
            targetCount: Array.isArray(entry.targetDeviceIds) ? entry.targetDeviceIds.length : 0,
            status: entry.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
            error: entry.error ?? null,
            result: entry.status === 'APPLIED' ? 'تم التطبيق' : null,
            createdAt: entry.createdAt ?? entry.appliedAt,
          })));
        })
        .catch(() => setRemoteHistory([]));
      return;
    }
    try {
      // Get audit logs related to config pushes for this tenant
      const logs = platformAdminService.getTenantProfile(detailId).activityLog
        .filter((entry) => entry.entityType === 'CONFIG_PUSH' || entry.action.includes('إعداد') || entry.action.includes('تكوين'))
        .map((entry) => ({
          id: entry.id,
          type: 'CONFIG_PUSH',
          key: entry.details ? JSON.parse(entry.details).key : '—',
          value: entry.details ? JSON.parse(entry.details).value : '—',
          targetCount: entry.details ? JSON.parse(entry.details).targetCount : 0,
          status: entry.action.includes('نجاح') ? 'SUCCESS' : entry.action.includes('فشل') ? 'FAILED' : 'PENDING',
          error: entry.details ? JSON.parse(entry.details).error : null,
          result: entry.details ? JSON.parse(entry.details).result : null,
          createdAt: entry.createdAt,
        }));
      setRemoteHistory(logs);
    } catch (err) {
      toast.error('تعذر تحميل السجل', err instanceof Error ? err.message : undefined);
    }
  }, [detailId, toast, centralActive]);

  // Load remote data when detailId changes
  React.useEffect(() => {
    if (detailId) {
      loadRemoteDevices();
      loadRemoteHistory();
      // Load existing overrides as applied config
      const loadOverrides = centralActive
        ? centralPlatformClient.listTenantOverrides(detailId)
        : Promise.resolve(platformAdminService.listTenantOverrides(detailId));
      loadOverrides
        .then((overrideList: PlatformTenantOverride[]) => {
          const configs = overrideList.map((o: any) => ({
            id: o.id,
            key: o.code,
            value: o.value || (o.isEnabled ? 'true' : 'false'),
            scope: 'TENANT',
            status: o.isEnabled ? 'APPLIED' : 'DISABLED',
            appliedAt: o.updatedAt,
            createdAt: o.createdAt,
          }));
          setRemoteConfig(configs);
        })
        .catch(() => {
          // Remote config fetch is best-effort; ignore failures.
        });
    }
  }, [detailId, loadRemoteDevices, loadRemoteHistory, centralActive]);

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
      setRemoteDevices(data.devices);
      setRemoteHistory(data.configPushHistory);
      if (data.appliedConfig) {
        setRemoteConfig([{
          id: data.appliedConfig.id,
          key: 'applied_config',
          value: JSON.stringify(data.appliedConfig.configPayload),
          scope: 'TENANT',
          status: 'APPLIED',
          appliedAt: data.appliedConfig.updatedAt,
          createdAt: data.appliedConfig.createdAt,
        }]);
      }
    } catch (err) {
      toast.error('تعذر تحميل بيانات التحكم عن بعد', err instanceof Error ? err.message : undefined);
    }
  }, [detailId, toast, centralActive]);

  const sendConfig = () => {
    if (centralActive) {
      if (!detailId || !configForm.key.trim()) return;
      setConfigSending(true);
      centralPlatformClient.pushTenantConfig(detailId, {
        key: configForm.key,
        value: configForm.value,
        scope: configForm.scope,
        targetDeviceIds: configForm.scope === 'DEVICE' ? selectedDeviceIds : undefined,
      })
        .then(() => {
          toast.success('تم إرسال الإعداد', `المفتاح: ${configForm.key}`);
          setConfigForm({ ...configForm, key: '', value: '' });
          setSelectedDeviceIds([]);
          loadRemoteControlData();
        })
        .catch((err) => toast.error('فشل إرسال الإعداد', err instanceof Error ? err.message : undefined))
        .finally(() => setConfigSending(false));
      return;
    }
    if (!detailId || !configForm.key.trim()) return;
    if (configForm.scope === 'DEVICE' && selectedDeviceIds.length === 0) {
      toast.error('اختر جهازاً واحداً على الأقل');
      return;
    }
    setConfigSending(true);
    try {
      let targetCount = 0;
      const targetDevices = configForm.scope === 'DEVICE'
        ? remoteDevices.filter((d) => selectedDeviceIds.includes(d.id))
        : remoteDevices.filter((d) => d.status === 'ACTIVE');

      targetCount = targetDevices.length;

      if (targetCount === 0) {
        toast.error('لا توجد أجهزة نشطة للإرسال');
        setConfigSending(false);
        return;
      }

      // Create override entries for each target device/tenant
      const overrideInput = {
        kind: 'FEATURE' as const,
        code: configForm.key,
        value: configForm.value,
        isEnabled: true,
        notes: `Remote config push via platform admin - scope: ${configForm.scope}, targets: ${targetCount}`,
      };

      // Add override at tenant level (affects all devices)
      if (configForm.scope === 'TENANT') {
        platformAdminService.addTenantOverride(detailId, overrideInput);
      }

      // Add to local history immediately for UI feedback
      const now = new Date().toISOString();
      const newEntry = {
        id: `rc_${Date.now()}`,
        type: 'CONFIG_PUSH',
        key: configForm.key,
        value: configForm.value,
        targetCount,
        status: 'SUCCESS' as const,
        result: `تم الإرسال إلى ${targetCount} جهاز`,
        error: null,
        createdAt: now,
      };
      setRemoteHistory((prev) => [newEntry, ...prev]);

      // Also update the applied config list
      const appliedConfig = {
        id: `cfg_${Date.now()}`,
        key: configForm.key,
        value: configForm.value,
        scope: configForm.scope,
        status: 'APPLIED',
        appliedAt: now,
        createdAt: now,
      };
      setRemoteConfig((prev) => [appliedConfig, ...prev]);

      toast.success('تم إرسال الإعداد', `إلى ${targetCount} جهاز`);
      setConfigForm({ ...configForm, key: '', value: '' });
      setSelectedDeviceIds([]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'خطأ غير معروف';
      const newEntry = {
        id: `rc_${Date.now()}`,
        type: 'CONFIG_PUSH',
        key: configForm.key,
        value: configForm.value,
        targetCount: 0,
        status: 'FAILED' as const,
        result: null,
        error: errorMsg,
        createdAt: new Date().toISOString(),
      };
      setRemoteHistory((prev) => [newEntry, ...prev]);
      toast.error('فشل إرسال الإعداد', errorMsg);
    } finally {
      setConfigSending(false);
    }
  };

  const toggleDeviceStatus = (device: any) => {
    if (centralActive) {
      const newStatus = device.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      run(
        () => (newStatus === 'SUSPENDED' ? centralPlatformClient.suspendDevice(device.id) : centralPlatformClient.releaseDevice(device.id)),
        `تم ${newStatus === 'ACTIVE' ? 'تفعيل' : 'إيقاف'} الجهاز`
      );
      return;
    }
    if (!detailId) return;
    const newStatus = device.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    run(() => {
      platformAdminService.setDeviceStatus(device.id, newStatus);
      loadRemoteDevices();
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
    sendConfig,
    toggleDeviceStatus,
    pushConfig,
    forceSync,
  };
}

export type RemoteControlState = ReturnType<typeof useRemoteControl>;
