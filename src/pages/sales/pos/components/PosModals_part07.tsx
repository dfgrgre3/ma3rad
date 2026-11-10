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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full space-y-4">
        <h3 className="text-lg font-black text-slate-900 text-center">اعتماد مدير</h3>
        <p className="text-xs text-slate-500 text-center">أدخل بيانات مدير (مستخدم يملك صلاحية إلغاء الفاتورة)</p>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-sky-500"
            autoFocus
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-sky-500"
          />
        </div>
        {error && <p className="text-xs text-rose-600 text-center">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onClick={onClose} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">إلغاء</button>
          <button onClick={submit} disabled={loading} className="py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs disabled:opacity-50">{loading ? 'جاري...' : 'تأكيد'}</button>
        </div>
      </div>
    </div>
  );
};
