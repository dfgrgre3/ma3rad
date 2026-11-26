import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardRefresh } from '../../../contexts/DashboardRefreshContext';
import { useDashboardEmbed } from '../../../contexts/DashboardEmbedContext';
import {
  Truck, Users, Car, Clock, CheckCircle2, AlertCircle, XCircle,
  Loader2, RefreshCw, ArrowUpRight, Calendar, Package,
  DollarSign, UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OperationsService, Delivery } from '../../../services/domains/operations/OperationsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { StatCard as UiStatCard } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActivityGate } from '../../../components/ui/ActivityGate';


const statTone = (cls: string): 'default' | 'success' | 'danger' | 'warning' =>
  /rose|red|danger/.test(cls) ? 'danger' : /amber|orange/.test(cls) ? 'warning' : /emerald|green|success/.test(cls) ? 'success' : 'default';

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <UiStatCard
      label={label}
      value={value}
      hint={sub}
      icon={Icon ? <Icon className="h-5 w-5" /> : undefined}
      tone={statTone(color || bg || '')}
    />
  );
}
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n || 0);
const fmtM = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'ك' : fmt(n);

interface FleetStats {
  totalDeliveries: number;
  pendingDeliveries: number;
  inTransitDeliveries: number;
  deliveredToday: number;
  failedDeliveries: number;
  totalFees: number;
  activeDrivers: number;
  availableVehicles: number;
  vehiclesOnDelivery: number;
  vehiclesMaintenance: number;
  recentDeliveries: Delivery[];
  driverStats: { name: string; trips: number; delivered: number; failed: number }[];
}

const DELIVERY_STATUS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'في الانتظار', color: 'text-ink-secondary bg-surface-muted border-line', icon: Clock },
  SCHEDULED: { label: 'مجدولة', color: 'text-primary bg-accent-soft border-accent-border', icon: Calendar },
  IN_TRANSIT: { label: 'في الطريق', color: 'text-primary bg-accent-soft border-accent-border', icon: Truck },
  DELIVERED: { label: 'تم التسليم', color: 'text-success bg-success-soft border-success-border', icon: CheckCircle2 },
  FAILED: { label: 'فشل التسليم', color: 'text-danger bg-danger-soft border-danger-border', icon: XCircle },
  CANCELLED: { label: 'ملغاة', color: 'text-muted bg-surface-muted border-line', icon: XCircle },
};

function buildFleetStats(service: OperationsService): FleetStats {
  const deliveries = service.getDeliveries();
  const drivers = service.getDrivers();
  const vehicles = service.getVehicles();
  const today = new Date().toISOString().split('T')[0];

  const deliveredToday = deliveries.filter(d => d.status === 'DELIVERED' && d.date === today).length;
  const totalFees = deliveries.filter(d => d.status === 'DELIVERED').reduce((s, d) => s + (d.deliveryFee || 0), 0);

  // Driver stats
  const driverMap: Record<string, { name: string; trips: number; delivered: number; failed: number }> = {};
  deliveries.forEach(d => {
    if (!d.driverId) return;
    const name = (d as any).driver_name || d.driverId;
    if (!driverMap[d.driverId]) driverMap[d.driverId] = { name, trips: 0, delivered: 0, failed: 0 };
    driverMap[d.driverId].trips++;
    if (d.status === 'DELIVERED') driverMap[d.driverId].delivered++;
    if (d.status === 'FAILED') driverMap[d.driverId].failed++;
  });

  return {
    totalDeliveries: deliveries.length,
    pendingDeliveries: deliveries.filter(d => ['PENDING', 'SCHEDULED'].includes(d.status)).length,
    inTransitDeliveries: deliveries.filter(d => d.status === 'IN_TRANSIT').length,
    deliveredToday,
    failedDeliveries: deliveries.filter(d => d.status === 'FAILED').length,
    totalFees,
    activeDrivers: drivers.filter(d => d.isActive).length,
    availableVehicles: vehicles.filter(v => v.status === 'AVAILABLE' && v.isActive).length,
    vehiclesOnDelivery: vehicles.filter(v => v.status === 'ON_DELIVERY').length,
    vehiclesMaintenance: vehicles.filter(v => v.status === 'MAINTENANCE').length,
    recentDeliveries: deliveries.slice(0, 8),
    driverStats: Object.values(driverMap).sort((a, b) => b.trips - a.trips).slice(0, 5),
  };
}

function RecentDeliveries({ deliveries }: { deliveries: Delivery[] }) {
  const navigate = useNavigate();
  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-black text-ink">أحدث التوصيلات</h3>
        </div>
        <button onClick={() => navigate('/deliveries')} className="text-xs font-bold text-primary hover:text-primary flex items-center gap-1">
          الكل <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
      {deliveries.length === 0 ? (
        <p className="text-xs text-muted text-center py-6">لا توجد توصيلات بعد</p>
      ) : (
        <div className="space-y-2">
          {deliveries.map(d => {
            const status = DELIVERY_STATUS[d.status] || DELIVERY_STATUS.PENDING;
            const Icon = status.icon;
            return (
              <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-muted transition">
                <Icon className={`w-4 h-4 shrink-0 ${status.color.split(' ')[0]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{(d as any).customer_name || 'عميل'}</p>
                  <p className="text-xs text-muted truncate">{d.address || d.city}</p>
                </div>
                <div className="text-left shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${status.color}`}>{status.label}</span>
                  <p className="text-xs text-muted mt-0.5 text-left">{d.deliveryFee ? fmtM(d.deliveryFee) + ' ج' : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DriverLeaderboard({ stats }: { stats: FleetStats['driverStats'] }) {
  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center gap-2 mb-4">
        <UserRound className="w-4 h-4 text-success" />
        <h3 className="text-sm font-black text-ink">أداء السائقين</h3>
      </div>
      {stats.length === 0 ? (
        <p className="text-xs text-muted text-center py-6">لا توجد بيانات</p>
      ) : (
        <div className="space-y-3">
          {stats.map((d, i) => {
            const successRate = d.trips > 0 ? Math.round((d.delivered / d.trips) * 100) : 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                  i === 0 ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-ink-secondary'
                }`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{d.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 bg-surface-sunken rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-success rounded-full" style={{ width: `${successRate}%` }} />
                    </div>
                    <span className="text-xs text-success font-bold">{successRate}%</span>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-xs font-black text-ink">{d.trips} رحلة</p>
                  <p className="text-xs text-muted">{d.delivered} ناجحة</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const FleetDashboardPage: React.FC = () => {
  const refreshToken = useDashboardRefresh()?.refreshToken;
  const embedded = useDashboardEmbed();
  const initialRef = useRef(true);
  const service = useMemo(() => new OperationsService(), []);
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'deliveries.view');
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setStats(buildFleetStats(service));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات الأسطول.');
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  useEffect(() => {
    if (refreshToken === undefined || !canView) return;
    if (initialRef.current) { initialRef.current = false; return; }
    load();
  }, [refreshToken, canView, load]);

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-3 flex-shrink-0">
          <ActivityGate element="delivery"><button onClick={() => navigate('/deliveries')} className="text-xs font-bold text-white bg-primary hover:bg-primary transition px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> التوصيلات
          </button></ActivityGate>
          <ActivityGate element="driver"><button onClick={() => navigate('/drivers')} className="text-xs font-bold text-primary bg-accent-soft hover:bg-accent-soft transition px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-accent-border">
            <UserRound className="w-3.5 h-3.5" /> السائقون
          </button></ActivityGate>
          <button onClick={load} className="p-1.5 hover:bg-surface-sunken rounded-lg transition">
            <RefreshCw className={`w-4 h-4 text-muted ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      ) : (
      <div className="bg-surface px-6 pt-4 flex-shrink-0">
        <PageHeader
          icon={<Truck className="h-5 w-5" />}
          title="لوحة تحكم التوصيل والأسطول"
          description="إدارة التوصيل والسائقين والمركبات"
          actions={<>
            <ActivityGate element="delivery"><button onClick={() => navigate('/deliveries')} className="text-xs font-bold text-white bg-primary hover:bg-primary transition px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" /> التوصيلات
            </button></ActivityGate>
            <ActivityGate element="driver"><button onClick={() => navigate('/drivers')} className="text-xs font-bold text-primary bg-accent-soft hover:bg-accent-soft transition px-3 py-2 rounded-lg flex items-center gap-1.5 border border-accent-border">
              <UserRound className="w-3.5 h-3.5" /> السائقون
            </button></ActivityGate>
            <button onClick={load} className="p-2 hover:bg-surface-sunken rounded-lg transition">
              <RefreshCw className={`w-4 h-4 text-muted ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>}
        />
      </div>
      )}

      {error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : stats ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="إجمالي التوصيلات" value={fmt(stats.totalDeliveries)} sub={`${stats.deliveredToday} سُلّمت اليوم`} icon={Package} color="text-primary" bg="bg-accent-soft" />
            <StatCard label="إيرادات التوصيل" value={fmtM(stats.totalFees) + ' ج'} sub="من التوصيلات المكتملة" icon={DollarSign} color="text-success" bg="bg-success-soft" />
            <StatCard label="سائقون نشطون" value={fmt(stats.activeDrivers)} sub={`مركبات متاحة: ${stats.availableVehicles}`} icon={Users} color="text-primary" bg="bg-accent-soft" />
            <StatCard label="توصيلات فاشلة" value={fmt(stats.failedDeliveries)} sub="تحتاج مراجعة" icon={XCircle} color="text-danger" bg="bg-danger-soft" />
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'في الانتظار', value: stats.pendingDeliveries, color: 'text-ink bg-surface-muted border-line', icon: Clock },
              { label: 'في الطريق الآن', value: stats.inTransitDeliveries, color: 'text-primary bg-accent-soft border-accent-border', icon: Truck },
              { label: 'مركبات في صيانة', value: stats.vehiclesMaintenance, color: 'text-warning bg-warning-soft border-warning-border', icon: Car },
              { label: 'سُلِّمت اليوم', value: stats.deliveredToday, color: 'text-success bg-success-soft border-success-border', icon: CheckCircle2 },
            ].map(item => (
              <div key={item.label} className={`flex items-center gap-3 p-4 rounded-2xl border ${item.color}`}>
                <item.icon className="w-5 h-5 shrink-0" />
                <div>
                  <p className="text-xl font-black">{item.value}</p>
                  <p className="text-xs font-medium opacity-80">{item.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentDeliveries deliveries={stats.recentDeliveries} />
            <DriverLeaderboard stats={stats.driverStats} />
          </div>

          {/* Navigation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'أوامر التوصيل', desc: 'إنشاء ومتابعة التوصيلات', icon: Truck, to: '/deliveries', color: 'from-primary to-primary' },
              { label: 'السائقون', desc: 'إدارة بيانات السائقين', icon: UserRound, to: '/drivers', color: 'from-primary to-primary' },
              { label: 'المركبات', desc: 'بيانات الأسطول والحالة', icon: Car, to: '/vehicles', color: 'from-muted to-ink' },
            ].map(card => (
              <button key={card.to} onClick={() => navigate(card.to)}
                className={`bg-gradient-to-br ${card.color} text-white rounded-2xl p-4 text-right hover:opacity-90 hover:shadow-lg transition-all`}
              >
                <card.icon className="w-6 h-6 mb-2 opacity-90" />
                <p className="text-sm font-black">{card.label}</p>
                <p className="text-xs opacity-70 mt-0.5">{card.desc}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
