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
    <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface p-6 rounded-3xl border border-line shadow-2xl max-w-xs w-full space-y-4">
        <h3 className="text-lg font-black text-ink text-center">تبديل المستخدم (PIN)</h3>
        <p className="text-xs text-muted text-center">أدخل رمز PIN (4-8 أرقام)</p>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className="w-full px-3 py-2 bg-surface rounded-xl border border-line text-center text-2xl tracking-widest text-ink focus:outline-none focus:border-primary"
          autoFocus
        />
        {error && <p className="text-xs text-danger text-center">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onClick={onClose} className="py-2.5 bg-surface-sunken hover:bg-surface-sunken text-ink font-bold rounded-xl text-xs">إلغاء</button>
          <button onClick={submit} disabled={loading} className="py-2.5 bg-primary hover:bg-primary text-white font-bold rounded-xl text-xs disabled:opacity-50">{loading ? '...' : 'تأكيد'}</button>
        </div>
      </div>
    </div>
  );
};
