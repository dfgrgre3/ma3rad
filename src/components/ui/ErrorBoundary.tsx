import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { toAppError } from '../../errors/appError';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: toAppError(error, 'UI_RENDER_FAILED') };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled UI error', error, info);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    const errorMessage = this.state.error.message || 'لم يتم توفير تفاصيل الخطأ.';

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-100 px-6 text-center select-none" dir="rtl">
        <div className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-rose-200 bg-rose-50 shadow-[0_12px_30px_rgba(244,63,94,0.12)]">
          <AlertOctagon className="h-10 w-10 text-rose-500" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900">حدث خطأ غير متوقع في هذه الشاشة</h2>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-slate-600">
            تم احتواء الخطأ حتى لا يتوقف النظام بالكامل. يمكنك المحاولة مرة أخرى أو إعادة تحميل الواجهة.
          </p>
        </div>

        <pre className="max-w-2xl overflow-auto rounded-xl bg-slate-900 px-4 py-3 text-left text-[11px] leading-6 text-rose-200 shadow-lg" dir="ltr">
          {errorMessage}
        </pre>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-500"
          >
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </button>
          <button
            type="button"
            onClick={this.reload}
            className="rounded-xl bg-slate-200 px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-300"
          >
            إعادة التحميل
          </button>
        </div>
      </div>
    );
  }
}
