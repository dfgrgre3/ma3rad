'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { recordAuditEvent } = require('../lib/audit');
const { nowIso } = require('../lib/time');
const {
  authenticatePlatformUser,
  requirePlatformPermission,
  requireTenantScope,
  getScopedTenantIds,
  tenantScopePredicate,
} = require('../middleware/auth');

const router = express.Router();

const INVOICE_STATUSES = new Set(['DRAFT', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']);

function mapInvoiceRow(row, items) {
  if (!row) return null;
  const invoice = {
    id: row.id,
    number: row.number,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name ?? row.tenantName ?? null,
    subscriptionId: row.subscription_id ?? null,
    issueDate: row.issue_date,
    dueDate: row.due_date ?? null,
    status: row.status,
    currency: row.currency ?? 'EGP',
    subtotal: Number(row.subtotal) || 0,
    discount: Number(row.discount) || 0,
    tax: Number(row.tax) || 0,
    total: Number(row.total) || 0,
    paidAmount: Number(row.paid_amount) || 0,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
  if (items) invoice.items = items;
  return invoice;
}

function mapInvoiceItemRow(row) {
  return {
    id: row.id,
    description: row.description,
    quantity: Number(row.quantity) || 0,
    unitPrice: Number(row.unit_price) || 0,
    total: Number(row.total) || 0,
  };
}

function mapPaymentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    invoiceId: row.invoice_id ?? null,
    invoiceNumber: row.invoice_number ?? null,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name ?? row.tenantName ?? null,
    amount: Number(row.amount) || 0,
    method: row.method,
    reference: row.reference ?? null,
    paidAt: row.paid_at,
    notes: row.notes ?? null,
  };
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Recompute an invoice status from its paid amount (VOID/DRAFT are preserved). */
function deriveInvoiceStatus(invoice, paidAmount) {
  const total = Number(invoice.total) || 0;
  if (paidAmount >= total && total > 0) return 'PAID';
  if (paidAmount > 0) return 'PARTIAL';
  return invoice.status === 'PAID' ? 'SENT' : invoice.status === 'PARTIAL' ? 'SENT' : invoice.status;
}

async function loadInvoiceWithItems(db, id) {
  const row = await db.get(
    `SELECT i.*, t.name AS tenant_name FROM platform_invoices i
     LEFT JOIN platform_tenants t ON t.id = i.tenant_id
     WHERE i.id = ?`,
    [id]
  );
  if (!row) return null;
  const items = await db.all(
    'SELECT * FROM platform_invoice_items WHERE invoice_id = ? ORDER BY created_at ASC',
    [id]
  );
  return mapInvoiceRow(row, items.map(mapInvoiceItemRow));
}

// ─── Invoices ────────────────────────────────────────────────────────────────

router.get(
  '/invoices',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.view', 'platform.billing.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && scoped.length === 0) {
        return res.json({ data: [], meta: { total: 0, page: 1, limit: 0 } });
      }
      const scopePredicate = tenantScopePredicate('i.tenant_id', scoped);

      const where = ['1=1' + scopePredicate.clause];
      const params = [...scopePredicate.params];

      const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
      if (status) {
        if (!INVOICE_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid invoice status' });
        where.push('i.status = ?');
        params.push(status);
      }
      if (typeof req.query.tenantId === 'string' && req.query.tenantId) {
        where.push('i.tenant_id = ?');
        params.push(req.query.tenantId);
      }
      if (typeof req.query.search === 'string' && req.query.search.trim()) {
        where.push('(i.number LIKE ? OR t.name LIKE ? OR t.code LIKE ?)');
        const term = `%${req.query.search.trim()}%`;
        params.push(term, term, term);
      }

      const rows = await db.all(
        `SELECT i.*, t.name AS tenant_name FROM platform_invoices i
         LEFT JOIN platform_tenants t ON t.id = i.tenant_id
         WHERE ${where.join(' AND ')}
         ORDER BY i.created_at DESC`,
        params
      );

      let itemsByInvoice = new Map();
      if (rows.length) {
        const placeholders = rows.map(() => '?').join(',');
        const itemRows = await db.all(
          `SELECT * FROM platform_invoice_items WHERE invoice_id IN (${placeholders}) ORDER BY created_at ASC`,
          rows.map((row) => row.id)
        );
        itemsByInvoice = itemRows.reduce((map, itemRow) => {
          const list = map.get(itemRow.invoice_id) || [];
          list.push(mapInvoiceItemRow(itemRow));
          map.set(itemRow.invoice_id, list);
          return map;
        }, new Map());
      }

      const invoices = rows.map((row) => mapInvoiceRow(row, itemsByInvoice.get(row.id) || []));
      res.json({ data: invoices, meta: { total: invoices.length } });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/invoices/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.view', 'platform.billing.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const invoice = await loadInvoiceWithItems(db, req.params.id);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && !scoped.includes(String(invoice.tenantId))) {
        return res.status(403).json({ error: 'Tenant is outside your data scope' });
      }
      res.json({ data: invoice });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/invoices',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.create', 'platform.billing.manage']),
  requireTenantScope(),
  async (req, res, next) => {
    try {
      const db = getDb();
      const body = req.body || {};
      const { tenantId, number, currency, notes, subscriptionId } = body;
      if (!tenantId || !number) {
        return res.status(400).json({ error: 'tenantId and number are required' });
      }

      const tenant = await db.get('SELECT id FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      const rawItems = Array.isArray(body.items) ? body.items : [];
      const items = rawItems
        .map((item) => ({
          description: String(item?.description ?? '').trim(),
          quantity: Math.max(0, Number(item?.quantity) || 0),
          unitPrice: Math.max(0, Number(item?.unitPrice) || 0),
        }))
        .filter((item) => item.description);

      const itemsSubtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const subtotal = body.subtotal !== undefined ? round2(body.subtotal) : round2(itemsSubtotal);
      const discount = Math.max(0, round2(body.discount));
      const tax = Math.max(0, round2(body.tax));
      const total = body.total !== undefined && !items.length
        ? round2(body.total)
        : round2(subtotal - discount + tax);

      const status = String(body.status || 'DRAFT').toUpperCase();
      if (!INVOICE_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid invoice status' });

      const id = `inv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();

      await db.run(
        `INSERT INTO platform_invoices
          (id, number, tenant_id, subscription_id, issue_date, due_date, status, currency,
           subtotal, discount, tax, total, paid_amount, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          id,
          String(number).trim(),
          tenantId,
          subscriptionId ?? null,
          body.issueDate || now.split('T')[0],
          body.dueDate || null,
          status,
          currency || 'EGP',
          subtotal,
          discount,
          tax,
          total,
          notes ?? null,
          now,
          now,
        ]
      );

      for (const item of items) {
        await db.run(
          `INSERT INTO platform_invoice_items (id, invoice_id, description, quantity, unit_price, total, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `ivi_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
            id,
            item.description,
            item.quantity,
            item.unitPrice,
            round2(item.quantity * item.unitPrice),
            now,
          ]
        );
      }

      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId,
        action: 'INVOICE_CREATED',
        resourceType: 'platform_invoices',
        resourceId: id,
        afterData: { number, total, status },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ data: await loadInvoiceWithItems(db, id) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/invoices/:id/status',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.update', 'platform.billing.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const status = String(req.body?.status || '').toUpperCase();
      if (!INVOICE_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid invoice status' });

      const invoice = await db.get('SELECT * FROM platform_invoices WHERE id = ?', [req.params.id]);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && !scoped.includes(String(invoice.tenant_id))) {
        return res.status(403).json({ error: 'Tenant is outside your data scope' });
      }

      const now = nowIso();
      const paidAmount = status === 'PAID' ? Number(invoice.total) || 0 : Number(invoice.paid_amount) || 0;
      await db.run(
        'UPDATE platform_invoices SET status = ?, paid_amount = ?, updated_at = ? WHERE id = ?',
        [status, paidAmount, now, req.params.id]
      );

      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: invoice.tenant_id,
        action: 'INVOICE_STATUS_CHANGED',
        resourceType: 'platform_invoices',
        resourceId: req.params.id,
        beforeData: { status: invoice.status },
        afterData: { status },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: await loadInvoiceWithItems(db, req.params.id) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/invoices/:id/void',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.delete', 'platform.billing.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const invoice = await db.get('SELECT * FROM platform_invoices WHERE id = ?', [req.params.id]);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && !scoped.includes(String(invoice.tenant_id))) {
        return res.status(403).json({ error: 'Tenant is outside your data scope' });
      }
      if ((Number(invoice.paid_amount) || 0) > 0) {
        return res.status(409).json({ error: 'Cannot void an invoice that already has payments' });
      }

      await db.run('UPDATE platform_invoices SET status = ?, updated_at = ? WHERE id = ?', [
        'VOID',
        nowIso(),
        req.params.id,
      ]);

      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: invoice.tenant_id,
        action: 'INVOICE_VOIDED',
        resourceType: 'platform_invoices',
        resourceId: req.params.id,
        afterData: { status: 'VOID' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: await loadInvoiceWithItems(db, req.params.id) });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Payments ────────────────────────────────────────────────────────────────

router.get(
  '/payments',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.view', 'platform.billing.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && scoped.length === 0) {
        return res.json({ data: [], meta: { total: 0 } });
      }
      const scopePredicate = tenantScopePredicate('p.tenant_id', scoped);
      const where = ['1=1' + scopePredicate.clause];
      const params = [...scopePredicate.params];

      if (typeof req.query.tenantId === 'string' && req.query.tenantId) {
        where.push('p.tenant_id = ?');
        params.push(req.query.tenantId);
      }
      if (typeof req.query.invoiceId === 'string' && req.query.invoiceId) {
        where.push('p.invoice_id = ?');
        params.push(req.query.invoiceId);
      }

      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
      const rows = await db.all(
        `SELECT p.*, t.name AS tenant_name, i.number AS invoice_number
         FROM platform_payments p
         LEFT JOIN platform_tenants t ON t.id = p.tenant_id
         LEFT JOIN platform_invoices i ON i.id = p.invoice_id
         WHERE ${where.join(' AND ')}
         ORDER BY p.paid_at DESC
         LIMIT ${limit}`,
        params
      );
      const payments = rows.map(mapPaymentRow);
      res.json({ data: payments, meta: { total: payments.length } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payments',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.create', 'platform.billing.approve', 'platform.billing.manage']),
  requireTenantScope(),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId, invoiceId, method, reference, notes, paidAt } = req.body || {};
      const amount = round2(req.body?.amount);
      if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }

      const tenant = await db.get('SELECT id FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      let invoice = null;
      if (invoiceId) {
        invoice = await db.get('SELECT * FROM platform_invoices WHERE id = ? AND tenant_id = ?', [
          invoiceId,
          tenantId,
        ]);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found for this tenant' });
      }

      const paymentId = `pay_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();

      await db.run(
        `INSERT INTO platform_payments (id, invoice_id, tenant_id, amount, method, reference, notes, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, invoiceId ?? null, tenantId, amount, method || 'CASH', reference ?? null, notes ?? null, paidAt || now, now]
      );

      if (invoice) {
        const paidAmount = round2((Number(invoice.paid_amount) || 0) + amount);
        await db.run(
          'UPDATE platform_invoices SET paid_amount = ?, status = ?, updated_at = ? WHERE id = ?',
          [paidAmount, deriveInvoiceStatus(invoice, paidAmount), now, invoice.id]
        );
      }

      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId,
        action: 'PAYMENT_RECORDED',
        resourceType: 'platform_payments',
        resourceId: paymentId,
        afterData: { amount, method: method || 'CASH', invoiceId: invoiceId ?? null },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const row = await db.get(
        `SELECT p.*, t.name AS tenant_name, i.number AS invoice_number
         FROM platform_payments p
         LEFT JOIN platform_tenants t ON t.id = p.tenant_id
         LEFT JOIN platform_invoices i ON i.id = p.invoice_id
         WHERE p.id = ?`,
        [paymentId]
      );
      res.status(201).json({ data: mapPaymentRow(row) });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/payments/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.delete', 'platform.billing.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const payment = await db.get('SELECT * FROM platform_payments WHERE id = ?', [req.params.id]);
      if (!payment) return res.status(404).json({ error: 'Payment not found' });

      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && !scoped.includes(String(payment.tenant_id))) {
        return res.status(403).json({ error: 'Tenant is outside your data scope' });
      }

      const now = nowIso();
      await db.run('DELETE FROM platform_payments WHERE id = ?', [req.params.id]);

      if (payment.invoice_id) {
        const invoice = await db.get('SELECT * FROM platform_invoices WHERE id = ?', [payment.invoice_id]);
        if (invoice) {
          const paidAmount = Math.max(0, round2((Number(invoice.paid_amount) || 0) - (Number(payment.amount) || 0)));
          await db.run(
            'UPDATE platform_invoices SET paid_amount = ?, status = ?, updated_at = ? WHERE id = ?',
            [paidAmount, deriveInvoiceStatus(invoice, paidAmount), now, invoice.id]
          );
        }
      }

      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: payment.tenant_id,
        action: 'PAYMENT_VOIDED',
        resourceType: 'platform_payments',
        resourceId: req.params.id,
        beforeData: { amount: payment.amount, invoiceId: payment.invoice_id ?? null },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: { id: req.params.id, deleted: true } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
