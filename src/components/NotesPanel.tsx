import React, { useRef, useState } from 'react';
import { Maximize2, Minimize2, Minus, NotebookPen } from 'lucide-react';
import { NotesEditor } from './NotesEditor';

export const NotesPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" dir="rtl" aria-label="الملاحظات"
      style={{ width: maximized ? 'calc(100vw - 2rem)' : 'min(52rem, calc(100vw - 2rem))', height: maximized ? 'calc(100vh - 2rem)' : minimized ? 'auto' : 'min(34rem, calc(100vh - 2rem))', maxWidth: 'calc(100vw - 2rem)', maxHeight: 'calc(100vh - 2rem)', minWidth: '18rem', minHeight: minimized ? undefined : '16rem', overflow: 'auto', resize: maximized ? 'none' : 'both', transform: maximized ? undefined : `translate(${offset.x}px, ${offset.y}px)` }}>
      <div className="mb-3 flex items-center gap-2 rounded-lg" onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button')) return; dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (!dragStart.current) return; const nextX = dragStart.current.offsetX + event.clientX - dragStart.current.x; const nextY = dragStart.current.offsetY + event.clientY - dragStart.current.y; setOffset({ x: Math.max(-window.innerWidth / 2 + 100, Math.min(window.innerWidth / 2 - 100, nextX)), y: Math.max(-window.innerHeight / 2 + 40, Math.min(window.innerHeight / 2 - 40, nextY)) }); }}
        onPointerUp={() => { dragStart.current = null; }} onPointerCancel={() => { dragStart.current = null; }} title="اسحب لتحريك نافذة الملاحظات" style={{ cursor: 'move', touchAction: 'none' }}>
        <NotebookPen className="h-5 w-5 shrink-0 text-sky-600" /><h2 className="select-none font-bold">دفتر ملاحظاتي</h2><span className="mr-auto" />
        <button onPointerDown={(event) => event.stopPropagation()} onClick={() => { setMinimized((value) => !value); setMaximized(false); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={minimized ? 'استعادة الملاحظات' : 'تصغير الملاحظات'} title={minimized ? 'استعادة' : 'تصغير'}>{minimized ? <Maximize2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button>
        <button onPointerDown={(event) => event.stopPropagation()} onClick={() => { setMaximized((value) => !value); setMinimized(false); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={maximized ? 'استعادة حجم الملاحظات' : 'تكبير الملاحظات'} title={maximized ? 'استعادة الحجم' : 'تكبير'}>{maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        <button onPointerDown={(event) => event.stopPropagation()} onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="إغلاق الملاحظات">إغلاق</button>
      </div>
      {!minimized && <NotesEditor compact />}
    </section>
  );
};
