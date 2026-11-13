import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { CustomerLoyalty, LoyaltyTier, LoyaltyTransaction, EarnLoyaltyPointsDTO, RedeemLoyaltyPointsDTO } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import type { DatabaseManager as DatabaseManagerType } from '../../../database/repositories/databaseManager';

const MAX_LOYALTY_POINTS = 1_000_000_000;

type LoyaltyMovement = {
  customerId: string;
  points: number;
  type: 'EARN' | 'REDEEM';
  referenceType: string;
  referenceId: string;
  description: string;
  actor: ReturnType<typeof AuthService.requireAuth>;
};

function validatePoints(points: unknown): asserts points is number {
  if (!Number.isSafeInteger(points) || Number(points) <= 0 || Number(points) > MAX_LOYALTY_POINTS) {
    throw new Error(`Loyalty points must be a positive integer no greater than ${MAX_LOYALTY_POINTS}.`);
  }
}

function validateReference(referenceType: unknown, referenceId: unknown): asserts referenceType is string {
  if (typeof referenceType !== 'string' || !referenceType.trim() || referenceType.length > 80
    || typeof referenceId !== 'string' || !referenceId.trim() || referenceId.length > 160) {
    throw new Error('A valid reference type and reference ID are required for every loyalty movement.');
  }
}

/** Apply a fully referenced movement inside the caller's transaction. */
export function applyLoyaltyMovementInTransaction(
  db: DatabaseManagerType,
  movement: LoyaltyMovement
): { loyalty: CustomerLoyalty; transaction: LoyaltyTransaction } {
  PermissionService.require(
    movement.actor,
    movement.type === 'EARN' ? 'ui.loyalty.program.earn' : 'ui.loyalty.program.redeem'
  );
  validatePoints(movement.points);
  validateReference(movement.referenceType, movement.referenceId);
  if (typeof movement.customerId !== 'string' || !movement.customerId.trim()) {
    throw new Error('A valid customer is required for a loyalty movement.');
  }
  if (movement.referenceType === 'SALES_INVOICE') {
    const invoice = db.query<{ customerId: string }>(
      `SELECT customer_id AS customerId FROM sales_invoices WHERE id = ?`, [movement.referenceId]
    )[0];
    if (!invoice || invoice.customerId !== movement.customerId) {
      throw new Error('The invoice reference does not belong to this customer.');
    }
  }
  const duplicate = db.query<{ id: string }>(
    `SELECT id FROM loyalty_transactions
     WHERE customer_id = ? AND type = ? AND reference_type = ? AND reference_id = ? LIMIT 1`,
    [movement.customerId, movement.type, movement.referenceType, movement.referenceId]
  )[0];
  if (duplicate) throw new Error(`A ${movement.type.toLowerCase()} loyalty movement already exists for this reference.`);

  const now = new Date().toISOString();
  let loyalty = db.query<{ id: string; currentPoints: number; totalPointsEarned: number; totalPointsRedeemed: number }>(
    `SELECT id, current_points AS currentPoints, total_points_earned AS totalPointsEarned,
            total_points_redeemed AS totalPointsRedeemed
     FROM customer_loyalty WHERE customer_id = ?`, [movement.customerId]
  )[0];
  if (!loyalty) {
    db.run(`INSERT INTO customer_loyalty
      (id, customer_id, current_points, total_points_earned, total_points_redeemed, tier_id, joined_at, last_activity_at)
      VALUES (?, ?, 0, 0, 0, NULL, ?, ?)`,
    [`cloy_${uuidv4().substring(0, 8)}`, movement.customerId, now, now]);
    loyalty = { id: '', currentPoints: 0, totalPointsEarned: 0, totalPointsRedeemed: 0 };
  }
  if (movement.type === 'REDEEM' && Number(loyalty.currentPoints) < movement.points) {
    throw new Error('The customer does not have enough loyalty points.');
  }

  const currentPoints = Number(loyalty.currentPoints) + (movement.type === 'EARN' ? movement.points : -movement.points);
  const totalPointsEarned = Number(loyalty.totalPointsEarned) + (movement.type === 'EARN' ? movement.points : 0);
  const totalPointsRedeemed = Number(loyalty.totalPointsRedeemed) + (movement.type === 'REDEEM' ? movement.points : 0);
  let tierId: string | null = null;
  for (const tier of db.query<{ id: string; minPoints: number; isActive: number }>(
    `SELECT id, min_points AS minPoints, is_active AS isActive FROM loyalty_tiers ORDER BY min_points ASC`
  )) {
    if (Number(tier.isActive) && totalPointsEarned >= Number(tier.minPoints)) tierId = tier.id;
  }
  db.run(`UPDATE customer_loyalty SET current_points = ?, total_points_earned = ?,
    total_points_redeemed = ?, tier_id = ?, last_activity_at = ? WHERE customer_id = ?`,
  [currentPoints, totalPointsEarned, totalPointsRedeemed, tierId, now, movement.customerId]);

  const transactionId = `ltx_${uuidv4().substring(0, 8)}`;
  const signedPoints = movement.type === 'EARN' ? movement.points : -movement.points;
  db.run(`INSERT INTO loyalty_transactions
    (id, customer_id, type, points, reference_type, reference_id, description, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [transactionId, movement.customerId, movement.type, signedPoints, movement.referenceType,
    movement.referenceId, movement.description, movement.actor.id, now]);

  const updatedLoyalty = db.query<CustomerLoyalty>(
    `SELECT cl.*, lt.name AS tierName FROM customer_loyalty cl
     LEFT JOIN loyalty_tiers lt ON lt.id = cl.tier_id WHERE cl.customer_id = ?`, [movement.customerId]
  )[0];
  const transaction = db.query<LoyaltyTransaction>(
    `SELECT * FROM loyalty_transactions WHERE id = ?`, [transactionId]
  )[0];
  if (!updatedLoyalty || !transaction) throw new Error('The loyalty movement could not be recorded.');
  return { loyalty: updatedLoyalty, transaction };
}

export class LoyaltyService {
  private db = DatabaseManager.getInstance();

  public getAllLoyaltyTiers(): LoyaltyTier[] {
    PermissionService.require(AuthService.requireAuth(), 'ui.loyalty.program.view');
    return this.db.query<LoyaltyTier>('SELECT * FROM loyalty_tiers ORDER BY min_points ASC');
  }

  public getLoyaltyTierById(id: string): LoyaltyTier | null {
    PermissionService.require(AuthService.requireAuth(), 'ui.loyalty.program.view');
    if (typeof id !== 'string' || !id.trim()) throw new Error('A loyalty tier ID is required.');
    const rows = this.db.query<LoyaltyTier>('SELECT * FROM loyalty_tiers WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createLoyaltyTier(tier: Omit<LoyaltyTier, 'id' | 'createdAt'>): LoyaltyTier {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.loyalty.program.manage');
    if (!tier || typeof tier.name !== 'string' || !tier.name.trim() || tier.name.trim().length > 100) {
      throw new Error('A loyalty tier name of 1 to 100 characters is required.');
    }
    if (!Number.isSafeInteger(tier.minPoints) || tier.minPoints < 0 || tier.minPoints > MAX_LOYALTY_POINTS) {
      throw new Error(`Tier minimum points must be an integer between 0 and ${MAX_LOYALTY_POINTS}.`);
    }
    if (!Number.isFinite(tier.discountPercentage) || tier.discountPercentage < 0 || tier.discountPercentage > 100) {
      throw new Error('Tier discount percentage must be between 0 and 100.');
    }
    const id = `ltier_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
    this.db.run(`
      INSERT INTO loyalty_tiers (id, name, min_points, discount_percentage, benefits, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, tier.name, tier.minPoints, tier.discountPercentage, tier.benefits || null, tier.isActive ? 1 : 0, now]);
    return this.readLoyaltyTierById(id)!;
  }

  public getCustomerLoyalty(customerId: string): CustomerLoyalty | null {
    PermissionService.require(AuthService.requireAuth(), 'ui.loyalty.program.view');
    this.requireCustomerId(customerId);
    return this.readCustomerLoyalty(customerId);
  }

  private readCustomerLoyalty(customerId: string): CustomerLoyalty | null {
    const rows = this.db.query<any>(`
      SELECT cl.*, lt.name as tierName
      FROM customer_loyalty cl
      LEFT JOIN loyalty_tiers lt ON cl.tier_id = lt.id
      WHERE cl.customer_id = ?
    `, [customerId]);
    return rows.length > 0 ? rows[0] : null;
  }

  public getCustomerLoyaltyByCustomerId(customerId: string): CustomerLoyalty | null {
    return this.getCustomerLoyalty(customerId);
  }

  public getRedeemablePointBalance(customerId: string): number {
    PermissionService.require(AuthService.requireAuth(), 'ui.loyalty.program.redeem');
    this.requireCustomerId(customerId);
    const row = this.db.query<{ currentPoints: number }>(
      'SELECT current_points AS currentPoints FROM customer_loyalty WHERE customer_id = ?',
      [customerId]
    )[0];
    return Number(row?.currentPoints || 0);
  }

  public initializeCustomerLoyalty(customerId: string): CustomerLoyalty {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.loyalty.program.earn');
    this.requireCustomerId(customerId);
    const existing = this.readCustomerLoyalty(customerId);
    if (existing) return existing;
    const id = `cloy_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
    this.db.executeTransaction((db) => {
      db.run(`
        INSERT OR IGNORE INTO customer_loyalty (id, customer_id, current_points, total_points_earned, total_points_redeemed, tier_id, joined_at, last_activity_at)
        VALUES (?, ?, 0, 0, 0, NULL, ?, ?)
      `, [id, customerId, now, now]);
    });
    return this.readCustomerLoyalty(customerId)!;
  }

  public earnPoints(dto: EarnLoyaltyPointsDTO): { loyalty: CustomerLoyalty; transaction: LoyaltyTransaction } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.loyalty.program.earn');
    this.validateMovementDto(dto);
    return this.db.executeTransaction((db) => applyLoyaltyMovementInTransaction(db, {
      customerId: dto.customerId, points: dto.points, type: 'EARN',
      referenceType: dto.referenceType!, referenceId: dto.referenceId!,
      description: dto.description || `Earned ${dto.points} loyalty points`, actor,
    }));
  }

  public redeemPoints(dto: RedeemLoyaltyPointsDTO): { loyalty: CustomerLoyalty; transaction: LoyaltyTransaction } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.loyalty.program.redeem');
    this.validateMovementDto(dto);
    return this.db.executeTransaction((db) => applyLoyaltyMovementInTransaction(db, {
      customerId: dto.customerId, points: dto.points, type: 'REDEEM',
      referenceType: dto.referenceType!, referenceId: dto.referenceId!,
      description: dto.description || `Redeemed ${dto.points} loyalty points`, actor,
    }));
  }
  public getLoyaltyTransactions(customerId?: string, limit = 100): LoyaltyTransaction[] {
    PermissionService.require(AuthService.requireAuth(), 'ui.loyalty.program.view');
    if (customerId !== undefined) this.requireCustomerId(customerId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('Loyalty transaction limit must be an integer between 1 and 500.');
    }
    let sql = 'SELECT * FROM loyalty_transactions';
    const params: any[] = [];
    if (customerId) {
      sql += ' WHERE customer_id = ?';
      params.push(customerId);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return this.db.query<LoyaltyTransaction>(sql, params);
  }

  public getLoyaltyTransactionById(id: string): LoyaltyTransaction | null {
    PermissionService.require(AuthService.requireAuth(), 'ui.loyalty.program.view');
    if (typeof id !== 'string' || !id.trim()) throw new Error('A loyalty transaction ID is required.');
    const rows = this.db.query<LoyaltyTransaction>('SELECT * FROM loyalty_transactions WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public getLoyaltyStats(): {
    totalCustomers: number;
    totalPointsEarned: number;
    totalPointsRedeemed: number;
    totalPointsCurrent: number;
    byTier: Array<{ tierId: string; tierName: string; customerCount: number; totalPoints: number }>;
  } {
    PermissionService.require(AuthService.requireAuth(), 'ui.loyalty.program.view');
    const totalCustomers = this.db.query<any>('SELECT COUNT(*) as cnt FROM customer_loyalty')[0]?.cnt || 0;
    const totalPointsEarned = this.db.query<any>('SELECT COALESCE(SUM(total_points_earned), 0) as total FROM customer_loyalty')[0]?.total || 0;
    const totalPointsRedeemed = this.db.query<any>('SELECT COALESCE(SUM(total_points_redeemed), 0) as total FROM customer_loyalty')[0]?.total || 0;
    const totalPointsCurrent = this.db.query<any>('SELECT COALESCE(SUM(current_points), 0) as total FROM customer_loyalty')[0]?.total || 0;
    const byTier = this.db.query<any>(`
      SELECT lt.id as tierId, lt.name as tierName,
             COUNT(cl.customer_id) as customerCount,
             COALESCE(SUM(cl.current_points), 0) as totalPoints
      FROM loyalty_tiers lt
      LEFT JOIN customer_loyalty cl ON cl.tier_id = lt.id
      GROUP BY lt.id, lt.name
      ORDER BY lt.min_points ASC
    `);
    return {
      totalCustomers: Number(totalCustomers),
      totalPointsEarned: Number(totalPointsEarned),
      totalPointsRedeemed: Number(totalPointsRedeemed),
      totalPointsCurrent: Number(totalPointsCurrent),
      byTier: byTier.map((r: any) => ({
        tierId: r.tierId,
        tierName: r.tierName,
        customerCount: Number(r.customerCount),
        totalPoints: Number(r.totalPoints),
      })),
    };
  }

  private validateMovementDto(dto: EarnLoyaltyPointsDTO | RedeemLoyaltyPointsDTO): void {
    if (!dto || typeof dto !== 'object') throw new Error('A loyalty movement is required.');
    this.requireCustomerId(dto.customerId);
    validatePoints(dto.points);
    validateReference(dto.referenceType, dto.referenceId);
    if (dto.referenceType === 'SALES_INVOICE') {
      const invoice = this.db.query<{ customerId: string }>(
        `SELECT customer_id AS customerId FROM sales_invoices WHERE id = ?`, [dto.referenceId]
      )[0];
      if (!invoice || invoice.customerId !== dto.customerId) {
        throw new Error('The invoice reference does not belong to this customer.');
      }
    }
    if (dto.description !== undefined && (typeof dto.description !== 'string' || dto.description.length > 500)) {
      throw new Error('Loyalty movement description must be 500 characters or fewer.');
    }
  }

  private requireCustomerId(customerId: string): void {
    if (typeof customerId !== 'string' || !customerId.trim()) throw new Error('A customer ID is required.');
  }

  private readLoyaltyTierById(id: string): LoyaltyTier | null {
    const rows = this.db.query<LoyaltyTier>('SELECT * FROM loyalty_tiers WHERE id = ?', [id]);
    return rows[0] || null;
  }
}
