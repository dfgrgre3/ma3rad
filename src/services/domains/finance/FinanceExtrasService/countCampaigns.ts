import { v4 as uuidv4 } from 'uuid';
import { unscaleMoneyRow } from '../../../../utils/money';
import { ExtrasDisposalBase } from './disposal';
import { FA_MONEY_FIELDS, validDate } from './types';
import type {
  FixedAsset,
  FixedAssetCountAudit,
  FixedAssetCountCampaign,
  FixedAssetCountObservation,
  FixedAssetCountSnapshot,
} from './types';

export abstract class ExtrasCountCampaignsBase extends ExtrasDisposalBase {
  getFixedAssetCountCampaigns(): FixedAssetCountCampaign[] {
    const actor = this.requireView();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed === null) return this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns ORDER BY count_date DESC, created_at DESC');
    if (!allowed.length) return [];
    return this.db.query<FixedAssetCountCampaign>(
      `SELECT * FROM fixed_asset_count_campaigns WHERE branch_id IN (${allowed.map(() => '?').join(',')}) ORDER BY count_date DESC, created_at DESC`,
      allowed
    );
  }

  getFixedAssetBranches(): Array<{ id: string; name: string; code: string; isMain: boolean }> {
    const actor = this.requireView();
    return this.branchAccess.getSelectableBranches(actor);
  }

  getFixedAssetCurrentBranch(): string {
    const actor = this.requireView();
    return this.branchAccess.getCurrentBranchId(actor);
  }

  getFixedAssetDepartments(branchId: string): Array<{ id: string; name: string }> {
    const actor = this.requireView();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(branchId)) throw new Error('ليس لديك صلاحية الوصول إلى هذا الفرع.');
    return this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM departments WHERE branch_id = ? OR branch_id IS NULL ORDER BY name',
      [branchId]
    );
  }

  getFixedAssetResponsibleUsers(branchId: string): Array<{ id: string; name: string }> {
    const actor = this.requireView();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(branchId)) throw new Error('ليس لديك صلاحية الوصول إلى هذا الفرع.');
    return this.db.query<{ id: string; name: string }>(
      `SELECT DISTINCT u.id, u.full_name AS name FROM users u
       LEFT JOIN users_branches ub ON ub.user_id = u.id AND ub.branch_id = ?
       WHERE u.is_active = 1 AND (u.role = 'ADMIN' OR u.branch_scope = 'ALL' OR ub.user_id IS NOT NULL)
       ORDER BY u.full_name`,
      [branchId]
    );
  }

  getFixedAssetCountObservations(campaignId: string): FixedAssetCountObservation[] {
    const actor = this.requireView();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');
    return this.db.query<FixedAssetCountObservation>(
      'SELECT * FROM fixed_asset_count_observations WHERE campaign_id = ? ORDER BY created_at, id',
      [campaignId]
    );
  }

  private ensureFixedAssetCountSnapshotColumns(): void {
    const columns = this.db.query<{ name: string }>('PRAGMA table_info(fixed_asset_count_snapshots)');
    const names = new Set(columns.map((column) => String(column.name ?? '')));

    if (!names.has('registered_status')) {
      this.db.executeFinancialTransaction((db) => {
        db.run("ALTER TABLE fixed_asset_count_snapshots ADD COLUMN registered_status TEXT NOT NULL DEFAULT 'UNKNOWN'");
      });
    }
    if (!names.has('registered_location')) {
      this.db.executeFinancialTransaction((db) => {
        db.run('ALTER TABLE fixed_asset_count_snapshots ADD COLUMN registered_location TEXT');
      });
    }

    this.db.executeFinancialTransaction((db) => {
      db.run(
        `UPDATE fixed_asset_count_snapshots
         SET registered_status = (
           SELECT fa.status FROM fixed_assets fa WHERE fa.id = fixed_asset_count_snapshots.asset_id
         )
         WHERE registered_status IS NULL OR registered_status = ''`,
      );
      db.run(
        `UPDATE fixed_asset_count_snapshots
         SET registered_location = (
           SELECT fa.location FROM fixed_assets fa WHERE fa.id = fixed_asset_count_snapshots.asset_id
         )
         WHERE registered_location IS NULL`,
      );
    });
  }

  getFixedAssetCountSnapshots(campaignId: string): FixedAssetCountSnapshot[] {
    const actor = this.requireView();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');

    const getSnapshotColumns = () => {
      const snapshotColumns = this.db.query<{ name: string }>('PRAGMA table_info(fixed_asset_count_snapshots)');
      return {
        hasRegisteredStatus: snapshotColumns.some((column) => String(column.name) === 'registered_status'),
        hasRegisteredLocation: snapshotColumns.some((column) => String(column.name) === 'registered_location'),
      };
    };

    let snapshotColumns = getSnapshotColumns();
    if (!snapshotColumns.hasRegisteredStatus || !snapshotColumns.hasRegisteredLocation) {
      this.ensureFixedAssetCountSnapshotColumns();
      snapshotColumns = getSnapshotColumns();
    }

    const { hasRegisteredStatus, hasRegisteredLocation } = snapshotColumns;

    return this.db.query<FixedAssetCountSnapshot>(
      `SELECT s.asset_id AS assetId, s.asset_code AS assetCode, s.asset_name AS assetName,
              ${hasRegisteredStatus ? 's.registered_status' : '(SELECT fa.status FROM fixed_assets fa WHERE fa.id = s.asset_id)'} AS registeredStatus,
              ${hasRegisteredLocation ? 's.registered_location' : '(SELECT fa.location FROM fixed_assets fa WHERE fa.id = s.asset_id)'} AS registeredLocation,
              EXISTS (SELECT 1 FROM fixed_asset_count_observations o
                WHERE o.campaign_id = s.campaign_id AND o.asset_id = s.asset_id AND o.count_status = 'FOUND') AS observed
       FROM fixed_asset_count_snapshots s WHERE s.campaign_id = ? ORDER BY s.asset_code`,
      [campaignId]
    );
  }

  getFixedAssetCountAudit(campaignId: string): FixedAssetCountAudit[] {
    const actor = this.requireView();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');
    return this.db.query<FixedAssetCountAudit>(
      `SELECT a.action, a.details, a.actor_id AS actorId, u.full_name AS actorName, a.created_at AS createdAt
       FROM fixed_asset_count_audit a JOIN users u ON u.id = a.actor_id
       WHERE a.campaign_id = ? ORDER BY a.created_at, a.id`,
      [campaignId]
    );
  }

  createFixedAssetCountCampaign(input: { branchId: string; location?: string; date: string }): string {
    const actor = this.requireManage();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (!this.db.query('SELECT id FROM branches WHERE id = ? AND is_active = 1', [input.branchId]).length ||
        (allowed !== null && !allowed.includes(input.branchId))) throw new Error('الفرع غير متاح أو خارج نطاق صلاحيتك.');
    if (!validDate(input.date)) throw new Error('تاريخ الجرد غير صحيح.');
    this.ensureFixedAssetCountSnapshotColumns();

    const campaignId = `fac_${uuidv4().substring(0, 8)}`;
    const location = input.location?.trim() || null;
    this.db.executeFinancialTransaction((db) => {
      db.run(
        'INSERT INTO fixed_asset_count_campaigns (id, branch_id, location, count_date, created_by) VALUES (?, ?, ?, ?, ?)',
        [campaignId, input.branchId, location, input.date, actor.id]
      );
      db.run(
        `INSERT INTO fixed_asset_count_snapshots
         (campaign_id, asset_id, asset_code, asset_name, registered_status, registered_location)
         SELECT ?, id, code, name, status, location FROM fixed_assets
         WHERE branch_id = ? AND status != 'DISPOSED' AND (? IS NULL OR location = ?)`,
        [campaignId, input.branchId, location, location]
      );
      db.run(
        'INSERT INTO fixed_asset_count_audit (id,campaign_id,action,details,actor_id) VALUES (?,?,?,?,?)',
        [`faca_${uuidv4().substring(0, 8)}`, campaignId, 'CREATED', JSON.stringify({ branchId: input.branchId, location, date: input.date }), actor.id]
      );
    });
    return campaignId;
  }

  recordFixedAssetCountObservation(input: {
    campaignId: string; code: string; condition?: string; notes?: string;
  }): FixedAssetCountObservation {
    const actor = this.requireManage();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [input.campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');
    if (campaign.status !== 'OPEN') throw new Error('حملة الجرد مغلقة.');
    const code = input.code.trim();
    if (!code) throw new Error('كود الأصل مطلوب.');
    const found = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE code = ?', [code])[0], FA_MONEY_FIELDS);
    const snapshot = found && found.branchId === campaign.branchId && (campaign.location === null || found.location === campaign.location)
      ? this.db.query('SELECT asset_id FROM fixed_asset_count_snapshots WHERE campaign_id = ? AND asset_id = ?', [campaign.id, found.id])[0]
      : null;
    if (snapshot && this.db.query(
      "SELECT id FROM fixed_asset_count_observations WHERE campaign_id = ? AND asset_id = ? AND count_status = 'FOUND'",
      [campaign.id, found?.id]
    ).length) throw new Error('تم تسجيل هذا الأصل في الحملة بالفعل.');
    const countStatus = snapshot ? 'FOUND' : 'UNREGISTERED';
    const observationId = `faco_${uuidv4().substring(0, 8)}`;
    this.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_count_observations
         (id, campaign_id, asset_id, scanned_code, count_status, condition, notes, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [observationId, campaign.id, snapshot ? found?.id || null : null, code, countStatus,
          input.condition?.trim() || null, input.notes?.trim() || null, actor.id]
      );
      db.run(
        'INSERT INTO fixed_asset_count_audit (id,campaign_id,action,details,actor_id) VALUES (?,?,?,?,?)',
        [`faca_${uuidv4().substring(0, 8)}`, campaign.id, countStatus, JSON.stringify({ code, condition: input.condition, notes: input.notes }), actor.id]
      );
    });
    return this.db.query<FixedAssetCountObservation>('SELECT * FROM fixed_asset_count_observations WHERE id = ?', [observationId])[0];
  }

  finalizeFixedAssetCountCampaign(campaignId: string): void {
    const actor = this.requireManage();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');
    if (campaign.status !== 'OPEN') throw new Error('تم اعتماد هذه الحملة بالفعل.');
    this.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_count_observations
         (id, campaign_id, asset_id, scanned_code, count_status, actor_id)
         SELECT 'faco_' || lower(hex(randomblob(8))), s.campaign_id, s.asset_id, s.asset_code, 'MISSING', ?
         FROM fixed_asset_count_snapshots s
         WHERE s.campaign_id = ? AND NOT EXISTS (
           SELECT 1 FROM fixed_asset_count_observations o
           WHERE o.campaign_id = s.campaign_id AND o.asset_id = s.asset_id AND o.count_status = 'FOUND'
         )`,
        [actor.id, campaignId]
      );
      db.run(
        "UPDATE fixed_asset_count_campaigns SET status = 'FINALIZED', finalized_by = ?, finalized_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'",
        [actor.id, campaignId]
      );
      db.run(
        'INSERT INTO fixed_asset_count_audit (id,campaign_id,action,details,actor_id) VALUES (?,?,?,?,?)',
        [`faca_${uuidv4().substring(0, 8)}`, campaignId, 'FINALIZED', null, actor.id]
      );
    });
  }
}
