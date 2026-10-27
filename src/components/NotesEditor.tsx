import React, { useEffect, useMemo, useState } from 'react';
import { FilePlus2, NotebookPen, Search, Trash2 } from 'lucide-react';

type Note = { id: string; title: string; content: string; updatedAt: number };
const NOTES_KEY = 'executive-dashboard-notes-v2';
const LEGACY_KEY = 'executive-dashboard-notes';
const CHANGE_EVENT = 'ceramisys-notes-change';

const loadNotes = (): Note[] => {
  try {
    const saved = localStorage.getItem(NOTES_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed.filter((note): note is Note => Boolean(note && typeof note.id === 'string' && typeof note.title === 'string' && typeof note.content === 'string'));
    }
  } catch { /* Recover from malformed local data with the legacy note below. */ }
  const oldContent = localStorage.getItem(LEGACY_KEY) ?? '';
  return oldContent ? [{ id: 'legacy-note', title: 'ملاحظتي القديمة', content: oldContent, updatedAt: Date.now() }] : [];
};

export const NotesEditor: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [activeId, setActiveId] = useState(notes[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const activeNote = notes.find((note) => note.id === activeId) ?? null;
  const visibleNotes = useMemo(() => notes.filter((note) => `${note.title} ${note.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [notes, query]);

  useEffect(() => {
    const sync = () => {
      const next = loadNotes();
      setNotes(next);
      setActiveId((current) => next.some((note) => note.id === current) ? current : next[0]?.id ?? '');
    };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(CHANGE_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  const save = (next: Note[]) => {
    setNotes(next);
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    const selected = next.find((note) => note.id === activeId) ?? next[0];
    if (selected) localStorage.setItem(LEGACY_KEY, selected.content);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const createNote = () => {
    const note = { id: crypto.randomUUID(), title: 'ملاحظة جديدة', content: '', updatedAt: Date.now() };
    save([note, ...notes]);
    setActiveId(note.id);
    setQuery('');
  };

  const updateActive = (changes: Partial<Pick<Note, 'title' | 'content'>>) => {
    if (!activeNote) return;
    const next = notes.map((note) => note.id === activeNote.id ? { ...note, ...changes, updatedAt: Date.now() } : note);
    save(next);
  };

  const deleteActive = () => {
    if (!activeNote || !window.confirm(`حذف «${activeNote.title || 'ملاحظة بلا عنوان'}»؟`)) return;
    const next = notes.filter((note) => note.id !== activeNote.id);
    save(next);
    setActiveId(next[0]?.id ?? '');
  };

  return (
    <div className={`flex min-h-0 gap-3 ${compact ? 'h-[calc(100%-2.5rem)] flex-col sm:flex-row' : 'min-h-[22rem] flex-col sm:flex-row'}`} dir="rtl">
      <aside className="flex min-h-28 flex-col gap-2 sm:w-56 sm:shrink-0">
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 dark:border-slate-700 dark:bg-slate-950">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في الملاحظات" aria-label="ابحث في الملاحظات" className="w-full bg-transparent py-2 text-xs outline-none" />
          </label>
          <button onClick={createNote} className="rounded-lg bg-sky-600 px-3 text-white hover:bg-sky-700" aria-label="ملاحظة جديدة" title="ملاحظة جديدة"><FilePlus2 className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1 overflow-auto sm:flex-1 sm:flex-col">
          {visibleNotes.map((note) => <button key={note.id} onClick={() => setActiveId(note.id)} className={`min-w-32 rounded-lg border p-2 text-right sm:min-w-0 ${activeId === note.id ? 'border-sky-300 bg-sky-50 dark:bg-sky-950/40' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <span className="block truncate text-xs font-bold">{note.title || 'بدون عنوان'}</span>
            <span className="mt-1 block truncate text-[10px] text-slate-500">{note.content || 'ملاحظة فارغة'}</span>
          </button>)}
          {visibleNotes.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">{notes.length ? 'لا توجد نتائج' : 'أنشئ ملاحظتك الأولى'}</p>}
        </div>
      </aside>
      <section className="flex min-h-48 min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
        {activeNote ? <>
          <div className="mb-2 flex items-center gap-2">
            <NotebookPen className="h-4 w-4 shrink-0 text-sky-600" />
            <input value={activeNote.title} onChange={(event) => updateActive({ title: event.target.value })} aria-label="عنوان الملاحظة" placeholder="عنوان الملاحظة" className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
            <button onClick={deleteActive} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" aria-label="حذف الملاحظة" title="حذف الملاحظة"><Trash2 className="h-4 w-4" /></button>
          </div>
          <textarea value={activeNote.content} onChange={(event) => updateActive({ content: event.target.value })} placeholder="اكتب ملاحظتك هنا..." aria-label="محتوى الملاحظة" className="min-h-36 flex-1 resize-none bg-transparent p-1 text-sm leading-7 outline-none" />
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-400 dark:border-slate-800"><span>{activeNote.content.length} حرف</span><span>حُفظت تلقائيًا على هذا الجهاز</span></div>
        </> : <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-slate-400"><NotebookPen className="h-8 w-8" />اختر ملاحظة أو أنشئ واحدة جديدة</div>}
      </section>
    </div>
  );
};
