import React from 'react';

export const ManagerOverrideModal: React.FC<{
  onConfirm: (username: string, password: string) => Promise<boolean>;
  onClose: () => void;
}> = ({ onConfirm, onClose }) => {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) { setError('يرجى إدخال اسم المستخدم وكلمة المرور'); return; }
    setLoading(true); setError(null);
    const ok = await onConfirm(username.trim(), password);
    setLoading(false);
    if (!ok) setError('اسم المستخدم أو كلمة المرور غير صحيحة، أو لا تملك الصلاحية.');
  };

  return (
    <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface p-6 rounded-3xl border border-line shadow-2xl max-w-sm w-full space-y-4">
        <h3 className="text-lg font-black text-ink text-center">اعتماد مدير</h3>
        <p className="text-xs text-muted text-center">أدخل بيانات مدير (مستخدم يملك صلاحية إلغاء الفاتورة)</p>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 bg-surface rounded-xl border border-line text-sm text-ink focus:outline-none focus:border-primary"
            autoFocus
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            className="w-full px-3 py-2 bg-surface rounded-xl border border-line text-sm text-ink focus:outline-none focus:border-primary"
          />
        </div>
        {error && <p className="text-xs text-danger text-center">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onClick={onClose} className="py-2.5 bg-surface-sunken hover:bg-surface-sunken text-ink font-bold rounded-xl text-xs">إلغاء</button>
          <button onClick={submit} disabled={loading} className="py-2.5 bg-primary hover:bg-primary text-white font-bold rounded-xl text-xs disabled:opacity-50">{loading ? 'جاري...' : 'تأكيد'}</button>
        </div>
      </div>
    </div>
  );
};
