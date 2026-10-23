import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
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
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-slate-100 dark:bg-slate-950 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center">
          <AlertOctagon className="w-8 h-8 text-rose-500" />
        </div>
        <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">حدث خطأ غير متوقع في هذه الشاشة</h2>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          تم احتواء الخطأ حتى لا يتوقف النظام بالكامل. يمكنك المحاولة مرة أخرى أو إعادة تحميل الواجهة.
        </p>
        <pre className="max-w-xl overflow-auto rounded-xl bg-slate-900 px-4 py-3 text-left text-[11px] text-rose-300" dir="ltr">
          {this.state.error.message}
        </pre>
        <div className="flex items-center gap-2">
          <button onClick={this.reset} className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> إعادة المحاولة
          </button>
          <button onClick={this.reload} className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-bold dark:bg-slate-800 dark:text-slate-200">
            إعادة تحميل
          </button>
        </div>
      </div>
    );
  }
}
