import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { ElectronicInvoice, CreateElectronicInvoiceDTO, ElectronicInvoiceStatus, User } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';

type InvoiceRow = {
  id: string;
  customer_id: string;
  total_amount: number;
  tax_amount: number;
  invoice_status: string;
  branch_id: string | null;
  company_id: string | null;
  warehouse_branch_id: string | null;
  company_tax_number: string | null;
  customer_tax_number: string | null;
};

type ScopedInvoice = ElectronicInvoice & { branchId?: string | null; companyId?: string | null };

export interface ElectronicInvoiceProvider {
  submit(input: { internalId: string; payload: unknown }): Promise<{
    submissionId?: string;
    acceptedDocuments?: Array<{ internalId: string; uuid?: string }>;
    rejectedDocuments?: Array<{ internalId: string; error?: unknown }>;
    response: unknown;
  }>;
  getStatus(reference: string, internalId: string, isSubmission: boolean): Promise<{ status: 'PROCESSING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'; uuid?: string; reason?: string; response: unknown }>;
  cancel(reference: string, reason: string): Promise<{ response: unknown }>;
}

export interface EtaInvoiceDocumentBuilder {
  build(input: { invoice: Record<string, any>; customer: Record<string, any>; items: Record<string, any>[] }): Promise<unknown> | unknown;
}

/** ETA v1 API transport. Signing and legal-document mapping are deliberately injected separately. */
export class EtaElectronicInvoiceProvider implements ElectronicInvoiceProvider {
  constructor(
    private readonly config: { baseUrl: string; clientId: string; clientSecret: string; taxpayerId: string },
    private readonly signDocument: (document: unknown) => Promise<unknown>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async token(): Promise<string> {
    const form = new URLSearchParams({ grant_type: 'client_credentials' });
    const credentials = btoa(`${this.config.clientId}:${this.config.clientSecret}`);
    const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, '')}/connect/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!response.ok) throw new Error(`ETA authentication failed (${response.status}).`);
    const body = await response.json() as { access_token?: string };
    if (!body.access_token) throw new Error('ETA authentication response did not contain an access token.');
    return body.access_token;
  }

  private async request(path: string, init: RequestInit = {}): Promise<{ response: Response; body: any }> {
    const token = await this.token();
    const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(this.config.taxpayerId ? { 'onbehalfof': this.config.taxpayerId } : {}),
        ...init.headers,
      },
    });
    const raw = await response.text();
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    if (!response.ok) {
      const error = new Error(`ETA request failed (${response.status}).`);
      Object.assign(error, { status: response.status, retryAfter: response.headers.get('Retry-After'), response: body });
      throw error;
    }
    return { response, body };
  }

  public async submit(input: { internalId: string; payload: unknown }) {
    const document = input.payload && typeof input.payload === 'object'
      ? { ...(input.payload as Record<string, unknown>), internalId: input.internalId }
      : input.payload;
    const signedDocument = await this.signDocument(document);
    const { body } = await this.request('/api/v1.0/documentsubmissions/', {
      method: 'POST',
      body: JSON.stringify({ documents: [signedDocument] }),
    });
    return {
      submissionId: body?.submissionUUID || body?.submissionId,
      acceptedDocuments: Array.isArray(body?.acceptedDocuments) ? body.acceptedDocuments : [],
      rejectedDocuments: Array.isArray(body?.rejectedDocuments) ? body.rejectedDocuments : [],
      response: body,
    };
  }

  public async getStatus(reference: string, internalId: string, isSubmission: boolean) {
    const path = isSubmission
      ? `/api/v1.0/documentsubmissions/${encodeURIComponent(reference)}?pageNo=1&pageSize=100`
      : `/api/v1.0/documents/${encodeURIComponent(reference)}/raw`;
    const { body } = await this.request(path);
    const document = isSubmission
      ? body?.documentSummary?.find((item: any) => item.internalId === internalId)
      : body;
    const raw = String(document?.status || body?.overallStatus || '').toUpperCase();
    const status = raw === 'VALID' || raw === 'ACCEPTED' ? 'ACCEPTED'
      : raw === 'INVALID' || raw === 'REJECTED' ? 'REJECTED'
        : raw === 'CANCELLED' || raw === 'CANCELED' ? 'CANCELLED' : 'PROCESSING';
    return { status, uuid: document?.uuid, reason: document?.statusReason || document?.error, response: body } as const;
  }

  public async cancel(reference: string, reason: string) {
    const { body } = await this.request(`/api/v1.0/documents/state/${encodeURIComponent(reference)}/state`, {
      method: 'PUT', body: JSON.stringify({ status: 'cancelled', reason }),
    });
    return { response: body };
  }
}

export class ElectronicInvoiceService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  constructor(
    private readonly providerFactory?: () => ElectronicInvoiceProvider,
    private readonly documentBuilder?: EtaInvoiceDocumentBuilder,
  ) {}

  private scope(user: User) {
    return {
      branch: this.branchAccess.sqlScope('si.branch_id', 'w.branch_id', user),
      company: this.branchAccess.companyScope('si.company_id', user),
    };
  }

  private requireProvider(): ElectronicInvoiceProvider {
    const provider = this.providerFactory?.();
    if (!provider) throw new Error('لم يُضبط موفر ETA أو الموقّع الرقمي. أضف بيانات اعتماد الجهة الضريبية وشهادة توقيع معتمدة قبل الإرسال.');
    return provider;
  }

  private invoiceSelect(): string {
    return `SELECT si.*, si.branch_id AS branch_id, si.company_id AS company_id,
      w.branch_id AS warehouse_branch_id,
      c.tax_number AS customer_tax_number,
      co.tax_number AS company_tax_number
      FROM sales_invoices si
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      LEFT JOIN customers c ON c.id = si.customer_id
      LEFT JOIN companies co ON co.id = si.company_id`;
  }

  public getAllElectronicInvoices(status?: ElectronicInvoiceStatus): ElectronicInvoice[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.view');
    const { branch, company } = this.scope(actor);
    const conditions = [`${branch.clause}`, `${company.clause}`];
    const params: any[] = [...branch.params, ...company.params];
    if (status) { conditions.push('ei.status = ?'); params.push(status); }
    return this.db.query<ElectronicInvoice>(`
      SELECT ei.*, c.name as customerName, u.full_name as createdByName
      FROM electronic_invoices ei
      JOIN sales_invoices si ON si.id = ei.sales_invoice_id
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      JOIN customers c ON ei.customer_id = c.id
      LEFT JOIN users u ON ei.created_by = u.id
      WHERE ${conditions.join(' AND ')} ORDER BY ei.created_at DESC
    `, params);
  }

  public getElectronicInvoiceById(id: string): ElectronicInvoice | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.view');
    return this.queryElectronicInvoiceById(id, actor);
  }

  private queryElectronicInvoiceById(id: string, actor: User): ScopedInvoice | null {
    const { branch, company } = this.scope(actor);
    const rows = this.db.query<ScopedInvoice>(`
      SELECT ei.*, si.branch_id AS branchId, si.company_id AS companyId,
        c.name as customerName, u.full_name as createdByName
      FROM electronic_invoices ei
      JOIN sales_invoices si ON si.id = ei.sales_invoice_id
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      JOIN customers c ON ei.customer_id = c.id
      LEFT JOIN users u ON ei.created_by = u.id
      WHERE ei.id = ? AND ${branch.clause} AND ${company.clause}
    `, [id, ...branch.params, ...company.params]);
    return rows[0] || null;
  }

  public getElectronicInvoiceBySalesInvoice(salesInvoiceId: string): ElectronicInvoice | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.view');
    const { branch, company } = this.scope(actor);
    return this.db.query<ElectronicInvoice>(`
      SELECT ei.* FROM electronic_invoices ei
      JOIN sales_invoices si ON si.id = ei.sales_invoice_id
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      WHERE ei.sales_invoice_id = ? AND ${branch.clause} AND ${company.clause}
    `, [salesInvoiceId, ...branch.params, ...company.params])[0] || null;
  }

  public createElectronicInvoice(dto: CreateElectronicInvoiceDTO): ElectronicInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.create');
    const { branch, company } = this.scope(actor);
    const salesInvoice = this.db.query<InvoiceRow>(`${this.invoiceSelect()}
      WHERE si.id = ? AND ${branch.clause} AND ${company.clause}`,
    [dto.salesInvoiceId, ...branch.params, ...company.params])[0];
    if (!salesInvoice) throw new Error('الفاتورة التجارية غير موجودة أو خارج نطاق الفرع أو الشركة.');
    if (salesInvoice.invoice_status !== 'COMPLETED') throw new Error('لا يمكن إنشاء فاتورة إلكترونية إلا لفاتورة تجارية مكتملة وغير ملغاة.');
    if (salesInvoice.customer_id !== dto.customerId) throw new Error('العميل المحدد لا يطابق العميل المسجل على الفاتورة التجارية.');
    if (!salesInvoice.company_tax_number || !salesInvoice.customer_tax_number) {
      throw new Error('بيانات التسجيل الضريبي للشركة والعميل مطلوبة قبل إنشاء مسودة ETA.');
    }
    const duplicate = this.db.query<{ id: string }>(`
      SELECT ei.id FROM electronic_invoices ei
      JOIN sales_invoices si ON si.id = ei.sales_invoice_id
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      WHERE ei.sales_invoice_id = ? AND ${branch.clause} AND ${company.clause}
    `, [dto.salesInvoiceId, ...branch.params, ...company.params])[0];
    if (duplicate) throw new Error('يوجد سجل فاتورة إلكترونية مرتبط بهذه الفاتورة التجارية مسبقًا.');

    const id = `einv_${uuidv4().substring(0, 8)}`;
    const invoiceNumber = `EINV-${localDateString().replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();
    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`INSERT INTO electronic_invoices (
        id, invoice_number, sales_invoice_id, customer_id, status, total_tax, total_amount,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`, [
        id, invoiceNumber, dto.salesInvoiceId, dto.customerId,
        Number(salesInvoice.tax_amount || 0), Number(salesInvoice.total_amount || 0), actor.id, now, now,
      ]);
    });
    return this.queryElectronicInvoiceById(id, actor)!;
  }

  public async submitElectronicInvoice(id: string): Promise<ElectronicInvoice> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.submit');
    const invoice = this.queryElectronicInvoiceById(id, actor);
    if (!invoice) throw new Error('الفاتورة الإلكترونية غير موجودة أو خارج نطاق الفرع أو الشركة.');
    if (invoice.status === 'SENT') return this.syncElectronicInvoice(id);
    if (invoice.status !== 'DRAFT' && invoice.status !== 'REJECTED') throw new Error('حالة الفاتورة لا تسمح بإرسالها.');
    const source = this.db.query<any>(`${this.invoiceSelect()} WHERE si.id = ?`, [invoice.salesInvoiceId])[0];
    if (!source || source.invoice_status !== 'COMPLETED' || source.customer_id !== invoice.customerId) throw new Error('بيانات الفاتورة التجارية غير صالحة للإرسال.');
    if (!this.documentBuilder) throw new Error('محوّل مستند ETA غير مهيأ. يلزم استكمال بيانات الشركة والعميل وتصنيف الضرائب والوحدات وفق مخطط ETA قبل الإرسال.');
    const items = this.db.query<any>(`SELECT * FROM sales_invoice_items WHERE invoice_id = ? ORDER BY id`, [invoice.salesInvoiceId]);
    if (!items.length) throw new Error('لا يمكن إرسال فاتورة دون بنود.');
    const customer = this.db.query<any>('SELECT * FROM customers WHERE id = ?', [invoice.customerId])[0];
    const payload = await this.documentBuilder.build({ invoice: source, customer, items });
    const serializedPayload = JSON.stringify(payload);
    const previousAttempt = this.db.query<{ request_fingerprint: string | null; request_payload: string | null }>(
      'SELECT request_fingerprint, request_payload FROM electronic_invoices WHERE id = ?', [id],
    )[0];
    if (previousAttempt?.request_fingerprint && previousAttempt.request_fingerprint !== serializedPayload && invoice.status !== 'REJECTED') {
      throw new Error('تغير محتوى المستند بعد محاولة الإرسال الأولى؛ أوقفنا إعادة المحاولة لمنع إرسال فاتورة مختلفة بالمعرّف نفسه.');
    }
    const provider = this.requireProvider();
    if (!previousAttempt?.request_fingerprint || invoice.status === 'REJECTED') {
      this.db.run('UPDATE electronic_invoices SET request_fingerprint = ?, request_payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [serializedPayload, serializedPayload, id]);
    }
    const result = await provider.submit({ internalId: invoice.id, payload });
    const accepted = result.acceptedDocuments?.find((item) => item.internalId === invoice.id);
    const rejected = result.rejectedDocuments?.find((item) => item.internalId === invoice.id);
    this.db.run(`UPDATE electronic_invoices SET status = ?, submission_date = ?,
      tax_authority_reference = ?, submission_uuid = ?, rejection_reason = ?, provider_response = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`, [rejected ? 'REJECTED' : 'SENT', new Date().toISOString(), accepted?.uuid || null,
      result.submissionId || null, rejected?.error == null ? null : JSON.stringify(rejected.error), JSON.stringify(result.response), id]);
    return this.queryElectronicInvoiceById(id, actor)!;
  }

  /** Acceptance is authoritative only after a status query against ETA. */
  public acceptElectronicInvoice(id: string, _taxAuthorityReference?: string): Promise<ElectronicInvoice> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.accept');
    return this.reconcileFromProvider(id, actor);
  }

  public async syncElectronicInvoice(id: string): Promise<ElectronicInvoice> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.view');
    return this.reconcileFromProvider(id, actor);
  }

  private async reconcileFromProvider(id: string, actor: User): Promise<ElectronicInvoice> {
    const invoice = this.queryElectronicInvoiceById(id, actor);
    if (!invoice) throw new Error('الفاتورة الإلكترونية غير موجودة أو خارج نطاق الفرع أو الشركة.');
    const submissionId = this.db.query<{ submission_uuid: string | null }>(
      'SELECT submission_uuid FROM electronic_invoices WHERE id = ?', [id],
    )[0]?.submission_uuid;
    const reference = submissionId || invoice.taxAuthorityReference;
    if (!reference) throw new Error('لا يوجد رقم إرسال أو مرجع ضريبي لمطابقة الحالة.');
    const state = await this.requireProvider().getStatus(reference, invoice.id, Boolean(submissionId));
    return this.reconcileState(id, actor, state);
  }

  private reconcileState(id: string, actor: User, state: { status: 'PROCESSING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'; uuid?: string; reason?: string; response: unknown }): ElectronicInvoice {
    const mapped: ElectronicInvoiceStatus | null = state.status === 'PROCESSING' ? null : state.status;
    this.db.run(`UPDATE electronic_invoices SET
      status = COALESCE(?, status), tax_authority_reference = COALESCE(?, tax_authority_reference),
      accepted_date = CASE WHEN ? = 'ACCEPTED' THEN CURRENT_TIMESTAMP ELSE accepted_date END,
      rejection_reason = CASE WHEN ? = 'REJECTED' THEN ? ELSE rejection_reason END,
      provider_response = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [mapped, state.uuid || null, mapped, mapped, state.reason ? JSON.stringify(state.reason) : null, JSON.stringify(state.response), id]);
    return this.queryElectronicInvoiceById(id, actor)!;
  }

  public rejectElectronicInvoice(id: string, _reason: string): Promise<ElectronicInvoice> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.reject');
    return this.reconcileFromProvider(id, actor);
  }

  public async cancelElectronicInvoice(id: string, reason: string): Promise<ElectronicInvoice> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.cancel');
    const invoice = this.queryElectronicInvoiceById(id, actor);
    if (!invoice) throw new Error('الفاتورة الإلكترونية غير موجودة أو خارج نطاق الفرع أو الشركة.');
    if (invoice.status !== 'ACCEPTED' || !invoice.taxAuthorityReference || !reason.trim()) throw new Error('يجب أن يكون المستند مقبولًا وله معرّف ETA وسبب إلغاء.');
    const result = await this.requireProvider().cancel(invoice.taxAuthorityReference, reason.trim());
    this.db.run(`UPDATE electronic_invoices SET provider_response = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(result.response), id]);
    return this.reconcileCancellation(id, actor);
  }

  private async reconcileCancellation(id: string, actor: User): Promise<ElectronicInvoice> {
    const invoice = this.queryElectronicInvoiceById(id, actor);
    if (!invoice) throw new Error('الفاتورة الإلكترونية غير موجودة أو خارج نطاق الفرع أو الشركة.');
    const submissionId = this.db.query<{ submission_uuid: string | null }>(
      'SELECT submission_uuid FROM electronic_invoices WHERE id = ?', [id],
    )[0]?.submission_uuid;
    const reference = submissionId || invoice.taxAuthorityReference;
    if (!reference) throw new Error('لا يوجد مرجع ETA لمطابقة حالة الإلغاء.');
    const state = await this.requireProvider().getStatus(reference, invoice.id, Boolean(submissionId));
    return this.reconcileState(id, actor, state);
  }

  public getStats(): { total: number; draft: number; sent: number; accepted: number; rejected: number; cancelled: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.e_invoicing.invoices.view');
    const { branch, company } = this.scope(actor);
    const rows = this.db.query<any>(`SELECT ei.status, COUNT(*) as cnt
      FROM electronic_invoices ei JOIN sales_invoices si ON si.id = ei.sales_invoice_id
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      WHERE ${branch.clause} AND ${company.clause} GROUP BY ei.status`, [...branch.params, ...company.params]);
    const stats: Record<string, number> = {};
    for (const row of rows) stats[row.status] = row.cnt;
    return { total: Object.values(stats).reduce((a, b) => a + b, 0), draft: stats.DRAFT || 0,
      sent: stats.SENT || 0, accepted: stats.ACCEPTED || 0, rejected: stats.REJECTED || 0, cancelled: stats.CANCELLED || 0 };
  }
}
