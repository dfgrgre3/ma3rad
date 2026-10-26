import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck, Users, Car, MapPin, Clock, CheckCircle2, AlertCircle, XCircle,
  Loader2, RefreshCw, BarChart3, ArrowUpRight, Calendar, Package,
  DollarSign, TrendingUp, UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OperationsService, Delivery, Driver, Vehicle } from '../../services/OperationsService';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

const db = DatabaseManager.getInstance();
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
  PENDING: { label: 'في الانتظار', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Clock },
  SCHEDULED: { label: 'مجدولة', color: 'text-violet-600 bg-violet-50 border-violet-200', icon: Calendar },
  IN_TRANSIT: { label: 'في الطريق', color: 'text-sky-600 bg-sky-50 border-sky-200', icon: Truck },
  DELIVERED: { label: 'تم التسليم', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  FAILED: { label: 'فشل التسليم', color: 'text-rose-600 bg-rose-50 border-rose-200', icon: XCircle },
  CANCELLED: { label: 'ملغاة', color: 'text-slate-400 bg-slate-50 border-slate-100', icon: XCircle },
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

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-black text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function RecentDeliveries({ deliveries }: { deliveries: Delivery[] }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-sky-500" />
          <h3 className="text-sm font-black text-slate-900">أحدث التوصيلات</h3>
        </div>
        <button onClick={() => navigate('/deliveries')} className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1">
          الكل <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
      {deliveries.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">لا توجد توصيلات بعد</p>
      ) : (
        <div className="space-y-2">
          {deliveries.map(d => {
            const status = DELIVERY_STATUS[d.status] || DELIVERY_STATUS.PENDING;
            const Icon = status.icon;
            return (
              <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition">
                <Icon className={`w-4 h-4 shrink-0 ${status.color.split(' ')[0]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{(d as any).customer_name || 'عميل'}</p>
                  <p className="text-xs text-slate-400 truncate">{d.address || d.city}</p>
                </div>
                <div className="text-left shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${status.color}`}>{status.label}</span>
                  <p className="text-xs text-slate-400 mt-0.5 text-left">{d.deliveryFee ? fmtM(d.deliveryFee) + ' ج' : ''}</p>
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
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <UserRound className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-black text-slate-900">أداء السائقين</h3>
      </div>
      {stats.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">لا توجد بيانات</p>
      ) : (
        <div className="space-y-3">
          {stats.map((d, i) => {
            const successRate = d.trips > 0 ? Math.round((d.delivered / d.trips) * 100) : 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                }`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{d.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${successRate}%` }} />
                    </div>
                    <span className="text-xs text-emerald-600 font-bold">{successRate}%</span>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-xs font-black text-slate-900">{d.trips} رحلة</p>
                  <p className="text-xs text-slate-400">{d.delivered} ناجحة</p>
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
  const service = useMemo(() => new OperationsService(), []);
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'deliveries.view');
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    try {
      setStats(buildFleetStats(service));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات الأسطول.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canView) load(); }, []);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">لوحة تحكم التوصيل والأسطول</h1>
            <p className="text-xs text-slate-400">إدارة التوصيل والسائقين والمركبات</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/deliveries')} className="text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 transition px-3 py-2 rounded-lg flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> التوصيلات
          </button>
          <button onClick={() => navigate('/drivers')} className="text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 transition px-3 py-2 rounded-lg flex items-center gap-1.5 border border-sky-200">
            <UserRound className="w-3.5 h-3.5" /> السائقون
          </button>
          <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      ) : stats ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="إجمالي التوصيلات" value={fmt(stats.totalDeliveries)} sub={`${stats.deliveredToday} سُلّمت اليوم`} icon={Package} color="text-sky-600" bg="bg-sky-50" />
            <StatCard label="إيرادات التوصيل" value={fmtM(stats.totalFees) + ' ج'} sub="من التوصيلات المكتملة" icon={DollarSign} color="text-emerald-600" bg="bg-emerald-50" />
            <StatCard label="سائقون نشطون" value={fmt(stats.activeDrivers)} sub={`مركبات متاحة: ${stats.availableVehicles}`} icon={Users} color="text-violet-600" bg="bg-violet-50" />
            <StatCard label="توصيلات فاشلة" value={fmt(stats.failedDeliveries)} sub="تحتاج مراجعة" icon={XCircle} color="text-rose-600" bg="bg-rose-50" />
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'في الانتظار', value: stats.pendingDeliveries, color: 'text-slate-700 bg-slate-50 border-slate-200', icon: Clock },
              { label: 'في الطريق الآن', value: stats.inTransitDeliveries, color: 'text-sky-700 bg-sky-50 border-sky-200', icon: Truck },
              { label: 'مركبات في صيانة', value: stats.vehiclesMaintenance, color: 'text-amber-700 bg-amber-50 border-amber-200', icon: Car },
              { label: 'سُلِّمت اليوم', value: stats.deliveredToday, color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'أوامر التوصيل', desc: 'إنشاء ومتابعة التوصيلات', icon: Truck, to: '/deliveries', color: 'from-sky-500 to-blue-600' },
              { label: 'السائقون', desc: 'إدارة بيانات السائقين', icon: UserRound, to: '/drivers', color: 'from-violet-500 to-purple-600' },
              { label: 'المركبات', desc: 'بيانات الأسطول والحالة', icon: Car, to: '/vehicles', color: 'from-slate-500 to-slate-700' },
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
