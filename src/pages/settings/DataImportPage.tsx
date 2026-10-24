import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, WandSparkles } from 'lucide-react';
import { DataImportService, ENTITY_META, ImportEntity, ParsedImport, ImportIssue } from '../../services/DataImportService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { DynamicDataService, DynamicImportResult } from '../../services/DynamicDataService';

export const DataImportPage: React.FC = () => {
  const service = useMemo(() => new DataImportService(), []);
  const dynamicService = useMemo(() => new DynamicDataService(), []);
  const [data, setData] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [allowBalances, setAllowBalances] = useState(false);
  const [allowStock, setAllowStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: ImportIssue[] } | null>(null);
  const [message, setMessage] = useState('');
  const [manualEntity, setManualEntity] = useState<ImportEntity | ''>('');
  const [manualOverride, setManualOverride] = useState(false);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [dynamicName, setDynamicName] = useState('');
  const [dynamicPreview, setDynamicPreview] = useState<{ headers: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [dynamicResult, setDynamicResult] = useState<DynamicImportResult | null>(null);
  const currentUser = AuthService.getCurrentUser();
  const canOpen = service.canOpen(currentUser);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMessage(''); setResult(null); setIssues([]); setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer(); setFileBuffer(buffer);
      const parsedBase = service.parse(buffer, manualOverride && manualEntity ? manualEntity : undefined);
      const workbookInfo = XLSX.read(buffer, { type: 'array' });
      const nonEmptySheets = workbookInfo.SheetNames.filter(name => { const sheet=workbookInfo.Sheets[name]; return Boolean(sheet && XLSX.utils.sheet_to_json(sheet,{defval:''}).length); });
      const parsed = !manualOverride && nonEmptySheets.length > 1 ? { ...parsedBase, entity: 'dynamic' as const } : parsedBase;
      setData(parsed);
      if (parsed.entity === 'dynamic') {
        if (!PermissionService.can(currentUser, 'admin.data')) throw new Error('الملف لا يطابق كيانًا معروفًا. صلاحية إنشاء أنواع البيانات المرنة غير متاحة لحسابك.');
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0]; const sheet = workbook.Sheets[sheetName];
        const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true }) : [];
        setDynamicPreview({ headers: Object.keys(rows[0] || {}), rows });
        setDynamicName(sheetName || file.name.replace(/\.[^.]+$/, ''));
        setIssues([]);
      } else { setDynamicPreview(null); setIssues(service.validate(parsed)); }
      setManualEntity(parsed.entity);
      if (parsed.confidence < 0.35 && parsed.entity !== 'dynamic') setMessage('التعرف التلقائي غير واثق. اختر نوع البيانات الصحيح وراجع مطابقة الأعمدة.');
    } catch (e: any) { setData(null); setMessage(e?.message || 'تعذرت قراءة الملف.'); }
    finally { setBusy(false); }
  };

  const changeEntity = (entity: ImportEntity | '') => {
    setManualEntity(entity);
    setManualOverride(Boolean(entity));
    if (!data) return;
    if (!fileBuffer) return;
    const next = service.parse(fileBuffer, entity || undefined);
    setData(next); setIssues(next.entity === 'dynamic' ? [] : service.validate(next)); setResult(null); setDynamicResult(null);
    if (next.entity === 'dynamic') {
      const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true }); const sheetName = workbook.SheetNames[0]; const sheet = workbook.Sheets[sheetName];
      const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true }) : [];
      setDynamicPreview({ headers: Object.keys(rows[0] || {}), rows }); setDynamicName(sheetName || fileName.replace(/\.[^.]+$/, ''));
    } else setDynamicPreview(null);
  };

  const changeMapping = (key: string, header: string) => {
    if (!data) return;
    const next = { ...data, mapping: { ...data.mapping, [key]: header } };
    setData(next); setIssues(service.validate(next)); setResult(null);
  };

  const downloadTemplate = () => {
    if (!data || data.entity === 'dynamic') return;
    const fields = ENTITY_META[data.entity].fields;
    const worksheet = XLSX.utils.aoa_to_sheet([fields.map(f => f.label), fields.map(f => '')]);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'البيانات');
    XLSX.writeFile(workbook, `قالب-${data.entity}.xlsx`);
  };

  const runImport = () => {
    if (!data) return;
    setBusy(true); setMessage('');
    try {
      if (data.entity === 'dynamic') {
        const outcome = dynamicService.importWorkbook(fileBuffer!, fileName, dynamicName);
        setDynamicResult(outcome);
        setMessage(`تم استيراد ${outcome.imported} سجل إلى ${outcome.entities?.length||1} نوع بيانات. البيانات الأصلية محفوظة كاملة.`);
        setBusy(false);
        return;
      }
      const outcome = service.import(data, issues, { allowInitialBalances: allowBalances, allowProductStock: allowStock });
      setResult(outcome);
      if (outcome.created) setMessage(`تمت إضافة ${outcome.created} سجل بنجاح.`);
      else setMessage('لم تتم إضافة سجلات. راجع الأخطاء أدناه.');
    } catch (e: any) { setMessage(e?.message || 'تعذر إتمام الاستيراد.'); }
    finally { setBusy(false); }
  };

  const fields = data && data.entity !== 'dynamic' ? ENTITY_META[data.entity].fields : [];
  const invalidRows = new Set(issues.map(x => x.row));
  const validCount = data ? data.rows.length - invalidRows.size : 0;

  if (!canOpen) return <div className="m-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-900" dir="rtl">?? ???? ?????? ??????? ????????. ???? ?? ???? ?????? ???? ?????? ??????? ????? ???????.</div>;
  return <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-3"><span className="rounded-2xl bg-sky-100 p-3 text-sky-700"><FileSpreadsheet className="w-6 h-6" /></span><div><h1 className="text-2xl font-black text-slate-900">مركز استيراد البيانات</h1><p className="mt-1 text-sm text-slate-500">ارفع ملف Excel أو CSV، دع النظام يتعرف على محتواه أو اختر النوع يدويًا، ثم راجع الصفوف قبل الإضافة.</p></div></div></div>
      {data && data.entity !== 'dynamic' && <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4"/>تنزيل قالب {ENTITY_META[data.entity].label}</button>}
    </div>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-xs font-black text-slate-600">تحديد نوع البيانات</span><select value={manualEntity} onChange={e=>changeEntity(e.target.value as ImportEntity)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold"><option value="">اكتشاف تلقائي من الملف</option>{Object.entries(ENTITY_META).filter(([,meta])=>PermissionService.can(currentUser,meta.permission)).map(([key,meta])=><option key={key} value={key}>{meta.label}</option>)}{PermissionService.can(currentUser,'admin.data')&&<option value="dynamic">إنشاء نوع بيانات مرن</option>}</select></label>
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-black text-white hover:bg-sky-700">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Upload className="h-4 w-4"/>}{fileName || 'اختر ملف Excel أو CSV'}<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{void handleFile(e.target.files?.[0]);e.currentTarget.value='';}}/></label>
        </div>
        {message && <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-bold ${result?.created ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{message}</span></div>}
        {data?.entity === 'dynamic' && dynamicPreview && <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4"><div className="flex items-start gap-3"><WandSparkles className="mt-1 h-5 w-5 text-violet-700"/><div><h2 className="font-black text-violet-950">نوع غير معروف — سيُنشأ له تعريف قابل لإعادة الاستخدام</h2><p className="mt-1 text-xs leading-5 text-violet-900">سيتم استنتاج أنواع الحقول مبدئيًا، وحفظ كل قيمة أصلية كما وردت في الملف. يمكن تعديل التعريف والبحث والتصدير من إدارة الأنواع.</p></div></div><label className="block text-xs font-black text-slate-700">اسم نوع البيانات<input value={dynamicName} onChange={e=>setDynamicName(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" placeholder="اسم الورقة أو اسم واضح لهذا النوع"/></label><div className="overflow-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-full text-right text-xs"><thead className="bg-slate-100"><tr>{dynamicPreview.headers.map(h=><th key={h} className="p-2.5">{h}</th>)}</tr></thead><tbody>{dynamicPreview.rows.slice(0,8).map((row,i)=><tr key={i} className="border-t border-slate-100">{dynamicPreview.headers.map(h=><td key={h} className="max-w-48 truncate p-2.5">{String(row[h]??'')}</td>)}</tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-bold text-slate-600">{dynamicPreview.rows.length} سجل · {dynamicPreview.headers.length} حقل · ستُحفظ القيم الأصلية كاملة</span><button onClick={runImport} disabled={!dynamicName.trim()||busy||!PermissionService.can(currentUser,'admin.data')} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">إنشاء النوع واستيراد البيانات</button></div>{dynamicResult&&<a className="inline-block text-sm font-black text-violet-800 underline" href="#/data-import/types">فتح إدارة الأنواع والسجلات</a>}</div>}
        {data && data.entity !== 'dynamic' && <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"><div className="flex items-center gap-2"><WandSparkles className="h-4 w-4 text-violet-600"/><span className="text-sm font-black">نوع البيانات: {ENTITY_META[data.entity].label}</span><span className="text-xs text-slate-500">({data.rows.length} صف)</span></div><span className="text-xs font-bold text-slate-500">تم ربط {Object.keys(data.mapping).length} من {fields.length} عمود</span></div>
          <div><h2 className="mb-3 text-sm font-black text-slate-800">مطابقة الأعمدة</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(field=><label key={field.key} className="text-xs font-bold text-slate-600">{field.label}{field.required&&<span className="text-rose-600"> *</span>}<select value={data.mapping[field.key]||''} onChange={e=>changeMapping(field.key,e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"><option value="">— غير مرتبط —</option>{data.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div></div>
          {(data.entity==='customers'||data.entity==='suppliers')&&<label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900"><input type="checkbox" checked={allowBalances} onChange={e=>setAllowBalances(e.target.checked)} className="mt-0.5"/>تطبيق عمود الرصيد الافتتاحي على حسابات {ENTITY_META[data.entity].label}. يؤثر هذا على الأرصدة المالية.</label>}
          {data.entity==='products'&&<label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900"><input type="checkbox" checked={allowStock} onChange={e=>setAllowStock(e.target.checked)} className="mt-0.5"/>إضافة الكميات من عمود الرصيد الافتتاحي إلى المخزن الافتراضي، مع تسجيل حركة مخزنية.</label>}
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[700px] text-right text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">صف الملف</th>{fields.filter(f=>data.mapping[f.key]).slice(0,7).map(f=><th key={f.key} className="p-3">{f.label}</th>)}<th className="p-3">التحقق</th></tr></thead><tbody>{data.rows.slice(0,100).map((row,i)=>{const rowNo=i+2;const rowIssues=issues.find(x=>x.row===rowNo);return <tr key={rowNo} className="border-t border-slate-100"><td className="p-3 font-bold">{rowNo}</td>{fields.filter(f=>data.mapping[f.key]).slice(0,7).map(f=><td key={f.key} className="max-w-48 truncate p-3">{String(row[data.mapping[f.key]]??'')}</td>)}<td className="p-3">{rowIssues?<span className="text-rose-700">{rowIssues.messages.join('، ')}</span>:<span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>صالح</span>}</td></tr>})}</tbody></table>{data.rows.length>100&&<p className="bg-slate-50 p-2 text-center text-xs text-slate-500">معاينة أول 100 صف؛ سيتم فحص كل الصفوف عند الاستيراد.</p>}</div>
          {result?.errors?.length ? <div className="max-h-36 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{result.errors.map(e=><p key={e.row}>صف {e.row}: {e.messages.join('، ')}</p>)}</div>:null}
        </>}
      </section>

      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 font-black text-slate-900">أنواع البيانات المدعومة</h2><ul className="space-y-2">{Object.entries(ENTITY_META).filter(([,meta])=>PermissionService.can(currentUser,meta.permission)).map(([key,meta])=><li key={key} className={`rounded-lg px-3 py-2 text-xs font-bold ${data?.entity===key?'bg-sky-50 text-sky-800':'bg-slate-50 text-slate-600'}`}>{meta.label}</li>)}</ul>{PermissionService.can(currentUser,'admin.data')&&<a href="#/data-import/types" className="mt-4 block rounded-xl bg-violet-50 p-3 text-xs font-black text-violet-900">إدارة الأنواع المرنة والسجلات والعلاقات</a>}<div className="mt-4 rounded-xl bg-violet-50 p-3 text-xs leading-6 text-violet-900"><b>حقول إضافية:</b> الأصناف تشمل أكواد وباركود وأسعار ومقاسات وفرز ومتر الكرتونة وقطعها. يمكن تصدير القوالب من هنا وتعبئتها قبل الاستيراد.</div>{data&&data.entity!=='dynamic'&&<><button onClick={runImport} disabled={!PermissionService.can(currentUser,ENTITY_META[data.entity].permission)||validCount===0||busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Upload className="h-4 w-4"/>}استيراد {validCount>0?`${validCount} سجل صالح`:''}</button><p className="mt-2 text-center text-[11px] text-slate-500">الصفوف غير الصالحة أو المكررة تُتخطى ويُذكر سببها.</p></>}</aside>
    </div>
  </div>;
};
