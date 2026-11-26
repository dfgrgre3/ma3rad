import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Building2,
  Calendar,
  Edit3,
  Eye,
  FileText,
  Globe,
  History,
  Image as ImageIcon,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Upload,
  X,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { CompanyService } from '../../../services/domains/organization/CompanyService';
import type { Company } from '../../../types';

interface CompanyFormState {
  code: string;
  name: string;
  englishName: string;
  logoPath: string;
  commercialRecord: string;
  taxNumber: string;
  address: string;
  country: string;
  city: string;
  phone: string;
  email: string;
  currency: string;
  timeZone: string;
  locale: string;
  fiscalYearStartDate: string;
  fiscalYearEndDate: string;
}

const EMPTY_FORM: CompanyFormState = {
  code: 'MAIN',
  name: '',
  englishName: '',
  logoPath: '',
  commercialRecord: '',
  taxNumber: '',
  address: '',
  country: 'مصر',
  city: '',
  phone: '',
  email: '',
  currency: 'EGP',
  timeZone: 'Africa/Cairo',
  locale: 'ar',
  fiscalYearStartDate: `${new Date().getFullYear()}-01-01`,
  fiscalYearEndDate: `${new Date().getFullYear()}-12-31`,
};

const toFormState = (company: Company): CompanyFormState => ({
  code: company.code || 'MAIN',
  name: company.name || '',
  englishName: company.englishName || '',
  logoPath: company.logoPath || '',
  commercialRecord: company.commercialRecord || '',
  taxNumber: company.taxNumber || '',
  address: company.address || '',
  country: company.country || '',
  city: company.city || '',
  phone: company.phone || '',
  email: company.email || '',
  currency: company.currency || 'EGP',
  timeZone: company.timeZone || 'Africa/Cairo',
  locale: company.locale || 'ar',
  fiscalYearStartDate: company.fiscalYearStartDate || `${new Date().getFullYear()}-01-01`,
  fiscalYearEndDate: company.fiscalYearEndDate || `${new Date().getFullYear()}-12-31`,
});

const inputCls =
  'w-full px-3 py-2 bg-surface-muted rounded-xl border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70 disabled:cursor-not-allowed';

const labelCls = 'block text-xs font-bold text-ink mb-1';

export const CompanySettingsPage: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyFormState>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showPreview, setShowPreview] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<Array<{
    id: string;
    userName: string;
    action: string;
    oldValues: string | null;
    newValues: string | null;
    createdAt: string;
  }>>([]);

  const loadCompanies = useCallback(() => {
    try {
      const list = new CompanyService().getAllCompanies(false);
      setCompanies(list);
      if (list.length > 0) {
        const active = list.find((c) => c.id === selectedId) || list[0];
        setSelectedId(active.id);
        setForm(toFormState(active));
        setIsCreating(false);
      } else {
        setSelectedId(null);
        setForm(EMPTY_FORM);
        setIsCreating(true);
        setIsEditing(true);
      }
    } catch (e: any) {
      toast.error('تعذر تحميل بيانات الشركة', e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedId, toast]);

  useEffect(() => {
    if (can('companies.view')) {
      loadCompanies();
    } else {
      setLoading(false);
    }
  }, [can, loadCompanies]);

  const activeCompany = companies.find((c) => c.id === selectedId) || null;

  const handleSelectCompany = (id: string) => {
    const found = companies.find((c) => c.id === id);
    if (!found) return;
    setSelectedId(found.id);
    setForm(toFormState(found));
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    setForm({ ...EMPTY_FORM, code: `CMP${companies.length + 1}` });
    setIsCreating(true);
    setIsEditing(true);
  };

  const handleStartEdit = () => {
    if (!activeCompany) {
      handleStartCreate();
      return;
    }
    setForm(toFormState(activeCompany));
    setIsCreating(false);
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (activeCompany) {
      setForm(toFormState(activeCompany));
      setIsCreating(false);
      setIsEditing(false);
    } else {
      setForm(EMPTY_FORM);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('ملف غير صالح', 'يرجى اختيار صورة صالحة (PNG, JPG, SVG, WebP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('حجم الصورة كبير', 'الحد الأقصى لحجم الشعار هو 2 ميجابايت.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, logoPath: reader.result as string }));
        if (!isEditing) setIsEditing(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = () => {
    if (!form.name.trim() || form.name.trim().length < 2) {
      toast.error('بيانات ناقصة', 'اسم الشركة بالعربي مطلوب (حرفان على الأقل).');
      return;
    }
    setSaving(true);
    try {
      const service = new CompanyService();
      let saved: Company;
      if (isCreating || !activeCompany) {
        saved = service.createCompany({
          code: form.code.trim() || 'MAIN',
          name: form.name.trim(),
          englishName: form.englishName.trim() || undefined,
          logoPath: form.logoPath || undefined,
          commercialRecord: form.commercialRecord.trim() || undefined,
          taxNumber: form.taxNumber.trim() || undefined,
          address: form.address.trim() || undefined,
          country: form.country.trim() || undefined,
          city: form.city.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          currency: form.currency.trim() || 'EGP',
          timeZone: form.timeZone.trim() || 'Africa/Cairo',
          locale: form.locale || 'ar',
          fiscalYearStartDate: form.fiscalYearStartDate || undefined,
          fiscalYearEndDate: form.fiscalYearEndDate || undefined,
        });
        toast.success('تم إنشاء بيانات الشركة بنجاح');
      } else {
        saved = service.updateCompany(activeCompany.id, {
          name: form.name.trim(),
          englishName: form.englishName.trim() || null,
          logoPath: form.logoPath || null,
          commercialRecord: form.commercialRecord.trim() || null,
          taxNumber: form.taxNumber.trim() || null,
          address: form.address.trim() || null,
          country: form.country.trim() || null,
          city: form.city.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          currency: form.currency.trim() || 'EGP',
          timeZone: form.timeZone.trim() || 'Africa/Cairo',
          locale: form.locale || 'ar',
          fiscalYearStartDate: form.fiscalYearStartDate || null,
          fiscalYearEndDate: form.fiscalYearEndDate || null,
        });
        toast.success('تم حفظ بيانات الشركة بنجاح');
      }

      service.syncCompanyToSystemSettings(saved);
      setSelectedId(saved.id);
      setForm(toFormState(saved));
      setIsCreating(false);
      setIsEditing(false);
      loadCompanies();
    } catch (e: any) {
      toast.error('تعذر حفظ بيانات الشركة', e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAudit = () => {
    if (!activeCompany) {
      toast.info('لا يوجد سجل تعديلات بعد');
      return;
    }
    try {
      const logs = new CompanyService().getCompanyAuditLogs(activeCompany.id);
      setAuditLogs(logs);
      setShowAudit(true);
    } catch (e: any) {
      toast.error('تعذر تحميل سجل التعديلات', e?.message || String(e));
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-muted">جاري تحميل بيانات الشركة...</div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="بيانات الشركة (Company Settings)"
        description="التعريف الرسمي للشركة المالكة للنظام — تظهر تلقائيًا في الفواتير وأوامر الشراء والإنتاج وأذون المخازن والتقارير."
        icon={<Building2 className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isEditing ? (
              <>
                <Button variant="primary" size="sm" onClick={handleStartEdit}>
                  <Edit3 className="w-4 h-4 ml-1" />
                  تعديل البيانات
                </Button>
                <Button variant="secondary" size="sm" onClick={handleStartCreate}>
                  <Plus className="w-4 h-4 ml-1" />
                  إضافة شركة
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 ml-1" />
                  {saving ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
                  <X className="w-4 h-4 ml-1" />
                  إلغاء
                </Button>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="w-4 h-4 ml-1" />
              معاينة
            </Button>
            <Button variant="secondary" size="sm" onClick={handleOpenAudit}>
              <History className="w-4 h-4 ml-1" />
              سجل التعديلات
            </Button>
          </div>
        }
      />

      {companies.length > 1 && !isCreating && (
        <div className="bg-surface rounded-2xl border border-line p-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-muted">الشركة المحددة:</span>
          <div className="flex flex-wrap gap-2">
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCompany(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  c.id === selectedId
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface-muted text-ink border-line hover:border-primary/40'
                }`}
              >
                {c.name} ({c.code})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Logo & Identity Card */}
        <div className="bg-surface rounded-2xl border border-line p-5 space-y-4">
          <h3 className="text-sm font-black text-ink flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            شعار الشركة
          </h3>
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-line bg-surface-muted min-h-[180px]">
            {form.logoPath ? (
              <img
                src={form.logoPath}
                alt="شعار الشركة"
                className="max-h-32 max-w-full object-contain rounded-lg"
              />
            ) : (
              <div className="text-center text-muted space-y-2">
                <Building2 className="w-12 h-12 mx-auto opacity-40" />
                <p className="text-xs">لم يتم رفع شعار للشركة</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoChange}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 ml-1" />
              تغيير الشعار
            </Button>
            {form.logoPath && isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setForm((prev) => ({ ...prev, logoPath: '' }))}
              >
                إزالة
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            يظهر الشعار تلقائيًا في ترويسة فواتير البيع والشراء، أوامر الشراء، أوامر الإنتاج، أذون المخازن، وتقارير الإدارة.
          </p>
        </div>

        {/* Main Company Form */}
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-line p-5 space-y-5">
          <h3 className="text-sm font-black text-ink flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            البيانات الأساسية والقانونية
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isCreating && (
              <div>
                <label className={labelCls}>كود الشركة</label>
                <input
                  className={inputCls}
                  value={form.code}
                  disabled={!isEditing}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="MAIN"
                />
              </div>
            )}
            <div>
              <label className={labelCls}>اسم الشركة بالعربي (الاسم الرسمي) *</label>
              <input
                className={inputCls}
                value={form.name}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: شركة النور للسيراميك ومواد البناء"
              />
            </div>
            <div>
              <label className={labelCls}>اسم الشركة بالإنجليزي (الاسم الدولي)</label>
              <input
                className={inputCls}
                dir="ltr"
                value={form.englishName}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, englishName: e.target.value })}
                placeholder="e.g. Al-Noor Ceramics Co."
              />
            </div>
            <div>
              <label className={labelCls}>رقم التسجيل (الرقم القانوني أو التجاري)</label>
              <input
                className={inputCls}
                value={form.commercialRecord}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, commercialRecord: e.target.value })}
                placeholder="رقم السجل التجاري"
              />
            </div>
            <div>
              <label className={labelCls}>الرقم الضريبي</label>
              <input
                className={inputCls}
                value={form.taxNumber}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
                placeholder="البطاقة الضريبية / الرقم الضريبي"
              />
            </div>
          </div>

          <hr className="border-line" />

          <h3 className="text-sm font-black text-ink flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            بيانات الاتصال والمقر
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>العنوان (عنوان المقر)</label>
              <input
                className={inputCls}
                value={form.address}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="العنوان التفصيلي للمقر الرئيسي"
              />
            </div>
            <div>
              <label className={labelCls}>الدولة</label>
              <input
                className={inputCls}
                value={form.country}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="مصر"
              />
            </div>
            <div>
              <label className={labelCls}>المدينة</label>
              <input
                className={inputCls}
                value={form.city}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="القاهرة"
              />
            </div>
            <div>
              <label className={labelCls}>
                <Phone className="w-3.5 h-3.5 inline ml-1 text-muted" />
                رقم الهاتف
              </label>
              <input
                className={inputCls}
                dir="ltr"
                value={form.phone}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+20 100 000 0000"
              />
            </div>
            <div>
              <label className={labelCls}>
                <Mail className="w-3.5 h-3.5 inline ml-1 text-muted" />
                البريد الإلكتروني (البريد الرسمي)
              </label>
              <input
                type="email"
                className={inputCls}
                dir="ltr"
                value={form.email}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="info@company.com"
              />
            </div>
          </div>

          <hr className="border-line" />

          <h3 className="text-sm font-black text-ink flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            الإعدادات المالية والإقليمية
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>العملة الأساسية (عملة الحسابات)</label>
              <select
                className={inputCls}
                value={form.currency}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="EGP">جنيه مصري (EGP)</option>
                <option value="SAR">ريال سعودي (SAR)</option>
                <option value="AED">درهم إماراتي (AED)</option>
                <option value="USD">دولار أمريكي (USD)</option>
                <option value="EUR">يورو (EUR)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>المنطقة الزمنية (توقيت النظام)</label>
              <select
                className={inputCls}
                value={form.timeZone}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
              >
                <option value="Africa/Cairo">Africa/Cairo (توقيت القاهرة)</option>
                <option value="Asia/Riyadh">Asia/Riyadh (توقيت الرياض)</option>
                <option value="Asia/Dubai">Asia/Dubai (توقيت دبي)</option>
                <option value="UTC">UTC (التوقيت العالمي)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>اللغة الافتراضية (لغة الواجهة)</label>
              <select
                className={inputCls}
                value={form.locale}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
              >
                <option value="ar">العربية (ar)</option>
                <option value="en">English (en)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                <Calendar className="w-3.5 h-3.5 inline ml-1 text-muted" />
                بداية السنة المالية
              </label>
              <input
                type="date"
                className={inputCls}
                value={form.fiscalYearStartDate}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, fiscalYearStartDate: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>
                <Calendar className="w-3.5 h-3.5 inline ml-1 text-muted" />
                نهاية السنة المالية
              </label>
              <input
                type="date"
                className={inputCls}
                value={form.fiscalYearEndDate}
                disabled={!isEditing}
                onChange={(e) => setForm({ ...form, fiscalYearEndDate: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Document Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-line max-w-2xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-black text-ink">معاينة ترويسة المستندات</h3>
              <button type="button" onClick={() => setShowPreview(false)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="border border-line rounded-xl p-6 bg-white text-slate-900 space-y-4">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div className="space-y-1">
                  <h4 className="text-lg font-black">{form.name || 'اسم الشركة'}</h4>
                  {form.englishName && (
                    <p className="text-xs font-semibold text-slate-500" dir="ltr">{form.englishName}</p>
                  )}
                  <p className="text-xs text-slate-600">
                    {[form.address, form.city, form.country].filter(Boolean).join(' - ') || 'عنوان الشركة'}
                  </p>
                  <div className="flex flex-wrap gap-3 text-[11px] text-slate-600 pt-1">
                    {form.phone && <span>هاتف: {form.phone}</span>}
                    {form.email && <span>بريد: {form.email}</span>}
                    {form.taxNumber && <span>الرقم الضريبي: {form.taxNumber}</span>}
                    {form.commercialRecord && <span>السجل التجاري: {form.commercialRecord}</span>}
                  </div>
                </div>
                {form.logoPath && (
                  <img src={form.logoPath} alt="Logo" className="h-16 w-auto object-contain" />
                )}
              </div>
              <div className="text-center py-4 text-xs text-slate-500">
                نموذج توضيحي لكيفية ظهور بيانات الشركة في الفواتير، أوامر الشراء، أوامر الإنتاج، أذون المخازن، وتقارير الإدارة.
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={() => setShowPreview(false)}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {showAudit && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-line max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-black text-ink">سجل التعديلات</h3>
              <button type="button" onClick={() => setShowAudit(false)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 flex-1">
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">لا توجد تعديلات مسجلة حتى الآن.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl border border-line bg-surface-muted text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-ink">
                      <span>{log.action} — {log.userName}</span>
                      <span className="text-muted font-normal" dir="ltr">
                        {new Date(log.createdAt).toLocaleString('ar-EG')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end border-t border-line pt-3">
              <Button variant="primary" size="sm" onClick={() => setShowAudit(false)}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanySettingsPage;
