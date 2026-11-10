import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, FileText, AlertTriangle, MessageSquare, Scale, Paperclip } from 'lucide-react';
import { HrDisciplineService, HrViolation, HrWarning, HrPenalty, HrComplaint, HrAppeal, HrAttachment } from '../../../services/domains/hr/HrDisciplineService';

type Tab = 'violations' | 'warnings' | 'penalties' | 'complaints' | 'appeals' | 'attachments';

export const HrDisciplinePage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('violations');
  const [violations, setViolations] = useState<HrViolation[]>([]);
  const [warnings, setWarnings] = useState<HrWarning[]>([]);
  const [penalties, setPenalties] = useState<HrPenalty[]>([]);
  const [complaints, setComplaints] = useState<HrComplaint[]>([]);
  const [appeals, setAppeals] = useState<HrAppeal[]>([]);
  const [attachments, setAttachments] = useState<HrAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [violationForm, setViolationForm] = useState({ employeeId: '', violationType: '', description: '', occurredAt: new Date().toISOString().slice(0, 10), severity: 'MINOR' });
  const [warningForm, setWarningForm] = useState({ employeeId: '', violationId: '', warningType: 'WRITTEN', issuedAt: new Date().toISOString().slice(0, 10), notes: '' });
  const [penaltyForm, setPenaltyForm] = useState({ employeeId: '', violationId: '', penaltyType: 'FINANCIAL', amount: '0', notes: '' });
  const [complaintForm, setComplaintForm] = useState({ employeeId: '', subject: '', description: '', assignedTo: '' });
  const [appealForm, setAppealForm] = useState({ referenceType: 'HR_PENALTY', referenceId: '', employeeId: '', reason: '' });
  const [attachmentForm, setAttachmentForm] = useState({ referenceType: 'HR_VIOLATION', referenceId: '', fileName: '', filePath: '' });
  const [filterEmployeeId, setFilterEmployeeId] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setViolations(HrDisciplineService.getViolations(filterEmployeeId || undefined));
      setWarnings(HrDisciplineService.getWarnings(filterEmployeeId || undefined));
      setPenalties(HrDisciplineService.getPenalties(filterEmployeeId || undefined));
      setComplaints(HrDisciplineService.getComplaints(filterEmployeeId || undefined));
      setAppeals(HrDisciplineService.getAppeals(filterEmployeeId || undefined));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل البيانات.'); }
    finally { setLoading(false); }
  }, [filterEmployeeId]);

  useEffect(() => { load(); }, [load]);

  const createViolation = () => { try { HrDisciplineService.createViolation(violationForm); setViolationForm({ employeeId: '', violationType: '', description: '', occurredAt: new Date().toISOString().slice(0, 10), severity: 'MINOR' }); load(); } catch (e: any) { setError(e?.message); } };
  const issueWarning = () => { try { HrDisciplineService.issueWarning({ employeeId: warningForm.employeeId, violationId: warningForm.violationId || null, warningType: warningForm.warningType, issuedAt: warningForm.issuedAt, notes: warningForm.notes }); setWarningForm({ employeeId: '', violationId: '', warningType: 'WRITTEN', issuedAt: new Date().toISOString().slice(0, 10), notes: '' }); load(); } catch (e: any) { setError(e?.message); } };
  const createPenalty = () => { try { HrDisciplineService.createPenalty({ employeeId: penaltyForm.employeeId, violationId: penaltyForm.violationId || null, penaltyType: penaltyForm.penaltyType, amount: Number(penaltyForm.amount) || 0, notes: penaltyForm.notes }); setPenaltyForm({ employeeId: '', violationId: '', penaltyType: 'FINANCIAL', amount: '0', notes: '' }); load(); } catch (e: any) { setError(e?.message); } };
  const createComplaint = () => { try { HrDisciplineService.createComplaint({ employeeId: complaintForm.employeeId, subject: complaintForm.subject, description: complaintForm.description, assignedTo: complaintForm.assignedTo || undefined }); setComplaintForm({ employeeId: '', subject: '', description: '', assignedTo: '' }); load(); } catch (e: any) { setError(e?.message); } };
  const createAppeal = () => { try { HrDisciplineService.createAppeal({ referenceType: appealForm.referenceType, referenceId: appealForm.referenceId, employeeId: appealForm.employeeId, reason: appealForm.reason }); setAppealForm({ referenceType: 'HR_PENALTY', referenceId: '', employeeId: '', reason: '' }); load(); } catch (e: any) { setError(e?.message); } };
  const addAttachment = () => { try { HrDisciplineService.addAttachment({ referenceType: attachmentForm.referenceType, referenceId: attachmentForm.referenceId, fileName: attachmentForm.fileName, filePath: attachmentForm.filePath }); setAttachmentForm({ referenceType: 'HR_VIOLATION', referenceId: '', fileName: '', filePath: '' }); load(); } catch (e: any) { setError(e?.message); } };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'violations', label: 'المخالفات', icon: <ShieldAlert className="h-4 w-4" /> },
    { id: 'warnings', label: 'الإنذارات', icon: <AlertTriangle className="h-4 w-4" /> },
    { id: 'penalties', label: 'الجزاءات', icon: <Scale className="h-4 w-4" /> },
    { id: 'complaints', label: 'الشكاوى', icon: <MessageSquare className="h-4 w-4" /> },
    { id: 'appeals', label: 'التظلمات', icon: <FileText className="h-4 w-4" /> },
    { id: 'attachments', label: 'المرفقات', icon: <Paperclip className="h-4 w-4" /> },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-rose-600" />
        </div>
        <div>
          <h1 className="text-base font-black">الجزاءات والمخالفات والشكاوى</h1>
          <p className="text-xs text-slate-500 font-medium">مخالفات، إنذارات، جزاءات (بعد اعتماد)، شكاوى، تظلمات، مرفقات</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        <div className="flex items-center gap-2">
          <input value={filterEmployeeId} onChange={(e) => setFilterEmployeeId(e.target.value)} placeholder="فلترة حسب معرف الموظف" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={load} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحديث</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${tab === t.id ? 'bg-rose-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {loading ? <div className="py-16 flex justify-center"><ShieldAlert className="w-6 h-6 animate-spin text-rose-500" /></div> : (
          <>
            {tab === 'violations' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">المخالفات</h3>
                  {violations.map((v) => (
                    <div key={v.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{v.violationType} • {v.severity} • {v.status}</div>
                      <div className="text-slate-500">{v.employeeId} • {v.occurredAt}</div>
                      {v.status !== 'CLOSED' && <button onClick={() => { try { HrDisciplineService.closeViolation(v.id); load(); } catch (e: any) { setError(e?.message); } }} className="text-emerald-600 font-bold">إغلاق</button>}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">تسجيل مخالفة</h3>
                  <input value={violationForm.employeeId} onChange={(e) => setViolationForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={violationForm.violationType} onChange={(e) => setViolationForm((p) => ({ ...p, violationType: e.target.value }))} placeholder="نوع المخالفة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={violationForm.description} onChange={(e) => setViolationForm((p) => ({ ...p, description: e.target.value }))} placeholder="الوصف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <input type="date" value={violationForm.occurredAt} onChange={(e) => setViolationForm((p) => ({ ...p, occurredAt: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={violationForm.severity} onChange={(e) => setViolationForm((p) => ({ ...p, severity: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <button onClick={createViolation} className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">تسجيل</button>
                </div>
              </div>
            )}
            {tab === 'warnings' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">الإنذارات</h3>
                  {warnings.map((w) => (
                    <div key={w.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{w.warningType} • {w.status}</div>
                      <div className="text-slate-500">{w.employeeId} • {w.issuedAt}</div>
                      {w.status !== 'CANCELLED' && <button onClick={() => { try { HrDisciplineService.cancelWarning(w.id); load(); } catch (e: any) { setError(e?.message); } }} className="text-rose-600 font-bold">إلغاء</button>}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إصدار إنذار</h3>
                  <input value={warningForm.employeeId} onChange={(e) => setWarningForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={warningForm.violationId} onChange={(e) => setWarningForm((p) => ({ ...p, violationId: e.target.value }))} placeholder="معرف المخالفة (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={warningForm.warningType} onChange={(e) => setWarningForm((p) => ({ ...p, warningType: e.target.value }))} placeholder="نوع الإنذار" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={warningForm.issuedAt} onChange={(e) => setWarningForm((p) => ({ ...p, issuedAt: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={warningForm.notes} onChange={(e) => setWarningForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={issueWarning} className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">إصدار</button>
                </div>
              </div>
            )}
            {tab === 'penalties' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">الجزاءات</h3>
                  {penalties.map((p) => (
                    <div key={p.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{p.penaltyType} • {p.amount} • {p.status}</div>
                      <div className="text-slate-500">{p.employeeId}</div>
                      {p.status === 'DRAFT' && (
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => { try { HrDisciplineService.requestPenaltyApproval(p.id); alert('تم إنشاء طلب اعتماد.'); } catch (e: any) { setError(e?.message); } }} className="text-sky-600 font-bold">طلب اعتماد</button>
                          <button onClick={() => { try { HrDisciplineService.approvePenalty(p.id); load(); } catch (e: any) { setError(e?.message); } }} className="text-emerald-600 font-bold">اعتماد وترحيل</button>
                          <button onClick={() => { try { HrDisciplineService.cancelPenalty(p.id); load(); } catch (e: any) { setError(e?.message); } }} className="text-rose-600 font-bold">إلغاء</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إنشاء جزاء</h3>
                  <input value={penaltyForm.employeeId} onChange={(e) => setPenaltyForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={penaltyForm.violationId} onChange={(e) => setPenaltyForm((p) => ({ ...p, violationId: e.target.value }))} placeholder="معرف المخالفة (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={penaltyForm.penaltyType} onChange={(e) => setPenaltyForm((p) => ({ ...p, penaltyType: e.target.value }))} placeholder="نوع الجزاء" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={penaltyForm.amount} onChange={(e) => setPenaltyForm((p) => ({ ...p, amount: e.target.value }))} placeholder="المبلغ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={penaltyForm.notes} onChange={(e) => setPenaltyForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={createPenalty} className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                  <p className="text-[10px] text-slate-500">لا يتحول الجزاء المالي إلى خصم في الراتب إلا بعد اعتماد (اعتماد وترحيل).</p>
                </div>
              </div>
            )}
            {tab === 'complaints' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">الشكاوى</h3>
                  {complaints.map((c) => (
                    <div key={c.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{c.subject} • {c.status}</div>
                      <div className="text-slate-500">{c.employeeId} • {c.submittedAt}</div>
                      {c.status !== 'RESOLVED' && c.status !== 'REJECTED' && (
                        <button onClick={() => { const res = window.prompt('القرار:'); if (res) { try { HrDisciplineService.resolveComplaint(c.id, res, 'RESOLVED'); load(); } catch (e: any) { setError(e?.message); } } }} className="text-emerald-600 font-bold">حل</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">تقديم شكوى</h3>
                  <input value={complaintForm.employeeId} onChange={(e) => setComplaintForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={complaintForm.subject} onChange={(e) => setComplaintForm((p) => ({ ...p, subject: e.target.value }))} placeholder="الموضوع" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={complaintForm.description} onChange={(e) => setComplaintForm((p) => ({ ...p, description: e.target.value }))} placeholder="الوصف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <input value={complaintForm.assignedTo} onChange={(e) => setComplaintForm((p) => ({ ...p, assignedTo: e.target.value }))} placeholder="تعيين إلى (user id)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={createComplaint} className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">تقديم</button>
                </div>
              </div>
            )}
            {tab === 'appeals' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">التظلمات</h3>
                  {appeals.map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{a.referenceType} • {a.referenceId} • {a.status}</div>
                      <div className="text-slate-500">{a.employeeId} • {a.reason}</div>
                      {a.status === 'OPEN' && (
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => { const dec = window.prompt('القرار:'); if (dec) { try { HrDisciplineService.decideAppeal(a.id, true, dec); load(); } catch (e: any) { setError(e?.message); } } }} className="text-emerald-600 font-bold">قبول</button>
                          <button onClick={() => { const dec = window.prompt('القرار:'); if (dec) { try { HrDisciplineService.decideAppeal(a.id, false, dec); load(); } catch (e: any) { setError(e?.message); } } }} className="text-rose-600 font-bold">رفض</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">تقديم تظلم</h3>
                  <input value={appealForm.referenceType} onChange={(e) => setAppealForm((p) => ({ ...p, referenceType: e.target.value }))} placeholder="نوع المرجع" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={appealForm.referenceId} onChange={(e) => setAppealForm((p) => ({ ...p, referenceId: e.target.value }))} placeholder="معرف المرجع" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={appealForm.employeeId} onChange={(e) => setAppealForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={appealForm.reason} onChange={(e) => setAppealForm((p) => ({ ...p, reason: e.target.value }))} placeholder="السبب" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={createAppeal} className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">تقديم</button>
                </div>
              </div>
            )}
            {tab === 'attachments' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">المرفقات</h3>
                  <div className="flex gap-2">
                    <input value={attachmentForm.referenceType} onChange={(e) => setAttachmentForm((p) => ({ ...p, referenceType: e.target.value }))} placeholder="نوع المرجع" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input value={attachmentForm.referenceId} onChange={(e) => setAttachmentForm((p) => ({ ...p, referenceId: e.target.value }))} placeholder="معرف المرجع" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button onClick={() => { if (attachmentForm.referenceType && attachmentForm.referenceId) { try { setAttachments(HrDisciplineService.getAttachments(attachmentForm.referenceType, attachmentForm.referenceId)); } catch (e: any) { setError(e?.message); } } }} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحميل</button>
                  </div>
                  {attachments.map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{a.fileName}</div>
                      <div className="text-slate-500">{a.referenceType} • {a.referenceId}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إضافة مرفق</h3>
                  <input value={attachmentForm.referenceType} onChange={(e) => setAttachmentForm((p) => ({ ...p, referenceType: e.target.value }))} placeholder="نوع المرجع" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={attachmentForm.referenceId} onChange={(e) => setAttachmentForm((p) => ({ ...p, referenceId: e.target.value }))} placeholder="معرف المرجع" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={attachmentForm.fileName} onChange={(e) => setAttachmentForm((p) => ({ ...p, fileName: e.target.value }))} placeholder="اسم الملف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={attachmentForm.filePath} onChange={(e) => setAttachmentForm((p) => ({ ...p, filePath: e.target.value }))} placeholder="مسار الملف (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={addAttachment} className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">إضافة</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
