import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CalendarClock, FileText, LayoutGrid, Package, PackageX, Receipt, ShieldCheck, ShoppingCart, Truck, Wallet,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader, StatCard } from '../../../components/ui/Card';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { formatMoney } from '../../../utils/money';
import {
  RetailWorkspaceService,
  type RetailExpirySummary,
  type RetailOpenOrder,
  type RetailTopProduct,
  type RetailWorkspaceStats,
  type RetailLowStockRow,
} from '../../../services/domains/retail/RetailWorkspaceService';
import { getRetailWorkspaceConfig } from './retailWorkspaceConfig';
import type { WarrantyClaimsStats } from '../../../services/domains/sales/WarrantyClaimService';
import type { ExpiryLot } from '../../../services/domains/inventory/ExpiryService';

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'جديد', CONFIRMED: 'مؤكد', PROCESSING: 'قيد التجهيز', PARTIAL: 'تسليم جزئي',
  READY: 'جاهز', ON_HOLD: 'معلق', COMPLETED: 'مكتمل', CANCELLED: 'ملغي',
};
const ORDER_STATUS_CLS: Record<string, string> = {
  PENDING: 'bg-warning-soft text-warning', CONFIRMED: 'bg-accent-soft text-primary',
  PROCESSING: 'bg-accent-soft text-primary', PARTIAL: 'bg-accent-soft text-primary',
  READY: 'bg-success-soft text-success', ON_HOLD: 'bg-surface-sunken text-ink-secondary',
  COMPLETED: 'bg-success-soft text-success', CANCELLED: 'bg-danger-soft text-danger',
};

const PANEL_TITLES = {
  expiry: 'الصلاحية والتشغيلات',
  warranty: 'الضمانات والمطالبات',
  orders: 'الطلبات المفتوحة',
  stock: 'أعلى الأصناف مبيعًا ونواقص المخزون',
} as const;

const PANEL_ICONS = {
  expiry: CalendarClock,
  warranty: ShieldCheck,
  orders: ShoppingCart,
  stock: Package,
} as const;

export const RetailWorkspacePage: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const canView = can('sales.view');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<RetailWorkspaceStats | null>(null);
  const [topProducts, setTopProducts] = useState<RetailTopProduct[]>([]);
  const [lowStock, setLowStock] = useState<RetailLowStockRow[]>([]);
  const [expiry, setExpiry] = useState<RetailExpirySummary | null>(null);
  const [warranty, setWarranty] = useState<WarrantyClaimsStats | null>(null);
  const [openOrders, setOpenOrders] = useState<RetailOpenOrder[]>([]);

  const businessType = getEffectiveBusinessType();
  const config = useMemo(() => getRetailWorkspaceConfig(businessType), [businessType]);
  const PanelIcon = PANEL_ICONS[config.panel];

  const load = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    try {
      const service = new RetailWorkspaceService();
      setStats(service.getStats());
      setTopProducts(service.getTopProducts());
      setLowStock(service.getLowStockRows());
      setExpiry(service.getExpirySummary());
      setWarranty(service.getWarrantyStats());
      setOpenOrders(service.getOpenOrders());
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل بيانات مساحة النشاط.');
    } finally {
      setLoading(false);
    }
  }, [canView, toast]);

  useEffect(() => { void load(); }, [load]);

  const renderPanel = () => {
    if (loading) {
      return <p className="py-10 text-center text-sm text-muted">جارٍ تحميل البيانات…</p>;
    }

    if (config.panel === 'expiry') {
      const upcoming: ExpiryLot[] = expiry?.upcoming || [];
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="دفعات منتهية الصلاحية" value={expiry?.expiredCount ?? 0} tone={expiry?.expiredCount ? 'danger' : 'default'} icon={<CalendarClock size={16} />} />
            <StatCard label="تنتهي قريبًا" value={expiry?.expiringCount ?? 0} tone={expiry?.expiringCount ? 'warning' : 'default'} icon={<CalendarClock size={16} />} />
            <StatCard label="أصناف تحت المتابعة" value={expiry?.trackedProducts ?? 0} icon={<Package size={16} />} />
          </div>
          {upcoming.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-start text-xs text-muted">
                    <th className="py-2 pe-3 text-start font-semibold">الصنف</th>
                    <th className="py-2 pe-3 text-start font-semibold">التشغيلة</th>
                    <th className="py-2 pe-3 text-start font-semibold">الصلاحية</th>
                    <th className="py-2 pe-3 text-start font-semibold">المتبقي</th>
                    <th className="py-2 text-start font-semibold">تنبيه</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((lot) => (
                    <tr key={lot.id} className="border-b border-line">
                      <td className="py-2 pe-3 font-medium">{lot.productName}</td>
                      <td className="py-2 pe-3">{lot.lotNumber || '—'}</td>
                      <td className="py-2 pe-3">{lot.expiryDate}</td>
                      <td className="py-2 pe-3">{formatMoney(lot.quantityRemaining)}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${lot.isExpired ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
                          {lot.isExpired ? 'منتهي' : `خلال ${lot.daysToExpiry} يوم`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    if (config.panel === 'warranty') {
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="مطالبات نشطة" value={warranty?.active ?? 0} icon={<ShieldCheck size={16} />} />
          <StatCard label="قيد المراجعة" value={warranty?.underReview ?? 0} icon={<ShieldCheck size={16} />} />
          <StatCard label="معتمدة" value={warranty?.approved ?? 0} icon={<ShieldCheck size={16} />} />
          <StatCard label="هذا الشهر" value={warranty?.thisMonth ?? 0} icon={<ShieldCheck size={16} />} />
        </div>
      );
    }

    if (config.panel === 'orders') {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-muted">
                <th className="py-2 pe-3 text-start font-semibold">رقم الطلب</th>
                <th className="py-2 pe-3 text-start font-semibold">العميل</th>
                <th className="py-2 pe-3 text-start font-semibold">التاريخ</th>
                <th className="py-2 text-start font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-muted">لا توجد طلبات مفتوحة.</td></tr>
              )}
              {openOrders.map((order) => (
                <tr key={order.id} className="border-b border-line">
                  <td className="py-2 pe-3 font-medium">{order.orderNumber}</td>
                  <td className="py-2 pe-3">{order.customerName}</td>
                  <td className="py-2 pe-3">{order.date}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ORDER_STATUS_CLS[order.status] || 'bg-surface-sunken text-ink-secondary'}`}>
                      {ORDER_STATUS_LABEL[order.status] || order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">الأصناف الأكثر مبيعًا (30 يوم)</h3>
          {topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">لا توجد مبيعات مسجلة بعد.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.productId} className="border-b border-line">
                    <td className="py-2 pe-3">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted">{p.sku} · {formatMoney(p.totalQty)} وحدة · {p.invoices} فاتورة</p>
                    </td>
                    <td className="py-2 text-end font-semibold">{formatMoney(p.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">نواقص المخزون</h3>
          {lowStock.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">لا توجد أصناف تحت حد الطلب.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p.productId} className="border-b border-line">
                    <td className="py-2 pe-3">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted">{p.sku}</p>
                    </td>
                    <td className="py-2 text-end">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.stockQty <= 0 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
                        {formatMoney(p.stockQty)} / حد {formatMoney(p.minStockLevel)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader title={config.title} description={config.description} />
        <Card><p className="py-10 text-center text-sm text-muted">لا تملك صلاحية عرض بيانات المبيعات.</p></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={config.title}
        description={config.description}
        icon={<Package size={22} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="مبيعات اليوم" value={formatMoney(stats?.todaySales ?? 0)} icon={<Receipt size={16} />} />
        <StatCard label="مبيعات الشهر" value={formatMoney(stats?.monthSales ?? 0)} icon={<Wallet size={16} />} />
        <StatCard label="أصناف تحت حد الطلب" value={stats?.lowStockCount ?? 0} tone={stats?.lowStockCount ? 'warning' : 'default'} icon={<PackageX size={16} />} />
        <StatCard label="عروض أسعار مفتوحة" value={stats?.openQuotes ?? 0} icon={<FileText size={16} />} />
        <StatCard label="طلبات مفتوحة" value={stats?.openOrders ?? 0} icon={<Truck size={16} />} />
      </div>

      <Card>
        <CardHeader
          title={PANEL_TITLES[config.panel]}
          icon={<PanelIcon size={16} />}
          actions={
            <Link to="/pos" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-primary,#0f766e)] hover:underline">
              نقطة البيع <ArrowLeft size={12} />
            </Link>
          }
        />
        <div className="mt-3">{renderPanel()}</div>
      </Card>

      <Card>
        <CardHeader title="اختصارات سريعة" icon={<LayoutGrid size={16} />} />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {config.links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm font-semibold text-ink transition hover:border-[var(--color-primary,#0f766e)] hover:text-[var(--color-primary,#0f766e)]"
            >
              {link.label}
              <ArrowLeft size={14} className="text-muted transition group-hover:text-[var(--color-primary,#0f766e)]" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default RetailWorkspacePage;
