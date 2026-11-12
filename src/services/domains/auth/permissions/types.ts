export interface PermissionDef {
  code: string;
  name: string;
  module: string;
  /** مجموعة/صفحة الصلاحية داخل الوحدة (للصلاحيات الدقيقة). */
  group?: string;
  /** نوع الصلاحية: صفحة، إجراء، قسم، حقل. */
  kind?: 'page' | 'action' | 'section' | 'field';
  /** الكود القديم المكافئ — يُستخدم في الترقية. */
  legacy?: string;
  /** مسار الصفحة المرتبطة. */
  route?: string;
  /** صلاحية حساسة/تدميرية. */
  destructive?: boolean;
  /** صلاحية دقيقة مولّدة من مصفوفة الصفحات. */
  granular?: boolean;
}

export type PermissionEffect = 'GRANT' | 'DENY';

