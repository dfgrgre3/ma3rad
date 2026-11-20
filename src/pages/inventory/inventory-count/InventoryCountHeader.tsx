import React from 'react';
import { Plus, ScanLine } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';

interface InventoryCountHeaderProps {
  onCreateSession: () => void;
}

export const InventoryCountHeader: React.FC<InventoryCountHeaderProps> = ({ onCreateSession }) => {
  return (
    <div className="bg-surface border-b border-line px-6 pt-4">
      <PageHeader
        icon={<ScanLine className="w-5 h-5" />}
        title="جرد المخزون (Inventory Count)"
        description="متابعة ومطابقة الجرد الدوري والمفاجئ للمخازن والمعارض"
        actions={
          <button
            onClick={onCreateSession}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-sm font-semibold transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            بدء جلسة جرد جديدة
          </button>
        }
      />
    </div>
  );
};
