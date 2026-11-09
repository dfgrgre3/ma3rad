import React from 'react';

export const PinLoginModal: React.FC<{
  onConfirm: (pin: string) => Promise<boolean>;
  onClose: () => void;
}> = ({ onConfirm, onClose }) => {
  const [pin, setPin] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!pin.trim()) { setError('يرجى إدخال رمز PIN'); return; }
    setLoading(true); setError(null);
    const ok = await onConfirm(pin.trim());
    setLoading(false);
    if (!ok) setError('رمز PIN غير صحيح.');
    else setPin('');
  };

  return (
    <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xl max-w-xs w-full space-y-4">
        <h3 className="text-lg font-black text-slate-900 text-center">تبديل المستخدم (PIN)</h3>
        <p className="text-xs text-slate-500 text-center">أدخل رمز PIN (4-8 أرقام)</p>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-center text-2xl tracking-widest text-slate-900 focus:outline-none focus:border-sky-500"
          autoFocus
        />
        {error && <p className="text-xs text-rose-600 text-center">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onClick={onClose} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">إلغاء</button>
          <button onClick={submit} disabled={loading} className="py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs disabled:opacity-50">{loading ? '...' : 'تأكيد'}</button>
        </div>
      </div>
    </div>
  );
};
