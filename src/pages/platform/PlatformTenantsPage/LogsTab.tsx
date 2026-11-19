import React from 'react';
import { Activity, Pencil, ShieldCheck } from 'lucide-react';
import type { PlatformTenantProfile } from '../../../services/domains/platform/platformTypes';
import { LogList, SectionCard } from './shared';

interface LogsTabProps {
  profile: PlatformTenantProfile;
}

export const LogsTab: React.FC<LogsTabProps> = ({ profile }) => (
              <div className="space-y-3">
                <SectionCard title="سجل التغييرات الإدارية" subtitle={`${profile.changeLog.length} تغيير على بيانات العميل`} icon={<Pencil className="h-4 w-4" />}>
                  <LogList entries={profile.changeLog} empty="لا توجد تغييرات إدارية مسجلة." />
                </SectionCard>
                <SectionCard title="سجل التفعيلات" subtitle={`${profile.activationLog.length} عملية تفعيل`} icon={<ShieldCheck className="h-4 w-4" />}>
                  <LogList entries={profile.activationLog} empty="لا توجد عمليات تفعيل مسجلة." />
                </SectionCard>
                <SectionCard title="كل نشاط العميل" subtitle="سجل موحد لكل العمليات المرتبطة بالعميل" icon={<Activity className="h-4 w-4" />}>
                  <LogList entries={profile.activityLog} empty="لا يوجد نشاط مسجل بعد." />
                </SectionCard>
              </div>
);
