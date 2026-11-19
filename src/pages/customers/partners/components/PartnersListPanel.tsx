import React from 'react';
import { Search, Users } from 'lucide-react';
import { formatMoney, formatNumber } from '../PartnersPage/partnersModel';
import type { PartnersPageVm } from '../../../../hooks/pages/customers/partners/usePartnersPage';

export const PartnersListPanel: React.FC<{ vm: PartnersPageVm }> = ({ vm }) => {
  const { loading, search, setSearch, visiblePartners, selectedId, tab, selectPartner, canManage, openNewPartner } = vm;
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 p-3 dark:border-slate-700">
        <label className="relative block">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن شريك..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </label>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {loading ? <p className="p-6 text-center text-sm text-slate-500">جارٍ تحميل الشركاء...</p>
          : visiblePartners.length === 0 ? (
            <div className="p-7 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{search ? 'لا توجد نتائج مطابقة.' : 'لم تتم إضافة شركاء بعد.'}</p>
              {canManage && !search && <button type="button" onClick={openNewPartner} className="mt-3 text-sm font-bold text-sky-700 hover:underline dark:text-sky-300">أضف أول شريك</button>}
            </div>
          ) : visiblePartners.map((partner) => (
            <button key={partner.id} type="button" onClick={() => selectPartner(partner.id)} className={`block w-full border-b border-slate-100 p-4 text-right transition dark:border-slate-800 ${selectedId === partner.id && tab === 'statement' ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-extrabold text-slate-800 dark:text-slate-100">{partner.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${partner.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500'}`}>
                  {partner.isActive ? 'نشط' : 'غير نشط'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{formatNumber.format(partner.ownershipPercent)}% ملكية</span>
                <span className={partner.netBalance < 0 ? 'font-bold text-rose-600' : 'font-bold text-slate-700 dark:text-slate-300'}>{formatMoney(partner.netBalance)}</span>
              </div>
            </button>
          ))}
      </div>
    </section>
  );
};
