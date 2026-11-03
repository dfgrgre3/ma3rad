export type ConflictPolicy = 'DETECT' | 'SOURCE_WINS' | 'MANUAL' | 'APPEND_ONLY' | 'TOMBSTONE';
export type FieldDiffStatus = 'SAME' | 'LOCAL_ONLY' | 'REMOTE_ONLY' | 'CONFLICT';
export type MergeStrategy = 'FIELD_MERGE' | 'REMOTE_WINS' | 'LOCAL_WINS';

export interface FieldDiff {
  field: string;
  label: string;
  localValue: unknown;
  remoteValue: unknown;
  status: FieldDiffStatus;
}

export interface AutoResolution {
  strategy: MergeStrategy;
  reason: string;
  mergedPayload?: Record<string, unknown>;
}

/** Arabic display labels for entity field names */
const FIELD_LABELS: Record<string, string> = {
  name: 'الاسم',
  phone: 'الهاتف',
  phone2: 'الهاتف الثاني',
  email: 'البريد الإلكتروني',
  address: 'العنوان',
  city: 'المدينة',
  notes: 'الملاحظات',
  code: 'الكود',
  credit_limit: 'حد الائتمان',
  payment_terms_days: 'أيام السداد',
  customer_type: 'نوع العميل',
  national_id: 'الرقم القومي',
  company_name: 'اسم الشركة',
  tax_number: 'الرقم الضريبي',
  commercial_record: 'السجل التجاري',
  is_active: 'نشط',
  selling_price_m2: 'سعر البيع م²',
  selling_price_box: 'سعر البيع كرتونة',
  wholesale_price_m2: 'سعر الجملة م²',
  min_selling_price_m2: 'أدنى سعر م²',
  cost_price: 'سعر التكلفة',
  min_stock_level: 'الحد الأدنى للمخزون',
  max_stock_level: 'الحد الأقصى للمخزون',
  sku: 'كود المنتج',
  barcode: 'الباركود',
  category_id: 'التصنيف',
  brand_id: 'الماركة',
  grade: 'الدرجة',
  size: 'المقاس',
  color: 'اللون',
  finish: 'التشطيب',
  surface_location: 'موضع التطبيق',
  thickness: 'السماكة',
  tone: 'درجة اللون',
  parent_id: 'التصنيف الأب',
  country: 'البلد',
  description: 'الوصف',
  product_type: 'نوع المنتج',
  base_unit: 'وحدة الأساس',
  sell_unit: 'وحدة البيع',
  pieces_per_box: 'قطع/كرتونة',
  meters_per_box: 'م²/كرتونة',
  weight_per_box: 'وزن/كرتونة',
  custom_unit: 'وحدة مخصصة',
  updated_at: 'آخر تعديل',
  created_at: 'تاريخ الإنشاء',
};

/**
 * Fields that are safe to auto-resolve using last-write-wins semantics.
 * These are non-financial, non-critical fields.
 */
const LAST_WRITE_WINS_FIELDS = new Set([
  'notes', 'address', 'city', 'phone2', 'email', 'description',
]);

/** Fields that are purely internal / not shown in diff */
const SKIP_FIELDS = new Set(['id', 'company_id', 'rowid', 'tenant_id']);

/** Entity types where the incoming (remote) source always wins */
const SOURCE_WINS_TYPES = new Set(['price_list', 'brand', 'category', 'settings']);

/** Entity types that are append-only (never conflict) */
const APPEND_ONLY_TYPES = new Set([
  'sales_invoice', 'sales_return', 'purchase_invoice', 'purchase_return',
  'payment', 'inventory_transaction', 'stock_transfer', 'accounting_entry',
]);

export class ConflictResolver {
  policyFor(entityType: string): ConflictPolicy {
    if (SOURCE_WINS_TYPES.has(entityType)) return 'SOURCE_WINS';
    if (APPEND_ONLY_TYPES.has(entityType)) return 'APPEND_ONLY';
    const map: Record<string, ConflictPolicy> = {
      product: 'DETECT',
      customer: 'DETECT',
      supplier: 'DETECT',
    };
    return map[entityType] ?? 'DETECT';
  }

  detectConcurrentEdit(localVersion: number, incomingVersion: number): boolean {
    return localVersion !== incomingVersion && incomingVersion > 0;
  }

  resolveVersion(local: number, incoming: number): number {
    return Math.max(local, incoming) + 1;
  }

  /**
   * Compare two raw conflict payloads field-by-field.
   * Returns an ordered list of FieldDiff — conflicts first, then differences, then identical.
   */
  compareFields(
    localPayload: string | Record<string, unknown> | null,
    remotePayload: string | Record<string, unknown>,
    _entityType?: string,
  ): FieldDiff[] {
    const local = this.safeExtractRow(localPayload);
    const remote = this.safeExtractRow(remotePayload);

    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    const diffs: FieldDiff[] = [];

    for (const field of allKeys) {
      if (SKIP_FIELDS.has(field)) continue;
      const localVal = field in local ? local[field] : undefined;
      const remoteVal = field in remote ? remote[field] : undefined;

      let status: FieldDiffStatus;
      if (!(field in remote)) status = 'LOCAL_ONLY';
      else if (!(field in local)) status = 'REMOTE_ONLY';
      else if (this.normalizeValue(localVal) === this.normalizeValue(remoteVal)) status = 'SAME';
      else status = 'CONFLICT';

      diffs.push({
        field,
        label: FIELD_LABELS[field] ?? field,
        localValue: localVal,
        remoteValue: remoteVal,
        status,
      });
    }

    const order: Record<FieldDiffStatus, number> = {
      CONFLICT: 0,
      REMOTE_ONLY: 1,
      LOCAL_ONLY: 2,
      SAME: 3,
    };
    return diffs.sort((a, b) => order[a.status] - order[b.status]);
  }

  /**
   * Attempt automatic resolution without user intervention.
   * Returns null if manual review is required.
   */
  autoResolve(
    entityType: string,
    localPayload: string | Record<string, unknown> | null,
    remotePayload: string | Record<string, unknown>,
  ): AutoResolution | null {
    const policy = this.policyFor(entityType);

    if (policy === 'SOURCE_WINS') {
      return {
        strategy: 'REMOTE_WINS',
        reason: 'نوع البيانات هذا دائماً يُحدَّث من الإدارة الرئيسية',
      };
    }

    if (policy === 'APPEND_ONLY') {
      return {
        strategy: 'REMOTE_WINS',
        reason: 'سجل إلحاقي — يُقبل الوارد تلقائياً بدون تعارض',
      };
    }

    if (!localPayload) {
      return {
        strategy: 'REMOTE_WINS',
        reason: 'لا يوجد سجل محلي — يُقبل الوارد تلقائياً',
      };
    }

    const diffs = this.compareFields(localPayload, remotePayload, entityType);
    const conflictFields = diffs.filter((d) => d.status === 'CONFLICT');

    if (conflictFields.length === 0) {
      return {
        strategy: 'REMOTE_WINS',
        reason: 'لا توجد فروق حقيقية — النسختان متطابقتان في المحتوى',
      };
    }

    // Only safe last-write-wins fields conflict → apply field merge
    const unsafeConflicts = conflictFields.filter((d) => !LAST_WRITE_WINS_FIELDS.has(d.field));
    if (unsafeConflicts.length === 0) {
      const merged = this.buildMergedPayload(localPayload, remotePayload, diffs, 'FIELD_MERGE');
      return {
        strategy: 'FIELD_MERGE',
        reason: `دمج ذكي — الفروق في حقول آمنة: ${conflictFields.map((d) => d.label).join('، ')}`,
        mergedPayload: merged,
      };
    }

    // Unsafe fields conflict — manual review required
    return null;
  }

  /**
   * Build a merged payload row from local and remote, according to strategy.
   */
  buildMergedPayload(
    localPayload: string | Record<string, unknown> | null,
    remotePayload: string | Record<string, unknown>,
    diffs: FieldDiff[],
    strategy: MergeStrategy,
  ): Record<string, unknown> {
    const local = this.safeExtractRow(localPayload);
    const remote = this.safeExtractRow(remotePayload);

    if (strategy === 'REMOTE_WINS') return { ...remote };
    if (strategy === 'LOCAL_WINS') return { ...local };

    // FIELD_MERGE: start from local, override with remote for conflict / remote-only fields
    const merged: Record<string, unknown> = { ...local };
    for (const diff of diffs) {
      if (diff.status === 'CONFLICT' || diff.status === 'REMOTE_ONLY') {
        merged[diff.field] = diff.remoteValue;
      }
    }
    return merged;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private safeExtractRow(payload: string | Record<string, unknown> | null): Record<string, unknown> {
    if (!payload) return {};
    if (typeof payload === 'object') return this.extractRow(payload) ?? {};
    try {
      const parsed = JSON.parse(payload);
      return this.extractRow(parsed) ?? {};
    } catch {
      return {};
    }
  }

  private extractRow(parsed: unknown): Record<string, unknown> | null {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    // Payload may be wrapped in { row: {...} }
    if (obj['row'] && typeof obj['row'] === 'object' && !Array.isArray(obj['row'])) {
      return obj['row'] as Record<string, unknown>;
    }
    return obj;
  }

  private normalizeValue(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'boolean') return val ? '1' : '0';
    return String(val).trim();
  }
}
