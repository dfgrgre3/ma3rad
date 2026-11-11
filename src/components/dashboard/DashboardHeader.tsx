import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Building2, CalendarDays, Clock3, RefreshCw } from 'lucide-react';
import type { User } from '../../types';
import { BranchAccessService } from '../../services/domains/auth/BranchAccessService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';

interface DashboardHeaderProps {
  today: string;
  currentUser: User | null;
  lastSyncedAt: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  today,
  currentUser,
  lastSyncedAt,
  isRefreshing,
  onRefresh,
}) => {
  const branchAccess = useMemo(() => new BranchAccessService(), []);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [branchError, setBranchError] = useState<string | null>(null);
  const canViewBranches = currentUser
    ? PermissionService.can(currentUser, 'ui.branches.branches.view')
    : false;

  const activeBranchId = useMemo(() => {
    if (!currentUser || !canViewBranches || branches.length === 0) return '';
    try {
      return branchAccess.getCurrentBranchId(currentUser);
    } catch {
      return '';
    }
  }, [branchAccess, branches, canViewBranches, currentUser]);

  useEffect(() => {
    if (!currentUser || !canViewBranches) {
      setBranches([]);
      setBranchError(null);
      return;
    }

    try {
      setBranches(branchAccess.getSelectableBranches(currentUser));
      setBranchError(null);
    } catch (error) {
      setBranches([]);
      setBranchError(error instanceof Error ? error.message : 'تعذر تحديد الفروع المتاحة');
    }
  }, [branchAccess, canViewBranches, currentUser]);

  const switchBranch = (branchId: string) => {
    if (!currentUser || !branchId || branchId === activeBranchId) return;
    try {
      branchAccess.setCurrentBranchId(branchId, currentUser);
      window.location.reload();
    } catch (error) {
      setBranchError(error instanceof Error ? error.message : 'تعذر التبديل إلى الفرع المحدد');
    }
  };

  const activeBranchName = branches.find((branch) => branch.id === activeBranchId)?.name;
  const lastSyncedText = lastSyncedAt
    ? new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(lastSyncedAt)
    : 'لم تتم المزامنة بعد';

  return (
    <>
      <PageHeader
        className="px-4 pt-3"
        icon={<Activity className="h-5 w-5" />}
        eyebrow="سيراميسيس / مركز المتابعة"
        title="لوحة المعلومات"
        description={<>ملخص حركة المعرض والمؤشرات الرئيسية <span className="mx-1">·</span>{today}</>}
      />

      <section
        aria-label="عناصر التحكم في لوحة المعلومات"
        className="grid min-w-0 grid-cols-1 gap-2 rounded-[2px] border border-[#d9d9d9] bg-white p-2.5 dark:border-[#3d3d3d] dark:bg-[#2b2b2b] sm:grid-cols-2 sm:items-center lg:grid-cols-[minmax(12rem,1fr)_minmax(15rem,1.2fr)_minmax(10rem,auto)_auto]"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-[#0078d4]" aria-hidden="true" />
          <label htmlFor="dashboard-active-branch" className="shrink-0 text-[11px] font-bold text-[#4d4d4d] dark:text-[#c8c8c8]">الفرع</label>
          {canViewBranches && branches.length > 1 ? (
            <select
              id="dashboard-active-branch"
              value={activeBranchId}
              onChange={(event) => switchBranch(event.target.value)}
              className="min-h-8 min-w-0 flex-1 rounded-[2px] border border-[#c8c8c8] bg-white px-2 text-[12px] font-semibold text-[#1b1b1b] outline-none focus-visible:border-[#0078d4] focus-visible:ring-2 focus-visible:ring-[#0078d4]/25 dark:border-[#565656] dark:bg-[#252525] dark:text-[#f0f0f0]"
              aria-label="الفرع النشط"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          ) : (
            <span className="min-w-0 truncate text-[12px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">
              {activeBranchName || (canViewBranches ? 'جارٍ تحديد الفرع...' : 'وفق نطاق صلاحيات حسابك')}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-start gap-2 text-[11px]" title="تختلف الفترة المعروضة حسب نوع المؤشر؛ لا يوجد نطاق زمني موحد لكل بيانات الملخص.">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#0078d4]" aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-bold text-[#4d4d4d] dark:text-[#c8c8c8]">الفترات المعروضة</div>
            <div className="truncate text-[#1b1b1b] dark:text-[#f0f0f0]">اليوم · الشهر الجاري · آخر 7 أيام</div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-[11px]" role="status" aria-live="polite">
          <Clock3 className={`h-4 w-4 shrink-0 ${isRefreshing ? 'animate-pulse text-[#0078d4]' : 'text-[#767676]'}`} aria-hidden="true" />
          <span className="min-w-0">
            <span className="font-bold text-[#4d4d4d] dark:text-[#c8c8c8]">مزامنة الملخص: </span>
            <span className="text-[#1b1b1b] dark:text-[#f0f0f0]">{isRefreshing ? 'جارٍ التحديث...' : lastSyncedText}</span>
          </span>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          leadingIcon={<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />}
          aria-label="تحديث بيانات لوحة المعلومات"
        >
          تحديث
        </Button>

        {branchError && (
          <p className="sm:col-span-2 lg:col-span-4 text-[11px] font-semibold text-rose-700 dark:text-rose-300" role="alert">
            تعذر تحديث الفرع: {branchError}
          </p>
        )}
      </section>
    </>
  );
};
