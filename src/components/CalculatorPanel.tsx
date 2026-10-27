import React, { useEffect, useRef, useState } from 'react';
import { Calculator, Maximize2, Minimize2, Minus } from 'lucide-react';

type Operator = '+' | '−' | '×' | '÷';

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return 'خطأ';
  const rounded = Number(value.toPrecision(12));
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

const calculate = (left: number, right: number, operator: Operator) => {
  switch (operator) {
    case '+': return left + right;
    case '−': return left - right;
    case '×': return left * right;
    case '÷': return right === 0 ? NaN : left / right;
  }
};

export const CalculatorPanel: React.FC<{ onClose?: () => void; floating?: boolean }> = ({ onClose, floating = false }) => {
  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [startNew, setStartNew] = useState(false);
  const [lastOperation, setLastOperation] = useState<{ operator: Operator; value: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  const press = (key: string) => {
    if (/^\d$/.test(key) || key === '.') {
      setDisplay((current) => {
        if (current === 'خطأ' || startNew) return key === '.' ? '0.' : key;
        if (key === '.' && current.includes('.')) return current;
        return current === '0' && key !== '.' ? key : current + key;
      });
      setStartNew(false);
      return;
    }
    if (key === 'C') {
      setDisplay('0'); setStored(null); setOperator(null); setStartNew(false); setLastOperation(null);
      return;
    }
    if (key === 'CE') { setDisplay('0'); setStartNew(false); return; }
    if (key === '⌫') {
      if (startNew || display === 'خطأ') { setDisplay('0'); setStartNew(false); return; }
      setDisplay((current) => current.length <= 1 || (current.length === 2 && current.startsWith('-')) ? '0' : current.slice(0, -1));
      return;
    }

    const current = Number(display);
    if (key === '±') { setDisplay(formatNumber(-current)); return; }
    if (key === '%') {
      const percent = stored !== null && operator && (operator === '+' || operator === '−') ? stored * current / 100 : current / 100;
      setDisplay(formatNumber(percent)); setStartNew(true); return;
    }
    if (key === '=') {
      if (operator && stored !== null) {
        const result = calculate(stored, current, operator);
        setDisplay(formatNumber(result)); setLastOperation({ operator, value: current });
        setStored(null); setOperator(null); setStartNew(true);
      } else if (lastOperation) {
        setDisplay(formatNumber(calculate(current, lastOperation.value, lastOperation.operator))); setStartNew(true);
      }
      return;
    }
    if (['+', '−', '×', '÷'].includes(key)) {
      const nextOperator = key as Operator;
      if (operator && stored !== null && !startNew) {
        const result = calculate(stored, current, operator);
        setDisplay(formatNumber(result)); setStored(Number.isFinite(result) ? result : null);
      } else setStored(current);
      setOperator(nextOperator); setStartNew(true); setLastOperation(null);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement) return;
      const key = event.key;
      if (/^\d$/.test(key) || key === '.') { event.preventDefault(); press(key); }
      else if (key === '+') press('+');
      else if (key === '-') press('−');
      else if (key === '*') press('×');
      else if (key === '/') { event.preventDefault(); press('÷'); }
      else if (key === 'Enter' || key === '=') { event.preventDefault(); press('='); }
      else if (key === 'Backspace') { event.preventDefault(); press('⌫'); }
      else if (key === 'Escape') press('C');
      else if (key === '%') press('%');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const keys = [
    { key: 'CE', label: 'مسح الرقم', kind: 'utility' }, { key: 'C', label: 'مسح الكل', kind: 'utility' }, { key: '⌫', label: 'حذف آخر رقم', kind: 'utility' }, { key: '÷', label: 'قسمة', kind: 'operator' },
    { key: '7' }, { key: '8' }, { key: '9' }, { key: '×', label: 'ضرب', kind: 'operator' },
    { key: '4' }, { key: '5' }, { key: '6' }, { key: '−', label: 'طرح', kind: 'operator' },
    { key: '1' }, { key: '2' }, { key: '3' }, { key: '+', label: 'جمع', kind: 'operator' },
    { key: '±', label: 'تغيير الإشارة', kind: 'utility' }, { key: '0' }, { key: '.' }, { key: '=', label: 'يساوي', kind: 'equals' },
    { key: '%', label: 'نسبة مئوية', kind: 'utility' },
  ];

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${floating ? '' : 'mx-auto w-full max-w-sm'}`} dir="rtl" aria-label="الآلة الحاسبة"
      style={floating ? { width: maximized ? 'calc(100vw - 2rem)' : '22rem', height: maximized ? 'calc(100vh - 2rem)' : minimized ? 'auto' : '35rem', maxWidth: 'calc(100vw - 2rem)', maxHeight: 'calc(100vh - 2rem)', minWidth: '17rem', minHeight: minimized ? undefined : '20rem', overflow: 'auto', resize: maximized ? 'none' : 'both', transform: maximized ? undefined : `translate(${offset.x}px, ${offset.y}px)` } : undefined}>
      <div className={`mb-4 flex items-center gap-2 rounded-lg ${floating ? 'cursor-move select-none' : ''}`}
        onPointerDown={floating ? (event) => { if ((event.target as HTMLElement).closest('button')) return; dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); } : undefined}
        onPointerMove={floating ? (event) => { if (!dragStart.current) return; const nextX = dragStart.current.offsetX + event.clientX - dragStart.current.x; const nextY = dragStart.current.offsetY + event.clientY - dragStart.current.y; setOffset({ x: Math.max(-window.innerWidth / 2 + 100, Math.min(window.innerWidth / 2 - 100, nextX)), y: Math.max(-window.innerHeight / 2 + 40, Math.min(window.innerHeight / 2 - 40, nextY)) }); } : undefined}
        onPointerUp={floating ? () => { dragStart.current = null; } : undefined} onPointerCancel={floating ? () => { dragStart.current = null; } : undefined} title={floating ? 'اسحب لتحريك الآلة الحاسبة' : undefined}>
        <Calculator className="h-5 w-5 shrink-0 text-indigo-600" /><h2 className="font-bold">آلة حاسبة</h2>{floating && <span className="mr-auto" />}
        {floating && <button onClick={() => { setMinimized((value) => !value); setMaximized(false); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={minimized ? 'استعادة الآلة الحاسبة' : 'تصغير الآلة الحاسبة'} title={minimized ? 'استعادة' : 'تصغير'}>{minimized ? <Maximize2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button>}
        {floating && <button onClick={() => { setMaximized((value) => !value); setMinimized(false); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={maximized ? 'استعادة حجم الآلة الحاسبة' : 'تكبير الآلة الحاسبة'} title={maximized ? 'استعادة الحجم' : 'تكبير'}>{maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>}
        {onClose && <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="إغلاق الآلة الحاسبة">إغلاق</button>}
      </div>
      {!minimized && <>
        <div className="mb-2 min-h-16 truncate rounded-xl bg-slate-100 px-4 py-3 text-left text-3xl font-bold tabular-nums dark:bg-slate-800" dir="ltr" aria-live="polite" aria-atomic="true">{display}</div>
        <p className="mb-3 text-left text-[10px] text-slate-400" dir="ltr">لوحة المفاتيح: الأرقام · Enter للحساب · Esc للمسح</p>
        <div className="grid grid-cols-4 gap-2" dir="ltr">
          {keys.map(({ key, label = key, kind = 'number' }) => <button key={key} onClick={() => press(key)} aria-label={label} className={`min-h-12 rounded-xl px-2 py-2 text-base font-bold transition hover:brightness-95 active:scale-95 ${kind === 'equals' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : kind === 'operator' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : kind === 'utility' ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100' : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-100'} ${key === '0' ? 'col-span-2' : ''}`}>{key}</button>)}
        </div>
      </>}
    </section>
  );
};
