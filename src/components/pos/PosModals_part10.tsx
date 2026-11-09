import React from 'react';
import { Keyboard } from 'lucide-react';
import { Modal } from './PosShared';

export const SHORTCUTS: Array<[string, string]> = [
  ['F1', 'عرض شاشة الاختصارات والمساعدة'],
  ['F2', 'البحث السريع عن منتج / تركيز حقل الباركود'],
  ['F3', 'البحث عن اختيار العميل'],
  ['F4', 'إدخال المبلغ المدفوع'],
  ['F5', 'تحديث قائمة المنتجات والأرصدة'],
  ['F6', 'التنقل بين طرق الدفع'],
  ['F7', 'الانتقال إلى حقل خصم الفاتورة'],
  ['F8', 'تعليق الفاتورة الحالية'],
  ['F9', 'اعتماد وحفظ الفاتورة'],
  ['F10', 'فتح / إغلاق الفواتير المعلقة'],
  ['Delete', 'حذف المنتج المحدد من السلة'],
  ['+ / -', 'زيادة / تقليل كمية المنتج المحدد'],
  ['Esc', 'إغلاق النافذة الحالية'],
];

export const ShortcutsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Modal title="اختصارات لوحة المفاتيح" icon={<Keyboard className="w-5 h-5" />} onClose={onClose}>
    <div className="space-y-1.5 text-xs">
      {SHORTCUTS.map(([key, desc]) => (
        <div key={key} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="text-slate-700">{desc}</span>
          <kbd className="font-mono bg-slate-100 text-sky-700 px-2 py-0.5 rounded text-[11px]">{key}</kbd>
        </div>
      ))}
    </div>
  </Modal>
);
