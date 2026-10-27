import React from 'react';
import { Calculator, NotebookPen } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { CalculatorPanel } from '../../components/CalculatorPanel';
import { NotesEditor } from '../../components/NotesEditor';

type Tool = 'notes' | 'calculator';

export const QuickToolsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tool: Tool = params.get('tool') === 'calculator' ? 'calculator' : 'notes';
  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100" dir="rtl">
      <div className="mx-auto max-w-4xl space-y-5">
        <header>
          <h1 className="text-2xl font-black">الأدوات السريعة</h1>
          <p className="mt-1 text-sm text-slate-500">ملاحظاتك وآلة حاسبة في صفحة مستقلة</p>
        </header>
        <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <button onClick={() => setParams({ tool: 'notes' })} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${tool === 'notes' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            <NotebookPen className="h-4 w-4" /> الملاحظات
          </button>
          <button onClick={() => setParams({ tool: 'calculator' })} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${tool === 'calculator' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            <Calculator className="h-4 w-4" /> الآلة الحاسبة
          </button>
        </div>

        {tool === 'notes' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><div className="mb-3 flex items-center gap-2"><NotebookPen className="h-5 w-5 text-sky-600" /><h2 className="font-bold">دفتر ملاحظاتي</h2></div><NotesEditor /></section>
        ) : <CalculatorPanel />}
      </div>
    </div>
  );
};
