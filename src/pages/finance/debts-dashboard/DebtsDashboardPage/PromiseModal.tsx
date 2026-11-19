import React from "react";
import type { PromiseFormState } from "./types";

type Props = {
  form: PromiseFormState;
  onChange: (form: PromiseFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
};

export const PromiseModal: React.FC<Props> = ({
  form,
  onChange,
  onSubmit,
  onClose,
}) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-3"
    >
      <h3 className="font-black text-lg">وعد السداد والمتابعة</h3>
      <label className="block text-xs font-bold">
        المبلغ المتوقع
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={(e) => onChange({ ...form, amount: e.target.value })}
          className="mt-1 w-full border rounded-lg p-2"
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs font-bold">
          تاريخ الوعد
          <input
            type="date"
            value={form.promiseDate}
            onChange={(e) =>
              onChange({
                ...form,
                promiseDate: e.target.value,
              })
            }
            className="mt-1 w-full border rounded-lg p-2"
          />
        </label>
        <label className="text-xs font-bold">
          المتابعة القادمة
          <input
            type="date"
            value={form.followupDate}
            onChange={(e) =>
              onChange({
                ...form,
                followupDate: e.target.value,
              })
            }
            className="mt-1 w-full border rounded-lg p-2"
          />
        </label>
      </div>
      <textarea
        placeholder="ملاحظات الوعد"
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
        className="w-full border rounded-lg p-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-slate-100 rounded-lg"
        >
          إلغاء
        </button>
        <button className="px-4 py-2 bg-amber-600 text-white font-bold rounded-lg">
          حفظ
        </button>
      </div>
    </form>
  </div>
);
