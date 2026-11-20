import React from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Package2, Plus, FileSpreadsheet, FileDown } from 'lucide-react';
import { useActivityPageCopy, useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';

interface OrdersHeaderProps {
  canCreate: boolean;
  onExport: (kind: 'excel' | 'pdf') => void;
  onCreate: () => void;
}

export const OrdersHeader: React.FC<OrdersHeaderProps> = ({ canCreate, onExport, onCreate }) => {
  const pageCopy = useActivityPageCopy('orders');
  const newOrderLabel = useBusinessTerm('actions.newOrder');
  return (
    <div className="bg-surface border-b border-line px-6 pt-4">
      <PageHeader
        icon={<Package2 className="w-5 h-5" />}
        title={pageCopy?.title || 'طلبات وحجوزات العملاء'}
        description={pageCopy?.description || 'حجز البضاعة، متابعة التجهيز، وإصدار الفاتورة مباشرة من الطلب'}
        actions={<>
          <button onClick={() => onExport('excel')} className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-line hover:bg-surface-muted text-ink rounded-xl text-xs font-bold"><FileSpreadsheet className="w-4 h-4 text-success" /> جدول بيانات</button>
          <button onClick={() => onExport('pdf')} className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-line hover:bg-surface-muted text-ink rounded-xl text-xs font-bold"><FileDown className="w-4 h-4 text-danger" /> مستند</button>
          {canCreate && (
            <button onClick={onCreate} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-xs font-bold transition">
              <Plus className="w-4 h-4" /> {newOrderLabel}
            </button>
          )}
        </>}
      />
    </div>
  );
};
