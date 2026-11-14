import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  Mail,
  Phone,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformStaff,
  PlatformStaffInput,
  PlatformStaffRole,
  PlatformStaffRoleDefinition,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  StatusBadge,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

export const PlatformStaffPage: React.FC = () => {
  const [staffList, setStaffList] = useState<PlatformStaff[]>([]);
  const [roles, setRoles] = useState<PlatformStaffRoleDefinition[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<PlatformStaff | null>(null);
  const [formData, setFormData] = useState<PlatformStaffInput>({
    fullName: '',
    email: '',
    phone: '',
    role: 'SUPPORT_AGENT',
    password: '',
    isActive: true,
  });

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const staff = platformAdminService.listPlatformStaff(search, roleFilter);
      const roleDefs = platformAdminService.listPlatformStaffRoles();
      setStaffList(staff);
      setRoles(roleDefs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل موظفي المنصة.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setEditingStaff(null);
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      role: 'SUPPORT_AGENT',
      password: '',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (staff: PlatformStaff) => {
    setEditingStaff(staff);
    setFormData({
      fullName: staff.fullName,
      email: staff.email,
      phone: staff.phone || '',
      role: staff.role,
      isActive: staff.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.fullName.trim() || !formData.email.trim()) {
      alert('الاسم والبريد الإلكتروني مطلوبان.');
      return;
    }
    if (!editingStaff && (!formData.password || formData.password.length < 6)) {
      alert('كلمة المرور مطلوبة وتجب أن تكون 6 أحرف على الأقل للموظف الجديد.');
      return;
    }

    try {
      if (editingStaff) {
        platformAdminService.updatePlatformStaff(editingStaff.id, formData);
      } else {
        platformAdminService.createPlatformStaff(formData);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل حفظ بيانات الموظف.');
    }
  };

  const handleToggleActive = (staff: PlatformStaff) => {
    try {
      platformAdminService.setPlatformStaffActive(staff.id, !staff.isActive);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تغيير حالة تفعيل الموظف.');
    }
  };

  const handleDelete = (staff: PlatformStaff) => {
    if (!confirm(`هل أنت متأكد من حذف حساب الموظف "${staff.fullName}" نهائياً من المنصة؟`)) return;
    try {
      platformAdminService.deletePlatformStaff(staff.id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر حذف الموظف.');
    }
  };

  const getRoleBadge = (role: PlatformStaffRole) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-black">مالك المنصة</span>;
      case 'PLATFORM_ADMIN':
        return <span className="bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded text-[10px] font-black">مدير المنصة</span>;
      case 'SUPPORT_AGENT':
        return <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-black">دعم فني</span>;
      case 'BILLING_SPECIALIST':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-black">فوترة واشتراكات</span>;
      case 'OPERATIONS_ENGINEER':
        return <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] font-black">عمليات وتشغيل</span>;
      case 'LICENSE_MANAGER':
        return <span className="bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded text-[10px] font-black">إدارة التراخيص</span>;
      default:
        return <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">{role}</span>;
    }
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="إدارة مستخدمي وموظفي المنصة (Staff & RBAC)"
        description="إدارة فريق العمل المشغل للمنصة: الدعم الفني، مسؤولي الفوترة والعمليات، التراخيص وتوزيع الصلاحيات الإدارية."
        icon={<Users className="h-5 w-5" />}
        actions={
          <Button
            size="sm"
            onClick={handleOpenCreate}
            leadingIcon={<UserPlus className="h-4 w-4" />}
          >
            إضافة موظف للمنصة
          </Button>
        }
      />

      {/* Roles Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {roles.map((r) => {
          const count = staffList.filter((s) => s.role === r.role).length;
          return (
            <div
              key={r.role}
              onClick={() => setRoleFilter(roleFilter === r.role ? '' : r.role)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                roleFilter === r.role
                  ? 'border-sky-500 bg-sky-950/30'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-black text-slate-100">{count}</span>
                <Shield className="h-4 w-4 text-slate-500" />
              </div>
              <p className="text-[11.5px] font-bold text-slate-200 mt-1 truncate">{r.title.split('(')[0]}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{r.description}</p>
            </div>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="البحث بالاسم، البريد الإلكتروني أو الهاتف..."
            className={`${inputClass} pr-9`}
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className={`${inputClass} max-w-[200px]`}
        >
          <option value="">جميع الأدوار</option>
          {roles.map((r) => (
            <option key={r.role} value={r.role}>
              {r.title}
            </option>
          ))}
        </select>

        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">
          {staffList.length} موظف
        </span>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-300">
          {error}
        </div>
      )}

      {/* Staff Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل طاقم المنصة...</div>
        ) : staffList.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6 text-slate-500" />}
            title="لا يوجد موظفون مسجلون"
            description="أضف موظفي الدعم أو الفوترة أو العمليات لتوزيع الصلاحيات على المنصة."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-right text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                <tr>
                  <th className="px-4 py-3">الموظف</th>
                  <th className="px-4 py-3">الدور الإداري</th>
                  <th className="px-4 py-3">معلومات الاتصال</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">آخر تسجيل دخول</th>
                  <th className="px-4 py-3">تاريخ الإنشاء</th>
                  <th className="px-4 py-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {staffList.map((staff) => (
                  <tr key={staff.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-100">{staff.fullName}</div>
                      <div className="text-[10px] font-mono text-slate-500">{staff.id}</div>
                    </td>
                    <td className="px-4 py-3">{getRoleBadge(staff.role)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Mail className="h-3 w-3 text-slate-500" />
                        <span>{staff.email}</span>
                      </div>
                      {staff.phone && (
                        <div className="flex items-center gap-1.5 text-slate-400 mt-0.5 text-[11px]">
                          <Phone className="h-3 w-3 text-slate-500" />
                          <span dir="ltr">{staff.phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold inline-flex items-center gap-1 ${
                          staff.isActive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {staff.isActive ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> نشط
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3" /> موقوف
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {staff.lastLoginAt ? formatDateTime(staff.lastLoginAt) : 'لم يسجل دخول بعد'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDateTime(staff.createdAt)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(staff)}
                          className="text-sky-400 hover:text-sky-300 p-1"
                          title="تعديل البيانات"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        {staff.role !== 'SUPER_ADMIN' && (
                          <>
                            <button
                              onClick={() => handleToggleActive(staff)}
                              className={`${
                                staff.isActive ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'
                              } p-1`}
                              title={staff.isActive ? 'تجميد الحساب' : 'تفعيل الحساب'}
                            >
                              {staff.isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => handleDelete(staff)}
                              className="text-rose-400 hover:text-rose-300 p-1"
                              title="حذف الموظف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create or Edit Staff */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStaff ? `تعديل بيانات الموظف: ${editingStaff.fullName}` : 'إضافة موظف جديد للمنصة'}
      >
        <div className="space-y-3.5 text-right">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">الاسم الكامل *</label>
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="مثلاً: أحمد محمود"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">البريد الإلكتروني *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="staff@platform.local"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">رقم الهاتف (اختياري)</label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="010XXXXXXXX"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">الدور الإداري والصلاحيات *</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as PlatformStaffRole })}
              className={inputClass}
              disabled={editingStaff?.role === 'SUPER_ADMIN'}
            >
              {roles.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.title}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              {roles.find((r) => r.role === formData.role)?.description}
            </p>
          </div>

          {!editingStaff && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور الأولية *</label>
              <input
                type="password"
                value={formData.password || ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="6 أحرف على الأقل"
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer mt-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                disabled={editingStaff?.role === 'SUPER_ADMIN'}
                className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
              />
              <span>الحساب نشط ويمكنه تسجيل الدخول فوراً</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSave}>
              حفظ الموظف
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformStaffPage;
