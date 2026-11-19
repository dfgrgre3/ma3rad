export const PLATFORM_ROLE_CODES_SET: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
  'OPERATIONS_ENGINEER',
  'BILLING_SPECIALIST',
  'LICENSE_MANAGER',
]);

export function sanitizeStaffUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 24);
}
