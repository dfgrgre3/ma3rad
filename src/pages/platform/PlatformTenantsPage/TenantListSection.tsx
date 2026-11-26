import React from 'react';
import {
  ArrowUpDown,
  Ban,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Filter,
  KeyRound,
  Layers3,
  Pencil,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import type { PlatformPlan, PlatformTenant } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState, Field, StatusBadge, formatDate, formatMoney, formatNumber, inputClass } from '../components/PlatformUI';
import { STATUSES, TENANTS_PAGE_SIZE } from './constants';
import { Avatar, daysUntil, healthTone } from './shared';

type TenantSortKey = 'name' | 'plan' | 'status' | 'expires' | 'devices' | 'outstanding' | 'created';

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
  setBulkActionType: React.Dispatch<React.SetStateAction<'status' | 'plan' | 'activation' | 'export'>>;
  setBulkActionOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
  deleteFilterPreset: (name: string) => void;
  healthScoreFor?: (tenant: PlatformTenant) => number;
}

const advancedActiveCount = (props: {
  dateRange: { from: string; to: string };
  outstandingRange: { min: string; max: string };
  deviceUtilizationFilter: string;
  healthScoreFilter: string;
}): number =>
  (props.dateRange.from || props.dateRange.to ? 1 : 0) +
  (props.outstandingRange.min || props.outstandingRange.max ? 1 : 0) +
  (props.deviceUtilizationFilter ? 1 : 0) +
  (props.healthScoreFilter ? 1 : 0);

const DevicesCell: React.FC<{ used?: number; limit: number }> = ({ used = 0, limit }) => {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-success';
  return (
    <div className="min-w-[72px]">
      <p className="text-[11px] font-bold text-ink">
        {formatNumber(used)} <span className="font-semibold text-muted">/ {formatNumber(limit)}</span>
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const ExpiryCell: React.FC<{ value?: string | null }> = ({ value }) => {
  const days = daysUntil(value);
  if (days === null) return <span className="text-[11px] text-muted">—</span>;
  const overdue = days < 0;
  const soon = days <= 30;
  return (
    <div className="min-w-[86px]">
      <p className="text-[11px] font-semibold text-ink-secondary">{formatDate(value)}</p>
      {days !== null && (
        <p className={`mt-0.5 text-[9.5px] font-bold ${overdue ? 'text-danger' : soon ? 'text-warning' : 'text-muted'}`}>
          {overdue ? `منتهي منذ ${formatNumber(Math.abs(days))} يوم` : days === 0 ? 'ينتهي اليوم' : `متبقي ${formatNumber(days)} يوم`}
        </p>
      )}
    </div>
  );
};

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
  deleteFilterPreset,
  healthScoreFor,
}) => {
  const [sortKey, setSortKey] = React.useState<TenantSortKey | null>(null);
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  const sortedTenants = React.useMemo(() => {
    if (!sortKey) return tenants;
    const dir = sortDir === 'asc' ? 1 : -1;
    const sortValue = (tenant: PlatformTenant): string | number => {
      switch (sortKey) {
        case 'name': return tenant.name ?? '';
        case 'plan': return tenant.planName ?? '';
        case 'status': return tenant.status ?? '';
        case 'expires': return tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt).getTime() : 0;
        case 'devices': return (tenant.devicesUsed ?? 0) / Math.max(1, tenant.devicesLimit || 1);
        case 'outstanding': return tenant.outstanding ?? 0;
        case 'created': return tenant.createdAt ? new Date(tenant.createdAt).getTime() : 0;
        default: return '';
      }
    };
    return [...tenants].sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ar') * dir;
    });
  }, [tenants, sortKey, sortDir]);

  React.useEffect(() => { setPage(1); }, [sortKey, sortDir, setPage]);

  const toggleSort = (key: TenantSortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortableHeader = (key: TenantSortKey, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`inline-flex items-center gap-1 font-bold transition hover:text-primary ${sortKey === key ? 'text-primary' : ''}`}
    >
      {label}
      {sortKey === key ? (
        sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );

  const advCount = advancedActiveCount({ dateRange, outstandingRange, deviceUtilizationFilter, healthScoreFilter });
  const presetNames = Object.keys(filterPresets);

  return (
    <>
      {/* ─── Toolbar ─── */}
      <div className="rounded-2xl border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[230px] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو رقم العميل أو الهاتف أو البريد..."
              className={`${inputClass} rounded-xl py-2.5 pr-9 pl-8`}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition hover:bg-surface-sunken hover:text-ink"
                aria-label="مسح البحث"
                title="مسح البحث"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="relative">
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} max-w-[170px] appearance-none rounded-xl py-2.5 pl-8 font-semibold`}>
              <option value="">كل الحالات</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>{PLATFORM_TENANT_STATUS_LABELS[value]}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          </div>
          <div className="relative">
            <select value={planId} onChange={(event) => setPlanId(event.target.value)} className={`${inputClass} max-w-[200px] appearance-none rounded-xl py-2.5 pl-8 font-semibold`}>
              <option value="">كل الباقات</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-[12px] font-bold transition ${
              showAdvancedFilters || advCount > 0
                ? 'border-primary/40 bg-accent-soft text-primary'
                : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            فلاتر متقدمة
            {advCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-white">
                {advCount}
              </span>
            )}
          </button>
          <span className="ms-auto rounded-full bg-surface-sunken px-3 py-1.5 text-[11px] font-bold text-ink-secondary">
            {formatNumber(tenants.length)} عميل
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>
      )}

      {/* ─── Advanced filters panel ─── */}
      {showAdvancedFilters && (
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 bg-surface-muted/50 px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-[11.5px] font-black text-ink">
              <Filter className="h-4 w-4 text-primary" /> الفلاتر المتقدمة
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {presetNames.length > 0 && (
                <>
                  <span className="text-[10.5px] text-muted">قوالب محفوظة:</span>
                  <select
                    className={`${inputClass} max-w-[150px] rounded-lg py-1.5 text-[11px]`}
                    onChange={(e) => { if (e.target.value) { loadFilterPreset(e.target.value); e.target.value = ''; } }}
                    value=""
                    aria-label="تحميل قالب فلاتر"
                  >
                    <option value="">-- اختر قالب --</option>
                    {presetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <select
                    className={`${inputClass} max-w-[130px] rounded-lg py-1.5 text-[11px]`}
                    value=""
                    onChange={(e) => { if (e.target.value) deleteFilterPreset(e.target.value); }}
                    aria-label="حذف قالب محفوظ"
                  >
                    <option value="">حذف قالب...</option>
                    {presetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => {
                const name = prompt('اسم القالب الجديد:');
                if (name) saveFilterPreset(name);
              }}>
                <Plus className="h-3.5 w-3.5" /> حفظ القالب
              </Button>
            </div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="نطاق تاريخ الإنشاء">
              <div className="flex gap-2">
                <input type="date" className={`${inputClass} rounded-lg`} value={dateRange.from} onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })} aria-label="من تاريخ" />
                <input type="date" className={`${inputClass} rounded-lg`} value={dateRange.to} onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })} aria-label="إلى تاريخ" />
              </div>
            </Field>
            <Field label="نطاق المستحقات">
              <div className="flex gap-2">
                <input type="number" className={`${inputClass} rounded-lg`} value={outstandingRange.min} onChange={(e) => setOutstandingRange({ ...outstandingRange, min: e.target.value })} placeholder="الحد الأدنى" step="0.01" />
                <input type="number" className={`${inputClass} rounded-lg`} value={outstandingRange.max} onChange={(e) => setOutstandingRange({ ...outstandingRange, max: e.target.value })} placeholder="الحد الأقصى" step="0.01" />
              </div>
            </Field>
            <Field label="استخدام الأجهزة">
              <select className={`${inputClass} rounded-lg`} value={deviceUtilizationFilter} onChange={(e) => setDeviceUtilizationFilter(e.target.value)}>
                <option value="">الكل</option>
                <option value="unused">غير مستخدم (0%)</option>
                <option value="low">{'منخفض (< 50%)'}</option>
                <option value="medium">{'متوسط (50-80%)'}</option>
                <option value="high">{'عالي (> 80%)'}</option>
                <option value="full">ممتلئ (100%)</option>
              </select>
            </Field>
            <Field label="درجة الصحة">
              <select className={`${inputClass} rounded-lg`} value={healthScoreFilter} onChange={(e) => setHealthScoreFilter(e.target.value)}>
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
                setDateRange({ from: '', to: '' }); setOutstandingRange({ min: '', max: '' });
                setDeviceUtilizationFilter(''); setHealthScoreFilter('');
              }}>
                مسح كل الفلاتر
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ─── Bulk action bar ─── */}
      {selectedIds.size > 0 && canManageTenants && (
        <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up md:left-auto md:right-4 md:w-[440px]">
          <div className="rounded-2xl border border-primary/30 bg-primary p-3 text-white shadow-2xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[13px] font-black">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-[11px]">{selectedIds.size}</span>
                عميل محدد
              </span>
              <button onClick={() => setSelectedIds(new Set())} className="text-[11px] font-bold text-white/70 transition hover:text-white">
                إلغاء التحديد
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" leadingIcon={<Ban className="h-3 w-3" />} onClick={() => { setBulkActionType('status'); setBulkActionOpen(true); }}>
                تغيير الحالة
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={<Layers3 className="h-3 w-3" />} onClick={() => { setBulkActionType('plan'); setBulkActionOpen(true); }}>
                تغيير الباقة
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={<Send className="h-3 w-3" />} onClick={() => { setBulkActionType('activation'); setBulkActionOpen(true); }}>
                إرسال تفعيل
              </Button>
              <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3 w-3" />} onClick={() => { setBulkActionType('export'); setBulkActionOpen(true); }} className="text-white/90 hover:bg-white/10">
                تصدير
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Table ─── */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm font-semibold text-muted">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-success" />
            جارٍ تحميل العملاء...
          </div>
        ) : tenants.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="لا يوجد عملاء مطابقون"
            description="أضف عميلاً جديداً أو غيّر عوامل التصفية."
          />
        ) : (
          <DataTable<PlatformTenant>
            ariaLabel="قائمة العملاء"
            rows={sortedTenants.slice((page - 1) * TENANTS_PAGE_SIZE, page * TENANTS_PAGE_SIZE)}
            rowKey={(item) => item.id}
            minWidth={1180}
            onRowClick={openProfile}
            rowClassName={(item) => (selectedIds.has(item.id) ? 'bg-success-soft/40' : '')}
            page={page}
            pageCount={Math.ceil(sortedTenants.length / TENANTS_PAGE_SIZE)}
            total={sortedTenants.length}
            pageSize={TENANTS_PAGE_SIZE}
            onPageChange={setPage}
            columns={[
              {
                key: 'select',
                header: (
                  <input
                    type="checkbox"
                    checked={selectedIds.size === tenants.length && tenants.length > 0}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < tenants.length; }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="تحديد كل العملاء"
                    className="h-3.5 w-3.5 rounded accent-success"
                  />
                ),
                render: (item) => (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={(e) => { e.stopPropagation(); handleSelectOne(item.id, e.target.checked); }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`تحديد ${item.name}`}
                    className="h-3.5 w-3.5 rounded accent-success"
                  />
                ),
                width: 40,
              },
              {
                key: 'tenant',
                header: sortableHeader('name', 'العميل'),
                render: (item) => (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={item.name} size="sm" className="rounded-xl" />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-black text-ink">{item.name}</p>
                      <p className="text-[10px] text-muted">
                        <span dir="ltr" className="font-mono">{item.code}</span>
                        {' · '}
                        <span dir="ltr" className="font-mono text-muted">{item.id}</span>
                      </p>
                      <p className="truncate text-[10px] text-muted">{item.phone || item.email || '—'}</p>
                    </div>
                  </div>
                ),
              },
              { key: 'business', header: 'النشاط', hideBelow: 'md', render: (item) => <span className="text-[11px] text-ink-secondary">{item.businessType || '—'}</span> },
              {
                key: 'plan',
                header: sortableHeader('plan', 'الباقة'),
                render: (item) => item.planName
                  ? <span className="inline-flex items-center rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold text-primary">{item.planName}</span>
                  : <span className="text-[11px] text-muted">—</span>,
              },
              { key: 'status', header: sortableHeader('status', 'الحالة'), render: (item) => <StatusBadge value={item.status} label={PLATFORM_TENANT_STATUS_LABELS[item.status]} /> },
              { key: 'expires', header: sortableHeader('expires', 'نهاية الاشتراك'), hideBelow: 'lg', render: (item) => <ExpiryCell value={item.subscriptionExpiresAt} /> },
              { key: 'created', header: sortableHeader('created', 'التسجيل'), hideBelow: 'lg', render: (item) => <span className="text-[11px] text-ink-secondary">{formatDate(item.createdAt)}</span> },
              {
                key: 'devices',
                header: sortableHeader('devices', 'الأجهزة'),
                render: (item) => <DevicesCell used={item.devicesUsed ?? 0} limit={item.devicesLimit} />,
              },
              {
                key: 'health',
                header: 'الصحة',
                hideBelow: 'lg',
                render: (item) => {
                  if (!healthScoreFor) return null;
                  const score = healthScoreFor(item);
                  const tone = healthTone(score);
                  return (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${tone.text} bg-surface-sunken`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${tone.bar}`} />
                      {score}%
                    </span>
                  );
                },
              },
              { key: 'branches', header: 'الفروع', hideBelow: 'md', render: (item) => <span className="text-[11px] font-semibold text-ink">{formatNumber(item.branchesLimit)}</span> },
              {
                key: 'outstanding',
                header: sortableHeader('outstanding', 'مستحقات'),
                hideBelow: 'lg',
                render: (item) => (item.outstanding ?? 0) > 0
                  ? <span className="inline-flex items-center rounded-full bg-danger-soft px-2 py-0.5 text-[10.5px] font-black text-danger">{formatMoney(item.outstanding ?? 0)}</span>
                  : <span className="text-[11px] text-muted">—</span>,
              },
              {
                key: 'actions',
                header: 'إجراءات',
                render: (item) => (
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => openProfile(item)} className="rounded-lg p-1.5 text-muted transition hover:bg-accent-soft hover:text-primary" title="فتح الملف المركزي" aria-label="فتح الملف المركزي">
                      <Eye className="h-4 w-4" />
                    </button>
                    {canManageTenants && (
                      <button type="button" onClick={() => openEdit(item)} className="rounded-lg p-1.5 text-muted transition hover:bg-success-soft hover:text-success" title="تعديل البيانات" aria-label="تعديل البيانات">
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => openProfile(item)} className="rounded-lg p-1.5 text-muted transition hover:bg-warning-soft hover:text-warning" title="الحساب والترخيص" aria-label="الحساب والترخيص">
                      <KeyRound className="h-4 w-4" />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>
    </>
  );
};
