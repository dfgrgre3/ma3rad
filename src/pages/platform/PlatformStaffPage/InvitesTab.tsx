import React from 'react';
import { MailCheck, UserPlus, AlertTriangle, Copy, Check } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import type {
  PlatformStaffInvite,
  PlatformStaffInviteCreated,
  PlatformStaffRole,
  PlatformStaffRoleDefinition,
} from '../../../services/domains/platform/platformTypes';
import { EmptyState, StatusBadge, formatDateTime, inputClass } from '../components/PlatformUI';
import { RoleBadge } from './RoleBadge';

interface InvitesTabProps {
  canCreate: boolean;
  canUpdate: boolean;
  roles: PlatformStaffRoleDefinition[];
  invites: PlatformStaffInvite[];
  inviteForm: { fullName: string; email: string; phone: string; role: PlatformStaffRole; expiresInHours: number };
  setInviteForm: React.Dispatch<React.SetStateAction<InvitesTabProps['inviteForm']>>;
  createdInvite: PlatformStaffInviteCreated | null;
  copied: boolean;
  onCreateInvite: () => void;
  onRevokeInvite: (invite: PlatformStaffInvite) => void;
  onCopyInvite: () => void;
}

export const InvitesTab: React.FC<InvitesTabProps> = ({
  canCreate,
  canUpdate,
  roles,
  invites,
  inviteForm,
  setInviteForm,
  createdInvite,
  copied,
  onCreateInvite,
  onRevokeInvite,
  onCopyInvite,
}) => (
  <>
    {canCreate && (
      <div className="rounded-xl border border-line-strong bg-primary/70 p-4">
        <p className="text-xs font-black text-muted mb-3 flex items-center gap-2"><MailCheck className="h-4 w-4 text-primary" /> دعوة موظف جديد للمنصة</p>
        <div className="grid gap-3 md:grid-cols-4">
          <input value={inviteForm.fullName} onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })} placeholder="الاسم الكامل *" className={inputClass} />
          <input value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="البريد الإلكتروني *" type="email" dir="ltr" className={inputClass} />
          <input value={inviteForm.phone} onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })} placeholder="الهاتف (اختياري)" dir="ltr" className={inputClass} />
          <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as PlatformStaffRole })} className={inputClass}>
            {roles.filter((r) => r.role !== 'SUPER_ADMIN').map((r) => (
              <option key={r.role} value={r.role}>{r.title}</option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-muted">
            صلاحية الرابط
            <select value={inviteForm.expiresInHours} onChange={(e) => setInviteForm({ ...inviteForm, expiresInHours: Number(e.target.value) })} className={`${inputClass} w-32`}>
              <option value={24}>24 ساعة</option>
              <option value={72}>72 ساعة</option>
              <option value={168}>أسبوع</option>
              <option value={720}>30 يوماً</option>
            </select>
          </label>
          <Button size="sm" onClick={onCreateInvite} leadingIcon={<UserPlus className="h-4 w-4" />}>إنشاء دعوة</Button>
        </div>

        {createdInvite && (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-3">
            <p className="text-[11px] font-bold text-warning flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> يُعرض هذا الرابط مرة واحدة فقط — احفظه قبل المغادرة.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input readOnly value={createdInvite.link} dir="ltr" className={`${inputClass} flex-1 font-mono text-[10.5px]`} onFocus={(e) => e.target.select()} />
              <button onClick={onCopyInvite} className="flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-[11px] font-bold text-muted hover:text-white hover:border-line-strong">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {copied ? 'تم النسخ' : 'نسخ الرابط'}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-muted">الدعوة مخصصة لحساب <span dir="ltr" className="font-mono text-muted">{createdInvite.invite.email}</span> وتنتهي في {formatDateTime(createdInvite.invite.expiresAt)}.</p>
          </div>
        )}
      </div>
    )}

    <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70">
      {invites.length === 0 ? (
        <EmptyState icon={<MailCheck className="h-6 w-6 text-muted" />} title="لا توجد دعوات" description="أنشئ دعوة لموظف جديد — سيُنشئ هو كلمة مروره عبر الرابط المحدود المدة." />
      ) : (
        <DataTable
          ariaLabel="دعوات الموظفين"
          rows={invites}
          rowKey={(invite) => invite.id}
          minWidth={850}
          dense
          columns={[
            {
              key: 'staff', header: 'الموظف',
              render: (invite) => (
                <div><div className="font-bold text-muted">{invite.fullName}</div><div className="text-[10px] text-muted" dir="ltr">{invite.email}</div></div>
              ),
            },
            { key: 'role', header: 'الدور', render: (invite) => <RoleBadge role={invite.role} /> },
            { key: 'status', header: 'الحالة', render: (invite) => <StatusBadge value={invite.status} label={invite.status === 'PENDING' ? 'معلقة' : invite.status === 'ACCEPTED' ? 'مقبولة' : invite.status === 'REVOKED' ? 'ملغية' : 'منتهية'} /> },
            { key: 'expires', header: 'تنتهي في', render: (invite) => <span className="text-muted">{formatDateTime(invite.expiresAt)}</span> },
            { key: 'by', header: 'أنشأها', render: (invite) => <span className="text-muted">{invite.invitedByName || '—'}</span> },
            {
              key: 'actions', header: '',
              render: (invite) => invite.status === 'PENDING' && canUpdate ? (
                <button onClick={() => onRevokeInvite(invite)} className="text-danger hover:text-danger text-[10.5px] font-bold">إلغاء الدعوة</button>
              ) : null,
            },
          ]}
        />
      )}
    </div>
  </>
);
