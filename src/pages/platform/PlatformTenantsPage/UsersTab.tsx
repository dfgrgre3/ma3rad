import React from 'react';
import { Ban, CheckCircle2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import type { PlatformTenantUser } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState, StatusBadge } from '../components/PlatformUI';
import { SectionCard } from './shared';

const USER_STATUS_LABELS: Record<PlatformTenantUser['status'], string> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  INVITED: 'مدعو',
};

interface UsersTabProps {
  users: PlatformTenantUser[];
  canManageTenants: boolean;
  openUserCreate: () => void;
  openUserEdit: (user: PlatformTenantUser) => void;
  toggleUser: (user: PlatformTenantUser, active: boolean) => void;
  deleteUser: (user: PlatformTenantUser) => void;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users,
  canManageTenants,
  openUserCreate,
  openUserEdit,
  toggleUser,
  deleteUser,
}) => (
              <div className="space-y-3">
                <SectionCard
                  title="مستخدمو العميل"
                  subtitle={`${users.length} مستخدم مسجل`}
                  icon={<Users className="h-4 w-4" />}
                  action={
                    canManageTenants ? (<Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openUserCreate}>
                      إضافة مستخدم
                    </Button>) : null
                  }
                >
                  {users.length === 0 ? (
                    <EmptyState icon={<Users className="h-5 w-5" />} title="لا يوجد مستخدمون مسجلون" description="أضف مستخدمين (مسؤولون، كاشير، ...) لإدارة هذا العميل." />
                  ) : (
                                        <DataTable
                      ariaLabel="مستخدمو العميل"
                      rows={users}
                      rowKey={(item) => item.id}
                      minWidth={720}
                      dense
                      columns={[
                        { key: 'name', header: 'الاسم', render: (user) => <span className="text-[11.5px] font-bold text-ink">{user.fullName}</span> },
                        { key: 'username', header: 'اسم المستخدم', render: (user) => <span className="font-mono text-[10.5px]" dir="ltr">{user.username || '—'}</span> },
                        { key: 'email', header: 'البريد', render: (user) => <span className="text-[10.5px]" dir="ltr">{user.email || '—'}</span> },
                        { key: 'phone', header: 'الهاتف', render: (user) => <span className="text-[10.5px]" dir="ltr">{user.phone || '—'}</span> },
                        { key: 'role', header: 'الدور', render: (user) => <span className="text-[10.5px] font-semibold text-ink">{user.role}</span> },
                        {
                          key: 'status', header: 'الحالة',
                          render: (user) => <StatusBadge value={user.status} label={USER_STATUS_LABELS[user.status] ?? user.status} />,
                        },
                        { key: 'notes', header: 'ملاحظات', render: (user) => <span className="text-[10.5px] text-muted">{user.notes || '—'}</span> },
                        {
                          key: 'action', header: 'إجراء',
                          render: (user) => (
                            <div className="flex items-center gap-1">
                              {canManageTenants && (<>
                                <button type="button" onClick={() => openUserEdit(user)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="تعديل"><Pencil className="h-3.5 w-3.5" /></button>
                                <button type="button" onClick={() => toggleUser(user, user.status !== 'ACTIVE')} className="rounded p-1.5 text-muted hover:bg-warning-soft hover:text-warning" title={user.status === 'ACTIVE' ? 'تعليق' : 'تفعيل'}>
                                  {user.status === 'ACTIVE' ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                </button>
                                <button type="button" onClick={() => deleteUser(user)} className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" title="حذف"><Trash2 className="h-3.5 w-3.5" /></button>
                              </>)}
                            </div>
                          ),
                        },
                      ]}
                    />
                  )}
                </SectionCard>
              </div>
);
