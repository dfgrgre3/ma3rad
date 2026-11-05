export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export function getConfiguredPasswordPolicy(): PasswordPolicy {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PASSWORD_POLICY };

  let serialized: string | null;
  try {
    serialized = localStorage.getItem('security_config');
  } catch (error) {
    throw new Error(`تعذر قراءة سياسة كلمة المرور: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!serialized) return { ...DEFAULT_PASSWORD_POLICY };

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`إعدادات الأمان غير صالحة: ${error instanceof Error ? error.message : String(error)}`);
  }

  const policy = value && typeof value === 'object'
    ? (value as Record<string, unknown>).passwordPolicy
    : null;
  if (!policy || typeof policy !== 'object') {
    throw new Error('إعداد سياسة كلمة المرور غير موجود أو غير صالح.');
  }
  const candidate = policy as Record<string, unknown>;
  if (
    !Number.isInteger(candidate.minLength) ||
    Number(candidate.minLength) < 8 ||
    Number(candidate.minLength) > 128 ||
    typeof candidate.requireUppercase !== 'boolean' ||
    typeof candidate.requireNumbers !== 'boolean' ||
    typeof candidate.requireSpecialChars !== 'boolean'
  ) {
    throw new Error('إعداد سياسة كلمة المرور غير صالح.');
  }

  return {
    minLength: Number(candidate.minLength),
    requireUppercase: candidate.requireUppercase,
    requireNumbers: candidate.requireNumbers,
    requireSpecialChars: candidate.requireSpecialChars,
  };
}
