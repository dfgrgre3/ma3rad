import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { CustomerService } from './CustomerService';
import type { Lead, CrmActivity, LeadStage } from './crmTypes';

const ACTIVITY_TYPES = ['CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'MEETING', 'QUOTATION_SENT', 'SAMPLE_GIVEN', 'NOTE', 'STAGE_CHANGE'];
import { CrmServicePart01 } from './CrmServicePart01';

export class CrmServicePart02 extends CrmServicePart01 {
public createActivity(input: {
    leadId?: string; customerId?: string; activityType: string; subject: string;
    body?: string; scheduledAt?: string; assignedTo?: string;
  }): CrmActivity {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'crm.create');
    if (!input.leadId && !input.customerId) {
      throw new Error('يجب ربط النشاط بعميل محتمل أو عميل مسجل.');
    }
    if (!input.subject.trim()) throw new Error('عنوان النشاط مطلوب.');
    if (!ACTIVITY_TYPES.includes(input.activityType)) throw new Error('نوع النشاط غير صحيح.');

    const id = `act_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO crm_activities (id, lead_id, customer_id, activity_type, subject, body, scheduled_at, assigned_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.leadId || null, input.customerId || null, input.activityType,
        input.subject.trim(), input.body || null, input.scheduledAt || null,
        input.assignedTo || null, actor.id,
      ]
    );
    return this.db.query<CrmActivity>(`SELECT * FROM crm_activities WHERE id = ?`, [id])[0];
  }

public completeActivity(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'crm.update');
    this.db.run(
      `UPDATE crm_activities SET status = 'COMPLETED', completed_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
  }

public cancelActivity(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'crm.update');
    this.db.run(`UPDATE crm_activities SET status = 'CANCELLED' WHERE id = ?`, [id]);
  }

public deleteActivity(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'crm.update');
    this.db.run(`DELETE FROM crm_activities WHERE id = ?`, [id]);
  }

public getPipelineStats(): { stage: LeadStage; count: number; value: number }[] {
    return this.db.query<{ stage: LeadStage; count: number; value: number }>(
      `SELECT stage, COUNT(*) AS count, COALESCE(SUM(estimated_value), 0) AS value
       FROM leads GROUP BY stage`
    );
  }

public getActiveLeadsForSelect(): Array<{ id: string; name: string; phone: string }> {
    return this.db.query<{ id: string; name: string; phone: string }>(
      `SELECT id, name, phone FROM leads WHERE stage NOT IN ('WON', 'LOST') ORDER BY name`
    );
  }
}
