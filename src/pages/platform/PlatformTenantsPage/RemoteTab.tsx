import React from 'react';
import { Ban, CheckCircle2, Cpu, RefreshCw, RotateCw, ScrollText, Send } from 'lucide-react';
import type { PlatformDevice } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState, Field, StatusBadge, formatDateTime, inputClass } from '../components/PlatformUI';
import { SectionCard } from './shared';

interface RemoteTabProps {
  remoteControlData: {
    tenant: any;
    appliedConfig: any;
    configPushHistory: any[];
    devices: any[];
    lastSync: any;
  } | null;
  loadRemoteControlData: () => void;
  configSending: boolean;
  forceSync: () => void;
  forceSyncWorking: boolean;
  canManageTenants: boolean;
  centralActive: boolean;
  remoteDevices: PlatformDevice[];
  selectedDeviceIds: string[];
  setSelectedDeviceIds: React.Dispatch<React.SetStateAction<string[]>>;
  toggleDeviceStatus: (device: PlatformDevice) => void;
  configForm: { key: string; value: string; scope: string; targetDeviceIds: string[] };
  setConfigForm: React.Dispatch<React.SetStateAction<{ key: string; value: string; scope: string; targetDeviceIds: string[] }>>;
  pushConfig: () => void;
  remoteConfig: any[];
  remoteHistory: any[];
}

export const RemoteTab: React.FC<RemoteTabProps> = ({
  remoteControlData,
  loadRemoteControlData,
  configSending,
  forceSync,
  forceSyncWorking,
  canManageTenants,
  centralActive,
  remoteDevices,
  selectedDeviceIds,
  setSelectedDeviceIds,
  toggleDeviceStatus,
  configForm,
  setConfigForm,
  pushConfig,
  remoteConfig,
  remoteHistory,
}) => (
              <div className="space-y-3">
                {/* Sync Status & Actions */}
                <div className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-ink">حالة المزامنة</p>
                      <p className="text-[11px] text-muted">
                        {remoteControlData?.lastSync ? (
                          <>
                            آخر مزامنة: <b>{formatDateTime(remoteControlData.lastSync.at)}</b> · حالة: <b>{remoteControlData.lastSync.status}</b>
                          </>
                        ) : (
                          'لا توجد مزامنة مسجلة بعد'
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={loadRemoteControlData} loading={configSending}>
                        تحديث البيانات
                      </Button>
                      <Button variant="primary" size="sm" leadingIcon={<RotateCw className="h-3.5 w-3.5" />} onClick={forceSync} loading={forceSyncWorking} disabled={!canManageTenants}>
                        مزامنة إجبارية
                      </Button>
                    </div>
                  </div>
                </div>

                <SectionCard
                  title="الأجهزة المتصلة"
                  subtitle={`${remoteDevices.length} جهاز — ${remoteDevices.filter((d) => d.status === 'ACTIVE').length} نشط، ${remoteDevices.filter((d) => d.status === 'OFFLINE').length} غير متصل`}
                  icon={<Cpu className="h-4 w-4" />}
                  action={
                    <Button variant="secondary" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={loadRemoteControlData} loading={configSending}>
                      تحديث
                    </Button>
                  }
                >
                  {remoteDevices.length === 0 ? (
                    <EmptyState icon={<Cpu className="h-5 w-5" />} title="لا توجد أجهزة متصلة" description="ستظهر الأجهزة عند تفعيل التراخيص وربطها." />
                  ) : (
                                        <DataTable
                      ariaLabel="الأجهزة المتصلة"
                      rows={remoteDevices}
                      rowKey={(item) => item.id}
                      minWidth={900}
                      dense
                      columns={[
                        {
                          key: 'select', header: (
                            <input
                              type="checkbox"
                              checked={remoteDevices.length > 0 && selectedDeviceIds.length === remoteDevices.length}
                              onChange={(e) => setSelectedDeviceIds(e.target.checked ? remoteDevices.map(d => d.id) : [])}
                              aria-label="تحديد كل الأجهزة"
                            />
                          ),
                          render: (device) => <input type="checkbox" checked={selectedDeviceIds.includes(device.id)} onChange={(e) => setSelectedDeviceIds(e.target.checked ? [...selectedDeviceIds, device.id] : selectedDeviceIds.filter(id => id !== device.id))} />,
                          width: 40,
                        },
                        { key: 'hw', header: 'Hardware ID', render: (device) => <span className="font-mono text-[10.5px]" dir="ltr">{device.hardwareId}</span> },
                        { key: 'name', header: 'الاسم', render: (device) => <span className="text-[11px] text-ink-secondary">{device.name || '—'}</span> },
                        { key: 'os', header: 'نظام التشغيل', render: (device) => <span className="text-[11px] text-ink-secondary">{device.os || '—'}</span> },
                        { key: 'version', header: 'إصدار التطبيق', render: (device) => <span className="text-[11px] text-ink-secondary">{device.appVersion || '—'}</span> },
                        { key: 'ip', header: 'IP', render: (device) => <span className="font-mono text-[10.5px]" dir="ltr">{device.ipAddress || '—'}</span> },
                        { key: 'first', header: 'أول اتصال', render: (device) => <span className="text-[10.5px] text-ink-secondary">{formatDateTime(device.firstActivatedAt)}</span> },
                        { key: 'last', header: 'آخر اتصال', render: (device) => <span className="text-[10.5px] text-ink-secondary">{formatDateTime(device.lastSeenAt)}</span> },
                        {
                          key: 'status', header: 'الحالة',
                          render: (device) => (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              device.status === 'ACTIVE' ? 'bg-success-soft text-success' :
                              device.status === 'SUSPENDED' ? 'bg-warning-soft text-warning' :
                              device.status === 'OFFLINE' ? 'bg-surface-sunken text-ink-secondary' :
                              'bg-danger-soft text-danger'
                            }`}>
                              {device.status === 'ACTIVE' ? 'نشط' : device.status === 'SUSPENDED' ? 'موقوف' : device.status === 'OFFLINE' ? 'غير متصل' : 'ملغي'}
                              {device.cloneSuspected ? ' · ⚠️' : ''}
                            </span>
                          ),
                        },
                        {
                          key: 'actions', header: 'إجراءات',
                          render: (device) => (
                            <div className="flex items-center gap-1">
                              {canManageTenants && (() => {
                                // Central API can suspend devices but cannot re-activate them.
                                const unsupported = centralActive && device.status !== 'ACTIVE';
                                return (
                                  <button
                                    type="button"
                                    disabled={unsupported}
                                    onClick={() => toggleDeviceStatus(device)}
                                    className={`rounded p-1.5 ${unsupported ? 'cursor-not-allowed text-muted/40' : 'text-muted hover:bg-warning-soft hover:text-warning'}`}
                                    title={unsupported ? 'إعادة التفعيل غير مدعومة في الوضع المركزي' : device.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}
                                  >
                                    {device.status === 'ACTIVE' ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  </button>
                                );
                              })()}
                            </div>
                          ),
                        },
                      ]}
                    />
                  )}
                </SectionCard>

                <SectionCard
                  title="إرسال إعدادات جديدة (Push Config)"
                  subtitle="إرسال مفاتيح تكوين (Feature Flags، حدود، وحدات، صلاحيات) إلى أجهزة العميل المستهدفة عبر outbox/sync"
                  icon={<Send className="h-4 w-4" />}
                >
                  <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label="مفتاح الإعداد">
                      <input className={inputClass} dir="ltr" value={configForm.key} onChange={(e) => setConfigForm({ ...configForm, key: e.target.value })} placeholder="مثال: features.new_ui / limits.max_products / modules.inventory" />
                    </Field>
                    <Field label="القيمة">
                      <input className={inputClass} value={configForm.value} onChange={(e) => setConfigForm({ ...configForm, value: e.target.value })} placeholder='true / false / 5000 / ["module1","module2"]' />
                    </Field>
                    <Field label="النطاق">
                      <select className={inputClass} value={configForm.scope} onChange={(e) => setConfigForm({ ...configForm, scope: e.target.value })}>
                        <option value="TENANT">عميل (كل الأجهزة)</option>
                        <option value="DEVICE">أجهزة مختارة</option>
                        <option value="BRANCH">فرع</option>
                      </select>
                    </Field>
                    <div className="flex items-end">
                      <Button variant="primary" block leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={pushConfig} loading={configSending} disabled={!canManageTenants || !configForm.key.trim() || (configForm.scope === 'DEVICE' && selectedDeviceIds.length === 0)}>
                        دفع التكوين
                      </Button>
                    </div>
                    {configForm.scope === 'DEVICE' && selectedDeviceIds.length > 0 && (
                      <p className="text-[10.5px] text-success sm:col-span-2 xl:col-span-4">سيتم الإرسال إلى {selectedDeviceIds.length} جهاز محدد</p>
                    )}
                  </div>
                  {remoteConfig.length > 0 && (
                    <div className="border-t border-line mt-3 pt-3">
                      <p className="mb-2 text-[11px] font-semibold text-ink">إعدادات مطبقة حالياً</p>
                                            <DataTable
                        ariaLabel="الإعدادات المطبقة حالياً"
                        rows={remoteConfig}
                        rowKey={(cfg) => cfg.id || cfg.key}
                        minWidth={600}
                        dense
                        columns={[
                          { key: 'key', header: 'المفتاح', render: (cfg) => <span className="font-mono text-[10.5px]" dir="ltr">{cfg.key}</span> },
                          { key: 'value', header: 'القيمة', render: (cfg) => <span className="text-[10.5px]" dir="ltr">{cfg.value}</span> },
                          { key: 'scope', header: 'النطاق', render: (cfg) => <span className="text-[10.5px]">{cfg.scope}</span> },
                          { key: 'status', header: 'الحالة', render: (cfg) => <StatusBadge value={cfg.status || 'APPLIED'} label={cfg.status === 'APPLIED' ? 'مطبق' : cfg.status === 'PENDING' ? 'بانتظار' : 'فشل'} /> },
                          { key: 'date', header: 'تاريخ التطبيق', render: (cfg) => <span className="text-[10.5px] text-muted">{formatDateTime(cfg.appliedAt || cfg.createdAt)}</span> },
                        ]}
                      />
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="سجل دفع التكوين (Config Push History)"
                  subtitle={`${remoteHistory.length} عملية مسجلة`}
                  icon={<ScrollText className="h-4 w-4" />}
                  action={
                    <Button variant="secondary" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={loadRemoteControlData} loading={configSending}>
                      تحديث السجل
                    </Button>
                  }
                >
                  {remoteHistory.length === 0 ? (
                    <EmptyState icon={<ScrollText className="h-5 w-5" />} title="لا يوجد سجل عمليات" description="ستظهر هنا عمليات دفع التكوين عبر outbox/sync relay." />
                  ) : (
                                        <DataTable
                      ariaLabel="سجل دفع التكوين"
                      rows={remoteHistory}
                      rowKey={(item) => item.id}
                      minWidth={800}
                      dense
                      columns={[
                        { key: 'type', header: 'النوع', render: (entry) => <span className="text-[10.5px] font-semibold text-ink">{entry.type || 'CONFIG_PUSH'}</span> },
                        { key: 'key', header: 'المفتاح', render: (entry) => <span className="font-mono text-[10.5px]" dir="ltr">{entry.key}</span> },
                        { key: 'value', header: 'القيمة', render: (entry) => <span className="text-[10.5px]" dir="ltr">{entry.value}</span> },
                        { key: 'targets', header: 'الأجهزة المستهدفة', render: (entry) => <span className="text-[10.5px] text-ink-secondary">{entry.targetCount || 0} جهاز</span> },
                        { key: 'status', header: 'الحالة', render: (entry) => <StatusBadge value={entry.status || 'PENDING'} label={entry.status === 'ACKNOWLEDGED' ? 'وصل' : entry.status === 'SENT' ? 'مرسل' : entry.status === 'FAILED' ? 'فشل' : 'بانتظار'} /> },
                        { key: 'result', header: 'النتيجة / الخطأ', render: (entry) => <span className="text-[10.5px] text-muted" dir="ltr">{entry.error || entry.result || '—'}</span> },
                        { key: 'date', header: 'التاريخ', render: (entry) => <span className="text-[10.5px] text-muted">{formatDateTime(entry.createdAt)}</span> },
                      ]}
                    />
                  )}
                </SectionCard>
              </div>
);
