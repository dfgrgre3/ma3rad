import React from 'react';
import { KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PlatformBootstrapService } from '../../services/domains/platform/PlatformBootstrapService';
import { DatabaseManager } from '../../database/repositories/databaseManager';
import type { User } from '../../types';

interface PlatformOwnerSetupPageProps {
  onSuccess: (user: User) => void;
}

/**
 * One-time, secure initialization of the platform owner account.
 *
 * This screen is reachable *before* authentication and only while no owner
 * exists yet — it is the single legitimate path for minting the SUPER_ADMIN
 * role. It is intentionally not part of the ERP user-management screens, and
 * the service refuses to run twice.
 */
export const PlatformOwnerSetupPage: React.FC<PlatformOwnerSetupPageProps> = ({ onSuccess }) => {
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [alreadyBootstrapped, setAlreadyBootstrapped] = React.useState(false);

  React.useEffect(() => {
    try {
      const service = new PlatformBootstrapService(DatabaseManager.getInstance());
      setAlreadyBootstrapped(service.isBootstrapped());
    } catch {
      setAlreadyBootstrapped(false);
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setLoading(true);
    try {
      const service = new PlatformBootstrapService(DatabaseManager.getInstance());
      const result = service.bootstrap({
        email: email.trim(),
        password,
        username: username.trim() || undefined,
        fullName: fullName.trim() || undefined,
      });

      // Sign the freshly created owner straight in so the flow ends inside the
      // platform console instead of on a login form.
      const user = await AuthService.loginAsync(result.username, password);
      setDone(true);
      if (typeof window !== 'undefined') window.location.hash = '#/platform';
      onSuccess(user);
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'تعذر تهيئة حساب مالك المنصة.');
    } finally {
      setLoading(false);
    }
  };

  if (alreadyBootstrapped) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-primary px-4">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-surface p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-black text-ink">مالك المنصة مُهيأ بالفعل</h1>
          <p className="mt-3 text-sm leading-6 text-ink-secondary">
            إجراء تهيئة مالك المنصة متاح مرة واحدة فقط. استخدم صفحة تسجيل الدخول للدخول إلى لوحة المنصة.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary px-4 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-surface p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-ink">تهيئة مالك المنصة</h1>
            <p className="text-xs text-muted">إجراء لمرة واحدة لإنشاء حساب مالك المنصة (Super Admin).</p>
          </div>
        </div>

        <div className="mb-5 flex gap-3 rounded-2xl border border-warning-border bg-warning-soft p-4 text-xs leading-6 text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            هذا الإجراء متاح مرة واحدة فقط ولا يمكن تكراره. كلمة المرور يجب أن تكون 12 حرفًا على الأقل وتحتوي على
            حرف صغير وحرف كبير ورقم ورمز خاص. لا توجد كلمة مرور افتراضية.
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-danger-border bg-danger-soft px-4 py-3 text-xs font-semibold text-danger">
            {error}
          </div>
        )}

        {done ? (
          <div className="rounded-2xl border border-success-border bg-success-soft px-4 py-4 text-sm font-semibold text-success">
            تم تهيئة حساب مالك المنصة بنجاح،تم تسجيل الدخول تلقائيًا.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">الاسم الكامل</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مالك المنصة"
                className="w-full rounded-xl border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">البريد الإلكتروني *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                className="w-full rounded-xl border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">اسم المستخدم (اختياري)</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="يُشتق من البريد الإلكتروني إذا تُرك فارغًا"
                className="w-full rounded-xl border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">كلمة المرور *</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="12 حرفًا على الأقل"
                className="w-full rounded-xl border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">تأكيد كلمة المرور *</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-primary disabled:opacity-60"
            >
              {loading ? 'جارٍ التهيئة...' : 'تهيئة حساب مالك المنصة'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
};

export default PlatformOwnerSetupPage;
