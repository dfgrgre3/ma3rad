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
  /**
   * حساسية البيانات التي تكشفها الصلاحية:
   * NONE | COST (تكلفة شراء/تقييم) | PROFIT (ربح/هامش) | COST_PROFIT | AMOUNT.
   * عند COST/PROFIT يتطلب AuthorizationService كود الرؤية المقابل
   * (data.cost.view / data.profit.view) إضافةً إلى الصلاحية نفسها.
   */
  sensitivity?: 'NONE' | 'COST' | 'PROFIT' | 'COST_PROFIT' | 'AMOUNT';
}

export type PermissionEffect = 'GRANT' | 'DENY';

