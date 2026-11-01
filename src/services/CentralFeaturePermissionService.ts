import { CentralLicenseService } from './CentralLicenseService';

export interface CentralFeaturePermission {
  id?: string;
  section?: string;
  featureName?: string;
  pageUrl?: string;
  pageVisible?: boolean;
  featureEnabled?: boolean;
  allowViewOnly?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExportPrint?: boolean;
}

/** فئات الإجراءات التي يفهمها الفحص المركزي. */
export type CentralAction = 'view' | 'create' | 'edit' | 'delete' | 'export';

/** تحويل آخر مقطع في كود الصلاحية إلى فئة إجراء مركزية. */
const ACTION_BY_SUFFIX: Record<string, CentralAction> = {
  view: 'view', read: 'view', list: 'view', show: 'view', open: 'view',
  create: 'create', add: 'create', new: 'create', insert: 'create',
  update: 'edit', edit: 'edit', save: 'edit', post: 'edit', adjust: 'edit',
  transfer: 'edit', approve: 'edit', reject: 'edit', void: 'edit', cancel: 'edit',
  send: 'edit', process: 'edit', manage: 'edit', assign: 'edit', close: 'edit', reopen: 'edit',
  delete: 'delete', remove: 'delete', destroy: 'delete',
  export: 'export', print: 'export', download: 'export',
};

/**
 * قواعد صلاحيات الميزات المنشورة من منصة الإدارة المركزية.
 * تُطبَّق على مستوى الصفحة (مسار) ومستوى الإجراء (عرض/إنشاء/تعديل/حذف/تصدير).
 */
export class CentralFeaturePermissionService {
  /** المسار الحالي الذي يحدّده الراوتر، ليُستخدم من طبقة الصلاحيات غير المرتبطة بـ React. */
  private static currentPath = '';

  static setCurrentPath(pathname: string): void {
    CentralFeaturePermissionService.currentPath = String(pathname || '').split('?')[0];
  }

  static getCurrentPath(): string {
    return CentralFeaturePermissionService.currentPath;
  }

  static list(): CentralFeaturePermission[] {
    return CentralLicenseService.getFeaturePermissions() as CentralFeaturePermission[];
  }

  private static normalize(pathname: string): string {
    return String(pathname || '').split('?')[0].toLowerCase().replace(/\/$/, '');
  }

  static forPath(pathname: string): CentralFeaturePermission | undefined {
    const norm = CentralFeaturePermissionService.normalize(pathname);
    if (!norm) return undefined;
    // يفضّل أطول بادئة مطابقة حتى لا تتجاوز قاعدة الصفحة الأصلية صفحاتها الفرعية.
    let best: CentralFeaturePermission | undefined;
    let bestLen = -1;
    for (const f of CentralFeaturePermissionService.list()) {
      const url = CentralFeaturePermissionService.normalize(String(f.pageUrl || ''));
      if (!url) continue;
      if (norm === url || norm.startsWith(url + '/')) {
        if (url.length > bestLen) {
          best = f;
          bestLen = url.length;
        }
      }
    }
    return best;
  }

  static isPageVisible(pathname: string): boolean {
    const norm = CentralFeaturePermissionService.normalize(pathname);
    if (!norm) return true;

    // القوائم المخفية من الإدارة المركزية تخفي الصفحة وكل ما تحتها.
    const hidden = CentralLicenseService.getHiddenMenus();
    const hiddenMatch = hidden.some((entry) => {
      const h = CentralFeaturePermissionService.normalize(String(entry));
      return !!h && (norm === h || norm.startsWith(h + '/'));
    });
    if (hiddenMatch) return false;

    const fp = CentralFeaturePermissionService.forPath(pathname);
    if (!fp) return true; // لا قاعدة مركزية => مظهرة
    return fp.pageVisible !== false && fp.featureEnabled !== false;
  }

  static canView(pathname: string): boolean {
    return CentralFeaturePermissionService.isPageVisible(pathname);
  }

  static canEdit(pathname: string): boolean {
    return CentralFeaturePermissionService.isActionAllowed(pathname, 'edit');
  }

  static canDelete(pathname: string): boolean {
    return CentralFeaturePermissionService.isActionAllowed(pathname, 'delete');
  }

  static canExportPrint(pathname: string): boolean {
    return CentralFeaturePermissionService.isActionAllowed(pathname, 'export');
  }

  /** فئة الإجراء المقابلة لكود صلاحية مثل `products.delete`. */
  static actionOf(permissionCode: string): CentralAction {
    const suffix = String(permissionCode || '').split('.').pop()?.toLowerCase() || '';
    return ACTION_BY_SUFFIX[suffix] || 'edit';
  }

  /** هل يسمح التكوين المركزي بهذا الإجراء على المسار المعطى؟ */
  static isActionAllowed(pathname: string, action: CentralAction): boolean {
    if (!CentralFeaturePermissionService.isPageVisible(pathname)) return false;
    const fp = CentralFeaturePermissionService.forPath(pathname);
    if (!fp) return true;
    if (action === 'view') return true;
    if (fp.allowViewOnly) return false;
    if (action === 'delete') return fp.canDelete !== false;
    if (action === 'export') return fp.canExportPrint !== false;
    return fp.canEdit !== false;
  }

  /** قائمة أكواد الصلاحيات المعطّلة مركزيًا لهذا الترخيص. */
  static disabledPermissions(): string[] {
    return CentralLicenseService.getDisabledPermissions();
  }

  /** هل عطّلت منصة الإدارة هذا الكود صراحةً؟ */
  static isPermissionDisabled(permissionCode: string): boolean {
    const code = String(permissionCode || '');
    if (!code || code === '*') return false;
    return CentralFeaturePermissionService.disabledPermissions().includes(code);
  }

  /**
   * فحص كود صلاحية مقابل التكوين المركزي للمسار الحالي (أو مسار صريح).
   * يُستدعى من طبقة الصلاحيات المحلية ليعكس كل زر يعتمد عليها.
   */
  static allowsPermission(permissionCode: string, pathname?: string): boolean {
    const code = String(permissionCode || '');
    // التعطيل الفردي من الإدارة المركزية يتقدّم على كل شيء (لكل زر/إجراء).
    if (CentralFeaturePermissionService.isPermissionDisabled(code)) return false;
    // أكواد عامة/بدون مقطع إجراء لا تخضع لقيد مركزي.
    if (!code || code === '*' || !code.includes('.')) return true;
    const path = pathname ?? CentralFeaturePermissionService.getCurrentPath();
    return CentralFeaturePermissionService.isActionAllowed(
      path,
      CentralFeaturePermissionService.actionOf(code)
    );
  }
}
