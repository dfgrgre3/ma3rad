import React from 'react';
import { Search, Users } from 'lucide-react';
import { formatMoney, formatNumber } from '../PartnersPage/partnersModel';
import type { PartnersPageVm } from '../../../../hooks/pages/customers/partners/usePartnersPage';

export const PartnersListPanel: React.FC<{ vm: PartnersPageVm }> = ({ vm }) => {
  const { loading, search, setSearch, visiblePartners, selectedId, tab, selectPartner, canManage, openNewPartner } = vm;
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface ">
      <div className="border-b border-line p-3 ">
        <label className="relative block">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن شريك..." className="w-full rounded-lg border border-line bg-surface-muted py-2 pr-9 pl-3 text-sm dark:text-muted" />
        </label>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {loading ? <p className="p-6 text-center text-sm text-muted">جارٍ تحميل الشركاء...</p>
          : visiblePartners.length === 0 ? (
            <div className="p-7 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-muted" />
              <p className="text-sm font-bold text-ink-secondary ">{search ? 'لا توجد نتائج مطابقة.' : 'لم تتم إضافة شركاء بعد.'}</p>
              {canManage && !search && <button type="button" onClick={openNewPartner} className="mt-3 text-sm font-bold text-primary hover:underline ">أضف أول شريك</button>}
            </div>
          ) : visiblePartners.map((partner) => (
            <button key={partner.id} type="button" onClick={() => selectPartner(partner.id)} className={`block w-full border-b border-line p-4 text-right transition ${selectedId === partner.id && tab === 'statement' ? 'bg-accent-soft dark:bg-primary/30' : 'hover:bg-surface-muted dark:hover:bg-primary/50'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-extrabold text-ink ">{partner.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${partner.isActive ? 'bg-success-soft text-success dark:bg-success/40 dark:text-success' : 'bg-surface-sunken text-muted'}`}>
                  {partner.isActive ? 'نشط' : 'غير نشط'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>{formatNumber.format(partner.ownershipPercent)}% ملكية</span>
                <span className={partner.netBalance < 0 ? 'font-bold text-danger' : 'font-bold text-ink '}>{formatMoney(partner.netBalance)}</span>
              </div>
            </button>
          ))}
      </div>
    </section>
  );
};
