import React from 'react';
import { Plus, X } from 'lucide-react';
import type { SystemSettings } from '../../../../types';
import type { SettingsSetter } from './types';

const DEFAULT_REMOVAL_REASONS = ['غلط في الإدخال', 'العميل غيّر رأيه', 'صنف تالف', 'سعر غلط'];

interface ItemRemovalReasonsEditorProps {
  settings: SystemSettings;
  set: SettingsSetter;
  newReasonInput: string;
  setNewReasonInput: (value: string) => void;
  showAddReason: boolean;
  setShowAddReason: (value: boolean) => void;
}

export const ItemRemovalReasonsEditor: React.FC<ItemRemovalReasonsEditorProps> = ({
  settings,
  set,
  newReasonInput,
  setNewReasonInput,
  showAddReason,
  setShowAddReason,
}) => (
  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
    <div className="text-right">
      <div className="text-xs font-black text-slate-900 dark:text-slate-100">
        أسباب حذف سطر من الفاتورة
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
        بتظهر اختيارات سريعة في ديالوج حذف السطر في الكاشير — والكاشير يقدر يكتب سبب تاني.
      </div>
    </div>

    {/* Chips container */}
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {/* أزرار الأسباب الحالية */}
      {((Array.isArray(settings.posItemRemovalReasons) && settings.posItemRemovalReasons.length > 0)
        ? settings.posItemRemovalReasons
        : DEFAULT_REMOVAL_REASONS
      ).map((reason, idx) => (
        <div
          key={idx}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm"
        >
          <button
            type="button"
            onClick={() => {
              const current = Array.isArray(settings.posItemRemovalReasons) && settings.posItemRemovalReasons.length > 0
                ? [...settings.posItemRemovalReasons]
                : [...DEFAULT_REMOVAL_REASONS];
              current.splice(idx, 1);
              set('posItemRemovalReasons', current as any);
            }}
            className="text-slate-400 hover:text-rose-500 transition p-0.5"
            title="حذف هذا السبب"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <span>{reason}</span>
        </div>
      ))}

      {/* زر وحقل إضافة سبب */}
      {showAddReason ? (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[#1e5871] bg-white dark:bg-slate-800">
          <input
            type="text"
            autoFocus
            value={newReasonInput}
            onChange={(e) => setNewReasonInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newReasonInput.trim()) {
                e.preventDefault();
                const current = Array.isArray(settings.posItemRemovalReasons) && settings.posItemRemovalReasons.length > 0
                  ? [...settings.posItemRemovalReasons]
                  : [...DEFAULT_REMOVAL_REASONS];
                if (!current.includes(newReasonInput.trim())) {
                  current.push(newReasonInput.trim());
                  set('posItemRemovalReasons', current as any);
                }
                setNewReasonInput('');
                setShowAddReason(false);
              } else if (e.key === 'Escape') {
                setShowAddReason(false);
                setNewReasonInput('');
              }
            }}
            placeholder="اكتب السبب واضغط Enter"
            className="text-xs bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none w-36"
          />
          <button
            type="button"
            onClick={() => {
              if (newReasonInput.trim()) {
                const current = Array.isArray(settings.posItemRemovalReasons) && settings.posItemRemovalReasons.length > 0
                  ? [...settings.posItemRemovalReasons]
                  : [...DEFAULT_REMOVAL_REASONS];
                if (!current.includes(newReasonInput.trim())) {
                  current.push(newReasonInput.trim());
                  set('posItemRemovalReasons', current as any);
                }
                setNewReasonInput('');
              }
              setShowAddReason(false);
            }}
            className="text-xs text-sky-600 hover:text-sky-800 font-bold px-1"
          >
            إضافة
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddReason(false);
              setNewReasonInput('');
            }}
            className="text-slate-400 hover:text-slate-600 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddReason(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 hover:border-[#1e5871] bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-[#1e5871] transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إضافة سبب</span>
        </button>
      )}
    </div>
  </div>
);
