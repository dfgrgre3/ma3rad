import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { DEFAULT_SETTINGS } from '../../../database/migrations/settings';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { AuditService } from '../security/AuditService';
import type { InvoiceSectionId, InvoiceTableColumnId, SystemSettings, User } from '../../../types';
import { v4 as uuidv4 } from 'uuid';

export { bool, num, type Listener, type SettingsPatch } from './settingsUtils';
import { bool, num, subscribeSettings, notifySettings, type Listener, type SettingsPatch } from './settingsUtils';
import { validateSettings } from './settingsValidation';

/**
 * Single source of truth for `system_settings`.
 *
 * - reads are typed and defaulted
 * - writes validate, audit (old → new) and require `settings.update`
 * - subscribers (theme provider, header, sidebar) are notified on change
 */
export class SettingsService {
  private static parseInvoiceList<T extends string>(
    value: string | undefined,
    allowed: readonly T[],
    fallback: T[],
  ): T[] {
    try {
      const parsed = JSON.parse(value || '[]');
      if (!Array.isArray(parsed)) return fallback;
      const normalized = parsed.filter((item): item is T => allowed.includes(item));
      return normalized.length ? [...new Set(normalized)] : fallback;
    } catch {
      return fallback;
    }
  }

  private static db() {
    return DatabaseManager.getInstance();
  }

  public static getAllRaw(): Record<string, string> {
    const rows = SettingsService.db().query<{ key: string; value: string }>('SELECT key, value FROM system_settings');
    const map: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const r of rows) map[r.key] = r.value;
    return map;
  }

  public static getSettings(): SystemSettings {
    const map = SettingsService.getAllRaw();
    const invoiceTableColumns = SettingsService.parseInvoiceList<InvoiceTableColumnId>(
      map.invoiceTableColumns,
      ['number', 'product', 'unit', 'quantity', 'boxes', 'pieces', 'unitPrice', 'lineDiscount', 'total'],
      ['number', 'product', 'unit', 'quantity', 'unitPrice', 'total'],
    );
    const invoiceShowLineDiscount = map.invoiceShowLineDiscount === undefined ? false : bool(map.invoiceShowLineDiscount);
    const invoiceShowBoxesCount = map.invoiceShowBoxesCount === undefined ? false : bool(map.invoiceShowBoxesCount);
    if (invoiceShowLineDiscount && !invoiceTableColumns.includes('lineDiscount')) {
      invoiceTableColumns.push('lineDiscount');
    }
    if (invoiceShowBoxesCount && !invoiceTableColumns.includes('boxes') && !invoiceTableColumns.includes('pieces')) {
      invoiceTableColumns.push('boxes', 'pieces');
    }
    return {
      showroomName: map.showroomName || 'معرض السيراميك والبورسلين',
      tagline: map.tagline || '',
      phone: map.phone || '',
      phone2: map.phone2 || '',
      address: map.address || '',
      taxNumber: map.taxNumber || '',
      commercialRecord: map.commercialRecord || '',
      currency: map.currency || 'EGP',
      currencySymbol: map.currencySymbol || 'ج.م',
      defaultTaxPercentage: num(map.defaultTaxPercentage),
      isTaxInclusive: bool(map.isTaxInclusive),
      enableNegativeStock: bool(map.enableNegativeStock),
      costingMethod: map.costingMethod === 'FIFO' ? 'FIFO' : 'AVERAGE_COST',
      thermalPrinterName: map.thermalPrinterName || '',
      thermalCodepage: map.thermalCodepage ? Number(map.thermalCodepage) : 54,
      thermalPaperWidth: map.thermalPaperWidth === '58' ? '58' : '80',
      thermalTransport: map.thermalTransport === 'network' ? 'network' : 'system',
      thermalHost: map.thermalHost || '',
      thermalPort: map.thermalPort ? Number(map.thermalPort) : 9100,
      a4PrinterName: map.a4PrinterName || '',
      a5PrinterName: map.a5PrinterName || '',
      barcodePrinterName: map.barcodePrinterName || '',
      defaultInvoiceSize: (map.defaultInvoiceSize as any) || 'a4',
      defaultInvoiceTemplate: (map.defaultInvoiceTemplate as SystemSettings['defaultInvoiceTemplate']) || 'table',
      receiptHeader: map.receiptHeader || '',
      receiptFooter: map.receiptFooter || '',
      logoPath: map.logoPath || '',
      autoBackupIntervalHours: num(map.autoBackupIntervalHours, 24),

      brandName: map.brandName === 'CeramiSys ERP' ? 'سيراميسيس' : map.brandName || 'سيراميسيس',
      brandShortName: map.brandShortName === 'C' ? 'س' : map.brandShortName || 'س',
      brandLogoDataUrl: map.brandLogoDataUrl || '',
      brandPrimaryColor: map.brandPrimaryColor && map.brandPrimaryColor.toLowerCase() !== '#0284c7'
        ? map.brandPrimaryColor
        : '#34445a',
      brandAccentColor: map.brandAccentColor && map.brandAccentColor.toLowerCase() !== '#4f46e5'
        ? map.brandAccentColor
        : '#64748b',
      uiCanvasColor: map.uiCanvasColor || '#f5f6f8',
      uiSurfaceColor: map.uiSurfaceColor || '#ffffff',
      uiTextColor: map.uiTextColor || '#252b36',
      uiBorderColor: map.uiBorderColor || '#e1e5ea',
      uiSuccessColor: map.uiSuccessColor || '#39765b',
      uiDangerColor: map.uiDangerColor || '#a95050',
      uiWarningColor: map.uiWarningColor || '#8a6a35',
      uiButtonStyle: map.uiButtonStyle === 'outline' || map.uiButtonStyle === 'soft'
        ? map.uiButtonStyle
        : 'solid',
      uiCornerRadius: map.uiCornerRadius === 'compact' || map.uiCornerRadius === 'rounded'
        ? map.uiCornerRadius
        : 'standard',
      uiDensity: map.uiDensity === 'compact' ? 'compact' : 'comfortable',
      uiFontScale: map.uiFontScale === 'small' || map.uiFontScale === 'large'
        ? map.uiFontScale
        : 'standard',
      interfaceDirection: map.interfaceDirection === 'ltr' ? 'ltr' : 'rtl',
      themeMode: map.themeMode === 'dark' ? 'dark' : map.themeMode === 'system' ? 'system' : 'light',
      fontFamily: ['Cairo', 'Tajawal', 'system-ui', 'Arial', 'Tahoma'].includes(map.fontFamily)
        ? map.fontFamily as SystemSettings['fontFamily']
        : 'Cairo',
      showBrandText: bool(map.showBrandText === undefined ? '1' : map.showBrandText),
      sidebarStyle: (map.sidebarStyle as SystemSettings['sidebarStyle']) || 'default',
      navigationLayout: map.navigationLayout === 'header' ? 'header' : 'sidebar',

      lowStockAlertThresholdM2: num(map.lowStockAlertThresholdM2, 20),
      discountApprovalThresholdPercent: num(map.discountApprovalThresholdPercent, 10),
      requireApprovalForStockAdjustments: bool(map.requireApprovalForStockAdjustments),
      requireApprovalForPriceChanges: bool(map.requireApprovalForPriceChanges),
      defaultDeliveryFee: num(map.defaultDeliveryFee, 0),
      installmentGraceDays: num(map.installmentGraceDays, 3),
      sessionTimeoutMinutes: num(map.sessionTimeoutMinutes, 480),
      maxFailedLoginAttempts: num(map.maxFailedLoginAttempts, 5),
      loginPinLength: Math.min(8, Math.max(4, num(map.loginPinLength, 4))),
      switchableUserIds: (() => {
        try {
          const parsed = JSON.parse(map.switchableUserIds || '[]');
          return Array.isArray(parsed)
            ? [...new Set(parsed.filter((id): id is string => typeof id === 'string'))]
            : [];
        } catch {
          return [];
        }
      })(),
      defaultBranchId: map.defaultBranchId || 'br_main',
      sellingPriceTiersCount: num(map.sellingPriceTiersCount, 1),
      sellingPriceTierNames: (() => {
        try {
          const parsed = JSON.parse(map.sellingPriceTierNames || '[]');
          if (Array.isArray(parsed) && parsed.length) return parsed;
        } catch {
          // Invalid stored settings use the defaults below.
        }
        return ['سعر القطاعي (الأساسي)', 'سعر الجملة', 'سعر خاص / موزع', 'سعر مشاريع', 'سعر كبار العملاء'];
      })(),
      posShowCashButton: map.posShowCashButton === undefined ? true : bool(map.posShowCashButton),
      posShowCardButton: map.posShowCardButton === undefined ? true : bool(map.posShowCardButton),
      posShowBankTransferButton: map.posShowBankTransferButton === undefined ? true : bool(map.posShowBankTransferButton),
      posShowChequeButton: map.posShowChequeButton === undefined ? true : bool(map.posShowChequeButton),
      posShowCreditButton: map.posShowCreditButton === undefined ? true : bool(map.posShowCreditButton),
      posShowMixedPaymentButton: map.posShowMixedPaymentButton === undefined ? true : bool(map.posShowMixedPaymentButton),
      posShowCouponCode: map.posShowCouponCode === undefined ? true : bool(map.posShowCouponCode),
      posShowLoyaltyPoints: map.posShowLoyaltyPoints === undefined ? true : bool(map.posShowLoyaltyPoints),
      posAllowDuplicateItems: bool(map.posAllowDuplicateItems),
      posAutoSaveInvoice: bool(map.posAutoSaveInvoice),
      posMultiSelectSearch: bool(map.posMultiSelectSearch),
      invoiceTableStyle: (map.invoiceTableStyle as any) || 'minimal',
      invoiceShowItemCode: map.invoiceShowItemCode === undefined ? false : bool(map.invoiceShowItemCode),
      invoiceShowItemSpecs: map.invoiceShowItemSpecs === undefined ? false : bool(map.invoiceShowItemSpecs),
      invoiceShowBoxesCount,
      invoiceShowLineDiscount,
      invoiceShowTableSummary: map.invoiceShowTableSummary === undefined ? true : bool(map.invoiceShowTableSummary),
      invoiceTableColumns,
      invoiceShowPromotions: map.invoiceShowPromotions === undefined ? false : bool(map.invoiceShowPromotions),
      invoiceShowShipping: map.invoiceShowShipping === undefined ? false : bool(map.invoiceShowShipping),
      invoiceShowPaymentSplits: map.invoiceShowPaymentSplits === undefined ? false : bool(map.invoiceShowPaymentSplits),
      invoiceShowNotes: map.invoiceShowNotes === undefined ? false : bool(map.invoiceShowNotes),
      invoiceShowBrandLogo: map.invoiceShowBrandLogo === undefined ? true : bool(map.invoiceShowBrandLogo),
      invoiceFontFamily: (['Cairo', 'Tajawal', 'Tahoma', 'Arial'] as const).includes(map.invoiceFontFamily as any)
        ? map.invoiceFontFamily as SystemSettings['invoiceFontFamily']
        : 'Cairo',
      invoiceSectionOrder: SettingsService.parseInvoiceList<InvoiceSectionId>(
        map.invoiceSectionOrder,
        ['promotions', 'delivery', 'paymentSplits', 'notes'],
        ['promotions', 'delivery', 'paymentSplits', 'notes'],
      ),
      allowOverdraftSale: bool(map.allowOverdraftSale),
      insufficientStockAsReserved: bool(map.insufficientStockAsReserved),
      lockSaleOnReservedQty: bool(map.lockSaleOnReservedQty),
      preventPermitSaleWithoutStock: bool(map.preventPermitSaleWithoutStock),
      preventOverdraftDeliveryPermit: bool(map.preventOverdraftDeliveryPermit),
      allowAdminOverdraftSale: bool(map.allowAdminOverdraftSale),
      allowPermissionHoldersOverdraftSale: bool(map.allowPermissionHoldersOverdraftSale),
      allowLineItemDiscount: map.allowLineItemDiscount === undefined ? true : bool(map.allowLineItemDiscount),
      returnRequiresInvoiceOrCustomer: bool(map.returnRequiresInvoiceOrCustomer),
      newInvoicesUnderDelivery: bool(map.newInvoicesUnderDelivery),
      vatOnDeliveryFee: bool(map.vatOnDeliveryFee),
      cashierMaxDiscountPercentWithoutApproval: num(map.cashierMaxDiscountPercentWithoutApproval ?? map.discountApprovalThresholdPercent, 0),
      requireRemoteManagerApproval: map.requireRemoteManagerApproval === undefined ? true : bool(map.requireRemoteManagerApproval),
      posItemRemovalReasons: (() => {
        try {
          const val = map.posItemRemovalReasons;
          if (Array.isArray(val)) return val;
          if (typeof val === 'string' && val.trim().startsWith('[')) return JSON.parse(val);
        } catch {
          // Invalid stored settings use the defaults below.
        }
        return ['غلط في الإدخال', 'العميل غيّر رأيه', 'صنف تالف', 'سعر غلط'];
      })(),
    };
  }

  public static getValue(key: string): string | undefined {
    const rows = SettingsService.db().query<{ value: string }>(
      'SELECT value FROM system_settings WHERE key = ?',
      [key]
    );
    return rows[0]?.value ?? DEFAULT_SETTINGS[key];
  }

  /** Read + write without UI concerns. Writes are validated and audited. */
  public static update(patch: SettingsPatch, _actor?: User | null): SystemSettings {
    const user = AuthService.requireAuth();
    PermissionService.require(user, 'ui.settings.hub.update');
    const normalized = SettingsService.validate(patch);
    const managesLoginAccess = ['loginPinLength', 'switchableUserIds']
      .some((key) => normalized[key] !== undefined && normalized[key] !== SettingsService.getValue(key));
    if (managesLoginAccess && user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      throw new Error('إعداد رموز الدخول والتبديل بين الحسابات متاح للمدير فقط.');
    }

    if (normalized.switchableUserIds !== undefined) {
      const ids = patch.switchableUserIds;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        throw new Error('قائمة الحسابات المسموح بالتبديل إليها غير صالحة.');
      }
      const uniqueIds = [...new Set(ids)];
      const users = SettingsService.db().query<{ id: string; isActive: number }>(
        `SELECT id, is_active AS isActive FROM users`
      );
      const knownIds = new Set(users.map((entry) => entry.id));
      if (uniqueIds.some((id) => !knownIds.has(id))) {
        throw new Error('تحتوي قائمة التبديل على حساب غير موجود.');
      }
      const activeIds = new Set(users.filter((entry) => Boolean(entry.isActive)).map((entry) => entry.id));
      patch = { ...patch, switchableUserIds: uniqueIds.filter((id) => activeIds.has(id)) };
    }
    const validated = SettingsService.validate(patch);
    const db = SettingsService.db();

    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (const [key, value] of Object.entries(validated)) {
      const row = db.query<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', [key])[0];
      const oldValue = row?.value ?? DEFAULT_SETTINGS[key];
      const newValue = String(value);
      if (oldValue === newValue) continue;
      before[key] = oldValue;
      after[key] = newValue;
    }

    if (Object.keys(after).length === 0) return SettingsService.getSettings();

    db.executeTransaction((tx) => {
      if (after.costingMethod === 'FIFO' && before.costingMethod !== 'FIFO') {
        const historicalCosts = tx.query<{ count: number }>(`SELECT
          (SELECT COUNT(*) FROM inventory_cost_allocations) +
          (SELECT COUNT(*) FROM inventory_cost_layers) AS count`)[0]?.count || 0;
        if (historicalCosts > 0) {
          throw new Error('لا يمكن تفعيل FIFO تلقائيًا مع وجود سجل تكلفة سابق. احتفظ بالسجلات الحالية ونفّذ تحويلًا مرحليًا قابلًا للتدقيق.');
        }
        const openingRows = tx.query<any>(`SELECT ws.product_id AS productId,ws.warehouse_id AS warehouseId,
          ws.quantity_m2 AS quantity,p.cost_price AS unitCost FROM warehouse_stock ws
          JOIN products p ON p.id=ws.product_id WHERE ws.quantity_m2>0`);
        for (const row of openingRows) {
          tx.run(`INSERT INTO inventory_cost_layers
            (id,product_id,warehouse_id,source_type,source_id,received_at,quantity_received,quantity_remaining,unit_cost,is_estimated)
            VALUES (?,?,?,'FIFO_ACTIVATION',NULL,'0001-01-01',?,?,?,?,1)`, [
            `icl_${uuidv4().replace(/-/g, '').slice(0, 12)}`, row.productId,row.warehouseId,
            row.quantity,row.quantity,Math.max(0,Number(row.unitCost)||0),
          ]);
        }
      }
      for (const [key, value] of Object.entries(after)) {
        db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
      }
    });

    try {
      new AuditService().log({
        userId: user?.id,
        userName: user?.fullName,
        action: 'تعديل إعدادات النظام',
        module: 'SETTINGS',
        oldValues: JSON.stringify(before),
        newValues: JSON.stringify(after),
      });
    } catch {
      // never block settings save on audit failure
    }

    const next = SettingsService.getSettings();
    notifySettings(next);
    return next;
  }

  /** Validate and normalize a patch. Throws a user-facing Arabic error on bad input. */
    public static validate(patch: SettingsPatch): Record<string, string> {
    return validateSettings(patch);
  }

  // ─── Subscriptions ──────────────────────────────────────────────────────────

  public static applyCentral(patch: Record<string, string>): void {
    const db = SettingsService.db();
    const changedKeys: string[] = [];
    for (const [key, value] of Object.entries(patch)) {
      const row = db.query<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', [key])[0];
      const oldValue = row?.value ?? DEFAULT_SETTINGS[key];
      if (oldValue === value) continue;
      changedKeys.push(key);
    }
    if (changedKeys.length === 0) return;

    // كتابة ذرّية: إما تُطبَّق كل قيم المنصة المركزية أو لا شيء.
    db.executeTransaction((tx) => {
      for (const key of changedKeys) {
        tx.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, patch[key]]);
      }
    });
    try {
      new AuditService().log({
        action: 'تطبيق إعدادات من المنصة المركزية',
        module: 'SYSTEM',
        recordId: changedKeys.join(','),
        newValues: JSON.stringify(Object.fromEntries(changedKeys.map((key) => [key, patch[key]]))),
      });
    } catch { /* التسجيل لا يجب أن يعطّل التطبيق */ }
    try { notifySettings(SettingsService.getSettings()); } catch { /* ignore */ }
  }

  public static subscribe(listener: Listener): () => void {
    return subscribeSettings(listener);
  }
}
