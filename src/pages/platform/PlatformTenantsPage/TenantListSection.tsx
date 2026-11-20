import React from 'react';
import {
  Ban,
  Building2,
  ChevronDown,
  Download,
  Eye,
  Filter,
  KeyRound,
  Layers3,
  Pencil,
  Plus,
  Search,
  Send,
} from 'lucide-react';
import { PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import type { PlatformPlan, PlatformTenant } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState, Field, StatusBadge, formatDate, formatMoney, formatNumber, inputClass } from '../components/PlatformUI';
import { STATUSES } from './constants';

interface TenantListSectionProps {
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  status: string;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  planId: string;
  setPlanId: React.Dispatch<React.SetStateAction<string>>;
  plans: PlatformPlan[];
  tenants: PlatformTenant[];
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  error: string | null;
  loading: boolean;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleSelectAll: (checked: boolean) => void;
  handleSelectOne: (id: string, checked: boolean) => void;
  canManageTenants: boolean;
  openProfile: (tenant: PlatformTenant) => void;
  openEdit: (tenant: PlatformTenant) => void;
  setBulkActionType: React.Dispatch<React.SetStateAction<'status' | 'plan' | 'activation' | 'export' | 'import'>>;
  setBulkActionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  executeBulkAction: () => void;
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: React.Dispatch<React.SetStateAction<boolean>>;
  dateRange: { from: string; to: string };
  setDateRange: React.Dispatch<React.SetStateAction<{ from: string; to: string }>>;
  outstandingRange: { min: string; max: string };
  setOutstandingRange: React.Dispatch<React.SetStateAction<{ min: string; max: string }>>;
  deviceUtilizationFilter: string;
  setDeviceUtilizationFilter: React.Dispatch<React.SetStateAction<string>>;
  healthScoreFilter: string;
  setHealthScoreFilter: React.Dispatch<React.SetStateAction<string>>;
  filterPresets: Record<string, any>;
  loadFilterPreset: (name: string) => void;
  saveFilterPreset: (name: string) => void;
}

export const TenantListSection: React.FC<TenantListSectionProps> = ({
  search,
  setSearch,
  status,
  setStatus,
  planId,
  setPlanId,
  plans,
  tenants,
  page,
  setPage,
  error,
  loading,
  selectedIds,
  setSelectedIds,
  handleSelectAll,
  handleSelectOne,
  canManageTenants,
  openProfile,
  openEdit,
  setBulkActionType,
  setBulkActionOpen,
  executeBulkAction,
  showAdvancedFilters,
  setShowAdvancedFilters,
  dateRange,
  setDateRange,
  outstandingRange,
  setOutstandingRange,
  deviceUtilizationFilter,
  setDeviceUtilizationFilter,
  healthScoreFilter,
  setHealthScoreFilter,
  filterPresets,
  loadFilterPreset,
  saveFilterPreset,
}) => (
  <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالاسم أو رقم العميل أو الهاتف أو البريد..."
            className={`${inputClass} pr-8`}
          />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} max-w-[170px]`}>
          <option value="">كل الحالات</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>{PLATFORM_TENANT_STATUS_LABELS[value]}</option>
          ))}
        </select>
        <select value={planId} onChange={(event) => setPlanId(event.target.value)} className={`${inputClass} max-w-[200px]`}>
          <option value="">كل الباقات</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.name}</option>
          ))}
        </select>
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-bold text-ink-secondary">{tenants.length} عميل</span>
      </div>

      {tenants.length > 20 && (
         <div className="flex items-center justify-center gap-2">
           <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border px-3 py-1 text-sm disabled:opacity-50">السابق</button>
           <span className="text-sm">{page} / {Math.ceil(tenants.length / 20)}</span>
           <button disabled={page >= Math.ceil(tenants.length / 20)} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">التالي</button>
         </div>
       )}
      {error && (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>
      )}

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && canManageTenants && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[420px] z-50 animate-slide-up">
          <div className="rounded-xl border border-success-border bg-success-soft shadow-xl p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-bold text-success">{selectedIds.size} عميل محدد</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-success hover:underline text-sm">إلغاء التحديد</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" leadingIcon={<Ban className="h-3 w-3" />} onClick={() => { setBulkActionType('status'); setBulkActionOpen(true); }}>
                تغيير الحالة
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={<Layers3 className="h-3 w-3" />} onClick={() => { setBulkActionType('plan'); setBulkActionOpen(true); }}>
                تغيير الباقة
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={<Send className="h-3 w-3" />} onClick={() => { setBulkActionType('activation'); setBulkActionOpen(true); }}>
                إرسال تفعيل
              </Button>
              <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3 w-3" />} onClick={() => { setBulkActionType('export'); executeBulkAction(); }}>
                تصدير
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Filters */}
      <section className="rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-success"
          >
            <Filter className="h-4 w-4" />
            فلاتر متقدمة
            <ChevronDown className={`h-4 w-4 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
          </button>
          {Object.keys(filterPresets).length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] text-muted">قوالب محفوظة:</span>
              <select
                className={`${inputClass} max-w-[150px]`}
                onChange={(e) => loadFilterPreset(e.target.value)}
                defaultValue=""
              >
                <option value="">-- اختر قالب --</option>
                {Object.keys(filterPresets).map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <Button variant="ghost" size="sm" onClick={() => {
                const name = prompt('اسم القالب الجديد:');
                if (name) saveFilterPreset(name);
              }}>
                <Plus className="h-3.5 w-3.5" /> حفظ
              </Button>
            </div>
          )}
        </div>
        {showAdvancedFilters && (
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="نطاق تاريخ الإنشاء">
              <div className="flex gap-2">
                <input type="date" className={inputClass} value={dateRange.from} onChange={(e) => setDateRange({...dateRange, from: e.target.value})} placeholder="من" />
                <input type="date" className={inputClass} value={dateRange.to} onChange={(e) => setDateRange({...dateRange, to: e.target.value})} placeholder="إلى" />
              </div>
            </Field>
            <Field label="نطاق المستحقات">
              <div className="flex gap-2">
                <input type="number" className={inputClass} value={outstandingRange.min} onChange={(e) => setOutstandingRange({...outstandingRange, min: e.target.value})} placeholder="الحد الأدنى" step="0.01" />
                <input type="number" className={inputClass} value={outstandingRange.max} onChange={(e) => setOutstandingRange({...outstandingRange, max: e.target.value})} placeholder="الحد الأقصى" step="0.01" />
              </div>
            </Field>
            <Field label="استخدام الأجهزة">
              <select className={inputClass} value={deviceUtilizationFilter} onChange={(e) => setDeviceUtilizationFilter(e.target.value)}>
                <option value="">الكل</option>
                <option value="unused">غير مستخدم (0%)</option>
                <option value="low">{'منخفض (< 50%)'}</option>
                <option value="medium">{'متوسط (50-80%)'}</option>
                <option value="high">{'عالي (> 80%)'}</option>
                <option value="full">ممتلئ (100%)</option>
              </select>
            </Field>
            <Field label="درجة الصحة">
              <select className={inputClass} value={healthScoreFilter} onChange={(e) => setHealthScoreFilter(e.target.value)}>
                <option value="">الكل</option>
                <option value="excellent">ممتاز (90-100%)</option>
                <option value="good">جيد (70-89%)</option>
                <option value="fair">مقبول (50-69%)</option>
                <option value="poor">{'ضعيف (< 50%)'}</option>
              </select>
            </Field>
            <div className="flex items-end">
              <Button variant="secondary" block onClick={() => {
                setSearch(''); setStatus(''); setPlanId('');
                setDateRange({from: '', to: ''}); setOutstandingRange({min: '', max: ''});
                setDeviceUtilizationFilter(''); setHealthScoreFilter('');
              }}>
                مسح الفلاتر
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل العملاء...</div>
        ) : tenants.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="لا يوجد عملاء مطابقون"
            description="أضف عميلاً جديداً أو غيّر عوامل التصفية."
          />
        ) : (
          <DataTable<PlatformTenant>
            ariaLabel="قائمة العملاء"
            rows={tenants.slice((page - 1) * 20, page * 20)}
            rowKey={(item) => item.id}
            minWidth={1080}
            rowClassName={(item) => (selectedIds.has(item.id) ? 'bg-success-soft/30' : '')}
            columns={[
              {
                key: 'select', header: (
                  <input type="checkbox" checked={selectedIds.size === tenants.length && tenants.length > 0} onChange={(e) => handleSelectAll(e.target.checked)} />
                ),
                render: (item) => <input type="checkbox" checked={selectedIds.has(item.id)} onChange={(e) => handleSelectOne(item.id, e.target.checked)} />,
                width: 40,
              },
              {
                key: 'tenant', header: 'العميل / Tenant ID',
                render: (item) => (
                  <>
                    <p className="text-[12.5px] font-bold text-ink">{item.name}</p>
                    <p className="text-[10px] text-muted">
                      <span dir="ltr" className="font-mono">{item.code}</span>
                      {' · '}
                      <span dir="ltr" className="font-mono text-muted">{item.id}</span>
                    </p>
                    <p className="text-[10px] text-muted">{item.phone || item.email || '—'}</p>
                  </>
                ),
              },
              { key: 'business', header: 'النشاط', render: (item) => <span className="text-[11px] text-ink-secondary">{item.businessType || '—'}</span> },
              { key: 'plan', header: 'الباقة', render: (item) => <span className="text-[11.5px] font-semibold text-ink-secondary">{item.planName || '—'}</span> },
              { key: 'status', header: 'الحالة', render: (item) => <StatusBadge value={item.status} label={PLATFORM_TENANT_STATUS_LABELS[item.status]} /> },
              { key: 'expires', header: 'نهاية الاشتراك', render: (item) => <span className="text-[11px] text-ink-secondary">{formatDate(item.subscriptionExpiresAt)}</span> },
              { key: 'devices', header: 'الأجهزة', render: (item) => <span className="text-[11px] font-semibold text-ink">{formatNumber(item.devicesUsed ?? 0)} / {formatNumber(item.devicesLimit)}</span> },
              { key: 'branches', header: 'الفروع', render: (item) => <span className="text-[11px] font-semibold text-ink">{formatNumber(item.branchesLimit)}</span> },
              {
                key: 'outstanding', header: 'مستحقات',
                render: (item) => <span className={`text-[11px] font-bold ${(item.outstanding ?? 0) > 0 ? 'text-danger' : 'text-muted'}`}>{formatMoney(item.outstanding ?? 0)}</span>,
              },
              {
                key: 'actions', header: 'إجراءات',
                render: (item) => (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openProfile(item)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="فتح الملف المركزي"><Eye className="h-3.5 w-3.5" /></button>
                    {canManageTenants && (<button type="button" onClick={() => openEdit(item)} className="rounded p-1.5 text-muted hover:bg-success-soft hover:text-success" title="تعديل البيانات"><Pencil className="h-3.5 w-3.5" /></button>)}
                    <button type="button" onClick={() => openProfile(item)} className="rounded p-1.5 text-muted hover:bg-warning-soft hover:text-warning" title="الحساب والترخيص"><KeyRound className="h-3.5 w-3.5" /></button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>
  </>
);
