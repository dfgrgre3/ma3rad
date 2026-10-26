import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { CustomerService } from './CustomerService';
import type { Lead, CrmActivity, LeadStage } from './crmTypes';

export class CrmServicePart01 {
protected db = DatabaseManager.getInstance();

public getLeads(search = '', stage?: string): Lead[] {
    let sql = `SELECT l.*, u.full_name AS assigned_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to WHERE 1 = 1`;
    const params: any[] = [];
    if (search.trim()) {
      sql += ` AND (l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ? OR l.code LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    if (stage && stage !== 'ALL') {
      sql += ` AND l.stage = ?`;
      params.push(stage);
    }
    sql += ` ORDER BY l.created_at DESC`;
    return this.db.query<Lead>(sql, params);
  }

public getLeadById(id: string): Lead | null {
    return this.db.query<Lead>(`SELECT * FROM leads WHERE id = ?`, [id])[0] || null;
  }

public createLead(input: {
    name: string; phone: string; email?: string; city?: string; address?: string;
    source?: string; leadType?: string; stage?: LeadStage; estimatedValue?: number;
    probability?: number; assignedTo?: string; nextFollowUp?: string; notes?: string;
  }): Lead {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'crm.create');
    if (!input.name.trim() || !input.phone.trim()) throw new Error('اسم العميل ورقم الهاتف مطلوبان.');

    const id = `lead_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('LEAD');
      db.run(
        `INSERT INTO leads (
          id, code, name, phone, email, city, address, source, lead_type, stage,
          estimated_value, probability, assigned_to, next_follow_up, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, code, input.name.trim(), input.phone.trim(), input.email || null, input.city || null,
          input.address || null, input.source || 'OTHER', input.leadType || 'RETAIL',
          input.stage || 'NEW', input.estimatedValue || 0, input.probability || 0,
          input.assignedTo || null, input.nextFollowUp || null, input.notes || null, actor.id,
        ]
      );
      return this.getLeadById(id)!;
    });
  }

public updateLead(id: string, patch: Partial<Lead>): Lead {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'crm.update');
    const existing = this.getLeadById(id);
    if (!existing) throw new Error('العميل المحتمل غير موجود.');

    return this.db.executeTransaction((db) => {
      db.run(
        `UPDATE leads SET
          name = COALESCE(?, name), phone = COALESCE(?, phone), phone2 = COALESCE(?, phone2),
          email = COALESCE(?, email), city = COALESCE(?, city), address = COALESCE(?, address),
          source = COALESCE(?, source), lead_type = COALESCE(?, lead_type), stage = COALESCE(?, stage),
          estimated_value = COALESCE(?, estimated_value), probability = COALESCE(?, probability),
          assigned_to = COALESCE(?, assigned_to), next_follow_up = ?,
          lost_reason = COALESCE(?, lost_reason), notes = COALESCE(?, notes),
          updated_at = ?
        WHERE id = ?`,
        [
          patch.name ?? null, patch.phone ?? null, patch.phone2 ?? null, patch.email ?? null,
          patch.city ?? null, patch.address ?? null, patch.source ?? null, patch.leadType ?? null,
          patch.stage ?? null, patch.estimatedValue ?? null, patch.probability ?? null,
          patch.assignedTo ?? null, patch.nextFollowUp !== undefined ? patch.nextFollowUp : existing.nextFollowUp,
          patch.lostReason ?? null, patch.notes ?? null, new Date().toISOString(), id,
        ]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, 'تعديل عميل محتمل', 'CRM', ?, ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(existing), JSON.stringify(patch)]
      );
      return this.getLeadById(id)!;
    });
  }

public convertLeadToCustomer(id: string): { customerId: string } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'crm.update');
    PermissionService.require(actor, 'customers.create');
    const lead = this.getLeadById(id);
    if (!lead) throw new Error('العميل المحتمل غير موجود.');
    if (lead.convertedCustomerId) return { customerId: lead.convertedCustomerId };

    const customerService = new CustomerService();
    const customer = customerService.createCustomer({
      code: `CUST-${Date.now().toString().slice(-6)}`,
      name: lead.name,
      phone: lead.phone,
      phone2: lead.phone2 || undefined,
      address: lead.address || undefined,
      city: lead.city || undefined,
      customerType: (['CONTRACTOR', 'WHOLESALE', 'ENGINEER'].includes(lead.leadType) ? lead.leadType : 'RETAIL') as any,
      creditLimit: 0,
      notes: lead.notes || undefined,
    });

    this.db.run(
      `UPDATE leads SET stage = 'WON', converted_customer_id = ?, converted_at = ?, updated_at = ? WHERE id = ?`,
      [customer.id, new Date().toISOString(), new Date().toISOString(), id]
    );
    return { customerId: customer.id };
  }

public getActivities(search = '', status?: string): CrmActivity[] {
    let sql = `
      SELECT a.*, COALESCE(l.name, c.name) AS lead_name
      FROM crm_activities a
      LEFT JOIN leads l ON l.id = a.lead_id
      LEFT JOIN customers c ON c.id = a.customer_id
      WHERE 1 = 1`;
    const params: any[] = [];
    if (search.trim()) {
      sql += ` AND (a.subject LIKE ? OR a.body LIKE ? OR l.name LIKE ? OR c.name LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    if (status && status !== 'ALL') {
      sql += ` AND a.status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY COALESCE(a.scheduled_at, a.created_at) DESC`;
    return this.db.query<CrmActivity>(sql, params);
  }
}
