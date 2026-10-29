import React from 'react';
import {
  ArrowRight, Phone, Mail, DollarSign, Pencil, Printer,
} from 'lucide-react';
import { Supplier } from '../../../types';
import { CeramicMath } from '../../../utils/ceramicMath';
import { TABS, Tab } from './types';
import { useBusinessProfileMeta, useBusinessTerm } from '../../../hooks/useBusinessTerm';

export interface SupplierHeaderProps {
  supplier: Supplier;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onBack: () => void;
  invoiceCount: number;
  paymentCount: number;
  orderCount: number;
  returnCount: number;
  canUpdate: boolean;
  canPay: boolean;
  canDelete: boolean;
  canViewPurchases: boolean;
  canViewFinancials: boolean;
  canExportStatement: boolean;
  onOpenPaymentModal: () => void;
  onOpenEditModal: () => void;
  onToggleStatus: () => void;
  onPrintStatement: () => void;
}

export const SupplierHeader: React.FC<SupplierHeaderProps> = ({
  supplier,
  activeTab,
  onTabChange,
  onBack,
  invoiceCount,
  paymentCount,
  orderCount,
  returnCount,
  canUpdate,
  canPay,
  canDelete,
  canViewPurchases,
  canViewFinancials,
  canExportStatement,
  onOpenPaymentModal,
  onOpenEditModal,
  onToggleStatus,
  onPrintStatement,
}) => {
  const suppliersLabel = useBusinessTerm('entities.suppliers.plural');
  const { label: businessProfileLabel } = useBusinessProfileMeta();

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
            title="رجوع لقائمة الموردين"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center font-black text-2xl shadow-md shadow-sky-500/20">
            {supplier.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                {supplier.code}
              </span>
              {supplier.isActive === 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                  غير نشط
                </span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  نشط
                </span>
              )}
              {canViewFinancials && supplier.currentBalance > 0 && (
                <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-black text-rose-700 border border-rose-200">
                  مستحق للمورد: {CeramicMath.formatCurrency(supplier.currentBalance)}
                </span>
              )}
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <span>{supplier.name}</span>
              {supplier.companyName && (
                <span className="text-sm font-normal text-slate-500">({supplier.companyName})</span>
              )}
            </h1>
            <div className="mt-1 text-[11px] font-bold text-sky-700">{suppliersLabel} · {businessProfileLabel}</div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1">
              {supplier.phone && (
                <a href={`tel:${supplier.phone}`} className="flex items-center gap-1 hover:text-sky-600 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{supplier.phone}</span>
                </a>
              )}
              {supplier.email && (
                <a href={`mailto:${supplier.email}`} className="flex items-center gap-1 hover:text-sky-600">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{supplier.email}</span>
                </a>
              )}
              {supplier.taxNumber && (
                <span className="flex items-center gap-1">
                  <span className="text-slate-400">الرقم الضريبي:</span>
                  <span className="font-mono font-bold text-slate-700">{supplier.taxNumber}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canPay && (
            <button
              onClick={onOpenPaymentModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition"
            >
              <DollarSign className="w-4 h-4" />
              <span>سند صرف دفعة</span>
            </button>
          )}

          {canUpdate && (
            <button
              onClick={onOpenEditModal}
              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>تعديل البيانات</span>
            </button>
          )}

          {canDelete && (
            <button
              onClick={onToggleStatus}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                supplier.isActive === 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {supplier.isActive === 0 ? 'إعادة التفعيل' : 'تعطيل الحساب'}
            </button>
          )}

          {canExportStatement && <button
            onClick={onPrintStatement}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة كشف الحساب</span>
          </button>}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 mt-4 overflow-x-auto border-t border-slate-100 pt-3">
        {TABS.filter((t) => {
          if (['invoices', 'orders', 'returns', 'scorecard', 'price_history'].includes(t.id)) return canViewPurchases;
          if (['payments', 'statement'].includes(t.id)) return canViewFinancials;
          return true;
        }).map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          let countBadge: number | null = null;
          if (t.id === 'invoices') countBadge = invoiceCount;
          if (t.id === 'payments') countBadge = paymentCount;
          if (t.id === 'orders') countBadge = orderCount;
          if (t.id === 'returns') countBadge = returnCount;

          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition whitespace-nowrap ${
                isActive
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              {countBadge !== null && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    isActive ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {countBadge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
