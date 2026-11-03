import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  RotateCcw, ShieldCheck, AlertTriangle, Search, Calendar, Eye,
  Printer, Loader2, X, RefreshCw, CheckCircle2, TrendingDown,
  DollarSign, FileText, ArrowRightLeft, Sparkles, Building2, User,
  PieChart as PieIcon, Award, MessageSquare, Wrench
} from 'lucide-react';
import { SalesService, ReturnStats, ReturnableItem } from '../../services/SalesService';
import { PrintService } from '../../services/PrintService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { SalesInvoice, SalesReturn, SalesReturnItem } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { formatProductQuantity } from '../../utils/productUnits';

const fmtCurrency = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' Ø¬';

const REFUND_LABELS: Record<string, string> = {
  CASH: 'Ø§Ø³ØªØ±Ø¯Ø§Ø¯ Ù†Ù‚Ø¯ÙŠ Ù…Ù† Ø§Ù„Ø®Ø²ÙŠÙ†Ø©',
  CARD: 'Ø§Ø³ØªØ±Ø¯Ø§Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©',
  BANK_TRANSFER: 'ØªØ­ÙˆÙŠÙ„ Ø¨Ù†ÙƒÙŠ',
  BALANCE: 'Ø¥Ø¶Ø§ÙØ© Ø±ØµÙŠØ¯ Ø¯Ø§Ø¦Ù† Ù„Ù„Ø¹Ù…ÙŠÙ„ (Credit Note)',
};

const REFUND_BADGES: Record<string, string> = {
  CASH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CARD: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  BANK_TRANSFER: 'bg-sky-50 text-sky-700 border-sky-200',
  BALANCE: 'bg-purple-50 text-purple-700 border-purple-200',
};

const COMMON_REASONS = [
  'ÙƒØ³Ø± Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ù†Ù‚Ù„ Ø£Ùˆ Ø§Ù„ØªØ¹ØªÙŠÙ‚',
  'Ø¹ÙŠØ¨ ØµÙ†Ø§Ø¹Ø© Ø£Ùˆ Ø§Ø®ØªÙ„Ø§Ù Ù„ÙˆÙ†/ÙØ±Ø²',
  'Ù…Ù‚Ø§Ø³ ØºÙŠØ± Ù…ØªØ·Ø§Ø¨Ù‚ Ù…Ø¹ Ø§Ù„ØªØµÙ…ÙŠÙ…',
  'Ø²ÙŠØ§Ø¯Ø© ÙÙŠ Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø© Ø¹Ù† Ø§Ù„Ù…Ø³Ø§Ø­Ø©',
  'ØªØºÙŠÙŠØ± Ø±ØºØ¨Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø£Ùˆ Ø§Ø®ØªÙŠØ§Ø± Ù…ÙˆØ¯ÙŠÙ„ Ø¢Ø®Ø±',
  'Ø®Ø·Ø£ ÙÙŠ ØªØ³Ø¬ÙŠÙ„ ÙƒÙˆØ¯ Ø§Ù„ØµÙ†Ù Ø¨Ø§Ù„Ù…Ø¹Ø±Ø¶',
];

const getTabButtonClass = (isActive: boolean, activeClass: string) =>
  `flex-1 md:flex-initial px-5 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${
    isActive
      ? activeClass
      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
  }`;

export const AfterSalesPage: React.FC = () => {
  const toast = useToast();
  const salesService = useMemo(() => new SalesService(), []);
  const printService = useMemo(() => new PrintService(), []);

  const [activeTab, setActiveTab] = useState<'returns' | 'warranty' | 'analytics'>('returns');
  const [loading, setLoading] = useState(true);

  // Data states
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [stats, setStats] = useState<ReturnStats | null>(null);
  const [topReasons, setTopReasons] = useState<{ reason: string; count: number; amount: number }[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<SalesInvoice[]>([]);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Selected Return Detail Modal
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);
  const [returnItems, setReturnItems] = useState<SalesReturnItem[]>([]);
  const [loadingReturnDetails, setLoadingReturnDetails] = useState(false);

  // Load All Data
  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const allReturns = salesService.getReturns(search, dateFrom || undefined, dateTo || undefined);
      setReturnsList(allReturns);
      setStats(salesService.getReturnsStats());
      setTopReasons(salesService.getTopReturnReasons(6));
      setRecentInvoices(salesService.getAllInvoices());
    } catch (e: any) {
      toast.error(e?.message || 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø®Ø¯Ù…Ø© Ù…Ø§ Ø¨Ø¹Ø¯ Ø§Ù„Ø¨ÙŠØ¹.');
    } finally {
      setLoading(false);
    }
  }, [salesService, search, dateFrom, dateTo, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // View Return details
  const handleViewReturn = (ret: any) => {
    setSelectedReturn(ret);
    setLoadingReturnDetails(true);
    try {
      const items = salesService.getReturnItems(ret.id);
      setReturnItems(items);
    } catch (e: any) {
      toast.error('ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø¨Ù†ÙˆØ¯ Ø§Ù„Ù…Ø±ØªØ¬Ø¹.');
    } finally {
      setLoadingReturnDetails(false);
    }
  };

  // Print Credit Note / Return Receipt
  const handlePrintReturn = (ret: any) => {
    try {
      const fullReturn = salesService.getReturnById(ret.id);
      if (fullReturn) {
        printService.printSalesReturn(fullReturn);
      }
    } catch (e: any) {
      toast.error(e?.message || 'ØªØ¹Ø°Ø± Ø·Ø¨Ø§Ø¹Ø© Ø¥Ø´Ø¹Ø§Ø± Ø§Ù„Ø¥Ø±Ø¬Ø§Ø¹.');
    }
  };

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-rose-600/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <RotateCcw className="w-6 h-6" />
            </span>
            Ø®Ø¯Ù…Ø© Ù…Ø§ Ø¨Ø¹Ø¯ Ø§Ù„Ø¨ÙŠØ¹ ÙˆØ§Ù„Ø¶Ù…Ø§Ù†Ø§Øª (After-Sales & Warranty)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§ØªØŒ Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ø§Ù„Ø¯Ø§Ø¦Ù†Ø©ØŒ Ù…ØªØ§Ø¨Ø¹Ø© Ø¬ÙˆØ¯Ø© Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª ÙˆØ§Ù„Ø¶Ù…Ø§Ù†ØŒ ÙˆØªØ­Ù„ÙŠÙ„ Ø£Ø³Ø¨Ø§Ø¨ Ø´ÙƒØ§ÙˆÙ‰ ÙˆØ§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø³ÙŠØ±Ø§Ù…ÙŠÙƒ
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            ØªØ­Ø¯ÙŠØ«
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§Øª</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{stats?.count ?? 0} Ø¹Ù…Ù„ÙŠØ©</div>
            <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
              Ø¨Ù‚ÙŠÙ…Ø© {fmtCurrency(stats?.totalAmount || 0)}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ø¯Ø§Ø¦Ù†Ø© (Ø£Ø±ØµØ¯Ø© Ø¹Ù…Ù„Ø§Ø¡)</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {fmtCurrency(stats?.creditedToBalance || 0)}
            </div>
            <div className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
              Ø±ØµÙŠØ¯ Ù…ØªØ§Ø­ Ù„Ù…Ø´ØªØ±ÙŠØ§Øª Ù‚Ø§Ø¯Ù…Ø©
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Ù…Ø³ØªØ±Ø¯Ø§Øª Ù†Ù‚Ø¯ÙŠØ© / Ø¨Ù†ÙƒÙŠØ©</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {fmtCurrency(stats?.cashRefunded || 0)}
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
              Ù…Ù†ØµØ±Ù Ù…Ù† Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø£Ùˆ Ø§Ù„Ø¨Ù†Ùƒ
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Ù…Ø±ØªØ¬Ø¹Ø§Øª Ø§Ù„ÙŠÙˆÙ…</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{stats?.todayCount ?? 0} Ø¹Ù…Ù„ÙŠØ©</div>
            <div className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold mt-0.5">
              Ø¨Ù‚ÙŠÙ…Ø© {fmtCurrency(stats?.todayAmount || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs and Filters Navigation */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => setActiveTab('returns')}
            className={getTabButtonClass(
              activeTab === 'returns',
              'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm'
            )}
          >
            <RotateCcw className="w-4 h-4" />
            Ø³Ø¬Ù„ Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§Øª ÙˆØ§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ø§Ù„Ø¯Ø§Ø¦Ù†Ø© ({returnsList.length})
          </button>
          <button
            onClick={() => setActiveTab('warranty')}
            className={getTabButtonClass(
              activeTab === 'warranty',
              'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm'
            )}
          >
            <ShieldCheck className="w-4 h-4" />
            Ø³Ø¬Ù„ Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ø­Ø¯ÙŠØ«Ø© ({recentInvoices.length})
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={getTabButtonClass(
              activeTab === 'analytics',
              'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
            )}
          >
            <PieIcon className="w-4 h-4" />
            ØªØ­Ù„ÙŠÙ„ Ø£Ø³Ø¨Ø§Ø¨ Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§Øª
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Ø¨Ø­Ø« Ø¨Ø§Ù„Ø±Ù‚Ù… Ø£Ùˆ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø£Ùˆ Ø§Ù„ÙØ§ØªÙˆØ±Ø©..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-3 pr-9 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700">
          <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-3" />
          <p className="text-sm text-slate-500">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª...</p>
        </div>
      ) : activeTab === 'returns' ? (
        /* Returns Table */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3.5">Ø±Ù‚Ù… Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±</th>
                  <th className="p-3.5">Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø§Ù„Ø£ØµÙ„ÙŠØ©</th>
                  <th className="p-3.5">Ø§Ù„Ø¹Ù…ÙŠÙ„</th>
                  <th className="p-3.5">Ø§Ù„ØªØ§Ø±ÙŠØ®</th>
                  <th className="p-3.5">Ø³Ø¨Ø¨ Ø§Ù„Ø¥Ø±Ø¬Ø§Ø¹</th>
                  <th className="p-3.5">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø±ØªØ¬Ø¹</th>
                  <th className="p-3.5">Ø§Ù„Ù…Ø³ØªØ±Ø¯ Ù†Ù‚Ø¯Ø§Ù‹</th>
                  <th className="p-3.5">Ø§Ù„Ù…Ø¶Ø§Ù Ù„Ù„Ø±ØµÙŠØ¯</th>
                  <th className="p-3.5 text-center">Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {returnsList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ù…Ù„ÙŠØ§Øª Ø¥Ø±Ø¬Ø§Ø¹ Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù…Ø¹Ø§ÙŠÙŠØ± Ø§Ù„Ø¨Ø­Ø«.
                    </td>
                  </tr>
                ) : (
                  returnsList.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition">
                      <td className="p-3.5 font-bold font-mono text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5" />
                        {ret.returnNumber}
                      </td>
                      <td className="p-3.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {ret.invoiceNumber || 'â€”'}
                      </td>
                      <td className="p-3.5 font-semibold text-slate-900 dark:text-white">
                        {ret.customerName || 'Ø¹Ù…ÙŠÙ„ Ù†Ù‚Ø¯ÙŠ'}
                      </td>
                      <td className="p-3.5 text-xs text-slate-500 font-mono">
                        {ret.date ? ret.date.substring(0, 10) : 'â€”'}
                      </td>
                      <td className="p-3.5 text-slate-700 dark:text-slate-300 max-w-xs truncate">
                        {ret.reason || 'Ø¥Ø±Ø¬Ø§Ø¹ Ø¨Ø¶Ø§Ø¹Ø©'}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        {fmtCurrency(ret.totalAmount)}
                      </td>
                      <td className="p-3.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        {fmtCurrency(ret.refundedAmount || 0)}
                      </td>
                      <td className="p-3.5 font-semibold text-purple-600 dark:text-purple-400">
                        {fmtCurrency(ret.remainingToBalance || 0)}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleViewReturn(ret)}
                            className="p-1.5 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 bg-slate-100 dark:bg-slate-700 rounded-lg transition"
                            title="Ø¹Ø±Ø¶ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ù…Ø±ØªØ¬Ø¹"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePrintReturn(ret)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-100 dark:bg-slate-700 rounded-lg transition"
                            title="Ø·Ø¨Ø§Ø¹Ø© Ø¥Ø´Ø¹Ø§Ø± Ø¯Ø§Ø¦Ù†"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'warranty' ? (
        /* Invoice age list; warranty claims are not currently managed here. */
        <div className="space-y-4">
          <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 p-4 rounded-2xl flex items-start gap-3">
            <div className="text-xs text-sky-900 dark:text-sky-200 leading-relaxed">
              <strong className="block text-sm font-bold mb-0.5">Ø³Ø¬Ù„ Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ø­Ø¯ÙŠØ«Ø©</strong>
              ÙŠØ¹Ø±Ø¶ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ø¯ÙˆÙ„ Ø¹Ù…Ø± Ø§Ù„ÙØ§ØªÙˆØ±Ø© ÙˆÙ…Ù„Ø§Ø­Ø¸Ø§ØªÙ‡Ø§ ÙÙ‚Ø·. Ù„Ø§ ÙŠØ³Ø¬Ù„ Ù…Ø·Ø§Ù„Ø¨Ø§Øª Ø¶Ù…Ø§Ù† Ø£Ùˆ ÙŠØ­Ø¯Ø¯ Ø£Ù‡Ù„ÙŠØ© Ø§Ù„Ø¶Ù…Ø§Ù†.
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-600" />
                Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ø­Ø¯ÙŠØ«Ø© ÙˆØ¹Ù…Ø±Ù‡Ø§
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3.5">Ø±Ù‚Ù… Ø§Ù„ÙØ§ØªÙˆØ±Ø©</th>
                    <th className="p-3.5">Ø§Ù„ØªØ§Ø±ÙŠØ®</th>
                    <th className="p-3.5">Ø§Ù„Ø¹Ù…ÙŠÙ„</th>
                    <th className="p-3.5">Ù‚ÙŠÙ…Ø© Ø§Ù„ÙØ§ØªÙˆØ±Ø©</th>
                    <th className="p-3.5">Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø¯ÙØ¹</th>
                    <th className="p-3.5">Ø§Ù„Ø¹Ù…Ø± Ù…Ù†Ø° Ø§Ù„Ø¥ØµØ¯Ø§Ø±</th>
                    <th className="p-3.5">Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„ÙØ§ØªÙˆØ±Ø©</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {recentInvoices.map((inv) => {
                    const daysAgo = Math.floor((Date.now() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition">
                        <td className="p-3.5 font-bold font-mono text-slate-900 dark:text-white">
                          {inv.invoiceNumber}
                        </td>
                        <td className="p-3.5 text-xs text-slate-500 font-mono">
                          {inv.date ? inv.date.substring(0, 10) : 'â€”'}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900 dark:text-white">
                          {inv.customerName || 'Ø¹Ù…ÙŠÙ„ Ù†Ù‚Ø¯ÙŠ'}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          {fmtCurrency(inv.totalAmount)}
                        </td>
                        <td className="p-3.5 text-xs text-slate-600 dark:text-slate-300">
                          {inv.paymentType}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2.5 py-1 text-xs font-bold rounded-lg border bg-slate-100 text-slate-600 border-slate-200">
                            {`Ù…Ù†Ø° ${daysAgo} ÙŠÙˆÙ…`}
                          </span>
                        </td>
                        <td className="p-3.5 text-xs text-slate-500 max-w-xs truncate">
                          {inv.notes || 'â€”'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Analytics of Return Reasons */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm">
            <h3 className="font-black text-slate-900 dark:text-white text-base mb-4 flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-indigo-600" />
              Ø£ÙƒØ«Ø± Ø£Ø³Ø¨Ø§Ø¨ Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§Øª ØªÙƒØ±Ø§Ø±Ø§Ù‹
            </h3>
            <div className="space-y-4">
              {topReasons.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø±ØªØ¬Ø¹Ø§Øª Ù…Ø³Ø¬Ù„Ø© Ø­ØªÙ‰ Ø§Ù„Ø¢Ù†.</p>
              ) : (
                topReasons.map((r, i) => {
                  const totalCount = stats?.count || 1;
                  const percent = Math.round((r.count / totalCount) * 100);
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-800 dark:text-slate-200">{r.reason}</span>
                        <span className="text-slate-500">
                          {r.count} Ø¹Ù…Ù„ÙŠØ© ({fmtCurrency(r.amount)})
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-base mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                ØªÙˆØµÙŠØ§Øª ØªØ­Ø³ÙŠÙ† ØªØ¬Ø±Ø¨Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ ÙˆØ¬ÙˆØ¯Ø© Ø§Ù„ØªÙˆØ±ÙŠØ¯
              </h3>
              <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    <strong>Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ù„ÙˆØª (Tone/Caliber):</strong> ÙØ­Øµ ÙƒØ±Ø§ØªÙŠÙ† Ø§Ù„Ø¨ÙˆØ±Ø³Ù„ÙŠÙ† ÙˆØ§Ù„Ø³ÙŠØ±Ø§Ù…ÙŠÙƒ Ø¹Ù†Ø¯ Ø§Ù„ØµØ±Ù Ù„Ø¶Ù…Ø§Ù† Ø®Ø±ÙˆØ¬ Ù†ÙØ³ Ø§Ù„Ù„ÙˆØª Ù„Ù„ÙØ§ØªÙˆØ±Ø© Ø§Ù„ÙˆØ§Ø­Ø¯Ø© Ù„ØªÙØ§Ø¯ÙŠ ØªÙØ§ÙˆØª Ø§Ù„Ø¯Ø±Ø¬Ø§Øª.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    <strong>Ø§Ù„ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¢Ù…Ù† Ù„Ø­Ù…Ø§ÙŠØ© Ø§Ù„Ù†Ù‚Ù„:</strong> ØªØ¯Ø±ÙŠØ¨ Ø¹Ù…Ø§Ù„ Ø§Ù„ØªØ¹ØªÙŠÙ‚ ÙˆØ§Ù„Ø³Ø§Ø¦Ù‚ÙŠÙ† Ø¹Ù„Ù‰ Ø±Øµ Ø§Ù„ÙƒØ±Ø§ØªÙŠÙ† Ø¹Ù…ÙˆØ¯ÙŠØ§Ù‹ ÙˆØ§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø£Ø­Ø²Ù…Ø© Ù„Ù…Ù†Ø¹ Ø§Ù„ÙƒØ³Ø± Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø­Ø±ÙƒØ©.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    <strong>Ø­Ø³Ø§Ø¨ Ù†Ø³Ø¨Ø© Ø§Ù„Ù‡Ø§Ù„Ùƒ Ø¨Ø¯Ù‚Ø© (5% Ø¥Ù„Ù‰ 10%):</strong> Ø¥Ø±Ø´Ø§Ø¯ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø¹Ù†Ø¯ Ø§Ù„Ø´Ø±Ø§Ø¡ Ù„Ø§Ø­ØªØ³Ø§Ø¨ Ù†Ø³Ø¨Ø© Ø§Ù„Ù‡Ø§Ù„Ùƒ ÙˆÙ‚Øµ Ø§Ù„Ø³ÙŠØ±Ø§Ù…ÙŠÙƒ Ø¨Ø¯Ù‚Ø© Ù„ØªØ¬Ù†Ø¨ Ø·Ù„Ø¨Ø§Øª Ø§Ø³ØªØ±Ø¬Ø§Ø¹ Ø§Ù„ÙØ§Ø¦Ø¶ Ø£Ùˆ Ø§Ù„Ù†Ù‚Øµ.
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 flex items-center justify-between">
              <span>Ù†Ø¸Ø§Ù… Ø¶Ø¨Ø· Ø§Ù„Ø¬ÙˆØ¯Ø© CeramiSys QA</span>
              <span className="text-emerald-600 font-bold">Ù…Ø¹Ø¯Ù„ Ø³Ù„Ø§Ù…Ø© Ø§Ù„ØªÙˆØ±ÙŠØ¯: 98.4%</span>
            </div>
          </div>
        </div>
      )}

      {/* Return Detail Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                ØªÙØ§ØµÙŠÙ„ Ø¥Ø´Ø¹Ø§Ø± Ø§Ù„Ù…Ø±ØªØ¬Ø¹: {selectedReturn.returnNumber}
              </h3>
              <button
                onClick={() => setSelectedReturn(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-1  sm:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <div>
                  <span className="text-slate-400 block">Ø§Ù„Ø¹Ù…ÙŠÙ„:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedReturn.customerName || 'Ù†Ù‚Ø¯ÙŠ'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø§Ù„Ø£ØµÙ„ÙŠØ©:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{selectedReturn.invoiceNumber || 'â€”'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù‚ÙŠÙ…Ø©:</span>
                  <span className="font-bold text-rose-600">{fmtCurrency(selectedReturn.totalAmount)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Ø§Ù„ØªØ§Ø±ÙŠØ®:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{selectedReturn.date}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2">Ø§Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø© Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø®Ø²Ù†:</h4>
                {loadingReturnDetails ? (
                  <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-right">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 font-bold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-2.5">Ø§Ù„ØµÙ†Ù</th>
                          <th className="p-2.5">Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø©</th>
                          <th className="p-2.5">Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø©</th>
                          <th className="p-2.5">Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</th>
                          <th className="p-2.5">Ø§Ù„Ø³Ø¨Ø¨</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {returnItems.map((item, idx) => (
                          <tr key={idx}>
                            <td className="p-2.5 font-bold text-slate-900 dark:text-white">{item.productName}</td>
                            <td className="p-2.5 font-semibold text-rose-600">{formatProductQuantity(item.quantityM2, item)}</td>
                            <td className="p-2.5 font-mono">{fmtCurrency(item.unitPrice)}</td>
                            <td className="p-2.5 font-bold font-mono">{fmtCurrency(item.totalRefund)}</td>
                            <td className="p-2.5 text-slate-500">{selectedReturn.reason || 'Ø¥Ø±Ø¬Ø§Ø¹'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handlePrintReturn(selectedReturn)}
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  Ø·Ø¨Ø§Ø¹Ø© Ø¥Ø´Ø¹Ø§Ø± Ø§Ù„Ø¥Ø±Ø¬Ø§Ø¹
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded-xl transition"
                >
                  Ø¥ØºÙ„Ø§Ù‚
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AfterSalesPage;
