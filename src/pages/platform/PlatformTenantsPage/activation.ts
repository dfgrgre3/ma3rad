import type {
  PlatformActivationDetails,
  PlatformTenantProfile,
} from '../../../services/domains/platform/platformTypes';
import { formatDate } from '../components/PlatformUI';

export const buildActivation = (profile: PlatformTenantProfile, temporaryPassword: string | null): PlatformActivationDetails => {
  const license = profile.licenses.find((item) => item.status === 'ACTIVE' || item.status === 'ISSUED') ?? profile.licenses[0] ?? null;
  return {
    tenant: profile.tenant,
    account: profile.account,
    username: profile.account?.username ?? '',
    temporaryPassword,
    activationCode: profile.account?.activationCode ?? '',
    planName: profile.plan?.name ?? license?.planName ?? null,
    licenseKey: license?.licenseKey ?? null,
    licenseExpiresAt: license?.expiresAt ?? profile.tenant.subscriptionExpiresAt,
    modules: license?.modules?.length ? license.modules : profile.plan?.includedModules ?? [],
    loginUrl: typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login',
    generatedAt: new Date().toISOString(),
  };
};

export const activationText = (details: PlatformActivationDetails): string => [
  `بيانات تفعيل منصة ${details.tenant.name}`,
  `رقم العميل: ${details.tenant.code}`,
  `Tenant ID: ${details.tenant.id}`,
  `اسم المستخدم: ${details.username}`,
  details.temporaryPassword ? `كلمة المرور المؤقتة: ${details.temporaryPassword}` : null,
  `كود التفعيل: ${details.activationCode}`,
  details.planName ? `الباقة: ${details.planName}` : null,
  details.licenseKey ? `مفتاح الترخيص: ${details.licenseKey}` : null,
  details.licenseExpiresAt ? `انتهاء الترخيص: ${formatDate(details.licenseExpiresAt)}` : null,
  details.modules.length ? `الوحدات: ${details.modules.join(', ')}` : null,
  `رابط الدخول: ${details.loginUrl}`,
].filter(Boolean).join('\n');
