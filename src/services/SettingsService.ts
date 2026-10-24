import { DatabaseManager } from '../database/db';
import { DEFAULT_SETTINGS } from '../database/migrations';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';
import type { SystemSettings, User } from '../types';
import { v4 as uuidv4 } from 'uuid';

export type SettingsPatch = Partial<Record<string, string | number | boolean | null | undefined>>;

type Listener = (settings: SystemSettings) => void;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function bool(value: unknown): boolean {
  return value === true || value === '1' || value === 1 || value === 'true';
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Single source of truth for `system_settings`.
 *
 * - reads are typed and defaulted
 * - writes validate, audit (old → new) and require `settings.update`
 * - subscribers (theme provider, header, sidebar) are notified on change
 */
export class SettingsService {
  private static listeners = new Set<Listener>();

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
      receiptHeader: map.receiptHeader || '',
      receiptFooter: map.receiptFooter || '',
      logoPath: map.logoPath || '',
      autoBackupIntervalHours: num(map.autoBackupIntervalHours, 24),

      brandName: map.brandName || 'CeramiSys ERP',
      brandShortName: map.brandShortName || 'C',
      brandLogoDataUrl: map.brandLogoDataUrl || '',
      brandPrimaryColor: map.brandPrimaryColor || '#0284c7',
      brandAccentColor: map.brandAccentColor || '#4f46e5',
      themeMode: map.themeMode === 'dark' ? 'dark' : map.themeMode === 'system' ? 'system' : 'light',
      fontFamily: map.fontFamily || 'Cairo',
      showBrandText: bool(map.showBrandText === undefined ? '1' : map.showBrandText),
      sidebarStyle: (map.sidebarStyle as SystemSettings['sidebarStyle']) || 'default',

      lowStockAlertThresholdM2: num(map.lowStockAlertThresholdM2, 20),
      discountApprovalThresholdPercent: num(map.discountApprovalThresholdPercent, 10),
      requireApprovalForStockAdjustments: bool(map.requireApprovalForStockAdjustments),
      requireApprovalForPriceChanges: bool(map.requireApprovalForPriceChanges),
      defaultDeliveryFee: num(map.defaultDeliveryFee, 0),
      installmentGraceDays: num(map.installmentGraceDays, 3),
      sessionTimeoutMinutes: num(map.sessionTimeoutMinutes, 480),
      maxFailedLoginAttempts: num(map.maxFailedLoginAttempts, 5),
      defaultBranchId: map.defaultBranchId || 'br_main',
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
  public static update(patch: SettingsPatch, actor?: User | null): SystemSettings {
    const current = AuthService.getCurrentUser();
    const user = actor ?? current;
    if (user) {
      PermissionService.require(user, 'settings.update');
    } else {
      PermissionService.require(AuthService.requireAuth(), 'settings.update');
    }

    const normalized = SettingsService.validate(patch);
    const db = SettingsService.db();

    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (const [key, value] of Object.entries(normalized)) {
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
        tx.run('DELETE FROM inventory_cost_allocations');
        tx.run('DELETE FROM inventory_cost_layers');
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
    SettingsService.emit(next);
    return next;
  }

  /** Validate and normalize a patch. Throws a user-facing Arabic error on bad input. */
  public static validate(patch: SettingsPatch): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(patch)) {
      if (raw === undefined) continue;
      if (raw === null) {
        out[key] = '';
        continue;
      }
      if (typeof raw === 'boolean') {
        out[key] = raw ? '1' : '0';
        continue;
      }
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) throw new Error(`قيمة غير صالحة للحقل ${key}.`);
        out[key] = String(raw);
        continue;
      }
      const value = String(raw).trim();
      switch (key) {
        case 'brandPrimaryColor':
        case 'brandAccentColor':
          if (!HEX_COLOR.test(value)) throw new Error('لون الهوية يجب أن يكون بصيغة HEX مثل #0284c7.');
          out[key] = value;
          break;
        case 'themeMode':
          if (!['light', 'dark', 'system'].includes(value)) throw new Error('وضع العرض غير صالح.');
          out[key] = value;
          break;
        case 'sidebarStyle':
          if (!['default', 'compact', 'hidden'].includes(value)) throw new Error('نمط القائمة غير صالح.');
          out[key] = value;
          break;
        case 'costingMethod':
          if (!['AVERAGE_COST', 'FIFO'].includes(value)) throw new Error('Invalid inventory costing method.');
          out[key] = value;
          break;
        case 'showroomName':
          if (value.length < 2) throw new Error('اسم المعرض مطلوب (حرفان على الأقل).');
          out[key] = value;
          break;
        case 'currencySymbol':
        case 'currency':
          if (!value) throw new Error('العملة ورمزها مطلوبان.');
          out[key] = value;
          break;
        default:
          out[key] = value;
      }
    }
    return out;
  }

  // ─── Subscriptions ──────────────────────────────────────────────────────────

  public static subscribe(listener: Listener): () => void {
    SettingsService.listeners.add(listener);
    return () => SettingsService.listeners.delete(listener);
  }

  private static emit(settings: SystemSettings): void {
    for (const listener of SettingsService.listeners) {
      try {
        listener(settings);
      } catch (error) {
        console.error('Settings listener failed', error);
      }
    }
  }
}
