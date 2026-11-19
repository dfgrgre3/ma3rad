import React from 'react';
import { Activity, Copy, KeyRound, RefreshCw } from 'lucide-react';
import type { PlatformTenantProfile } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState, StatusBadge, formatDate, formatNumber } from '../components/PlatformUI';
import { LogList, SectionCard } from './shared';

interface LicensesTabProps {
  profile: PlatformTenantProfile;
  working: boolean;
  canManageTenants: boolean;
  resetDevices: () => void;
  copyToClipboard: (text: string, label: string) => Promise<void>;
}

export const LicensesTab: React.FC<LicensesTabProps> = ({
  profile,
  working,
  canManageTenants,
  resetDevices,
  copyToClipboard,
}) => (
              <div className="space-y-3">
                <SectionCard
                  title="التراخيص والأجهزة"
                  subtitle={`${profile.licenses.length} ترخيص · ${formatNumber(profile.usage.devicesUsed)} جهاز مستخدم من ${formatNumber(profile.usage.devicesLimit)}`}
                  icon={<KeyRound className="h-4 w-4" />}
                  action={
                    <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={resetDevices} loading={working} disabled={!canManageTenants}>
                      إعادة تعيين الأجهزة
                    </Button>
                  }
                >
                  {profile.licenses.length === 0 ? (
                    <EmptyState icon={<KeyRound className="h-5 w-5" />} title="لا توجد تراخيص" description="استخدم تبويب الاشتراك لإصدار ترخيص أو نقل الباقة." />
                  ) : (
                                        <DataTable
                      ariaLabel="التراخيص والأجهزة"
                      rows={profile.licenses}
                      rowKey={(item) => item.id}
                      minWidth={760}
                      dense
                      columns={[
                        {
                          key: 'key', header: 'مفتاح الترخيص',
                          render: (license) => (
                            <button type="button" onClick={() => copyToClipboard(license.licenseKey, 'مفتاح الترخيص')} className="inline-flex items-center gap-1 font-mono text-[10.5px] text-slate-700 hover:text-emerald-700" dir="ltr">
                              {license.licenseKey} <Copy className="h-3 w-3" />
                            </button>
                          ),
                        },
                        { key: 'status', header: 'الحالة', render: (license) => <StatusBadge value={license.status} label={license.status} /> },
                        { key: 'device', header: 'الجهاز', render: (license) => <span className="text-[10.5px]" dir="ltr">{license.hardwareId || '—'}</span> },
                        { key: 'expires', header: 'ينتهي', render: (license) => <span className="text-[10.5px]">{formatDate(license.expiresAt)}</span> },
                        { key: 'seats', header: 'المستخدمون', render: (license) => <span className="text-[10.5px]">{formatNumber(license.seats)}</span> },
                        { key: 'deviceLimit', header: 'حد الأجهزة', render: (license) => <span className="text-[10.5px]">{formatNumber(license.deviceLimit)}</span> },
                        { key: 'modules', header: 'الوحدات', render: (license) => <span className="text-[10.5px]">{formatNumber(license.modules.length)}</span> },
                      ]}
                    />
                  )}
                </SectionCard>

                <SectionCard title="سجل التفعيلات" subtitle="كل عمليات توليد وإرسال وتفعيل بيانات الدخول" icon={<Activity className="h-4 w-4" />}>
                  <LogList entries={profile.activationLog} empty="لا توجد عمليات تفعيل مسجلة بعد." />
                </SectionCard>
              </div>
);
