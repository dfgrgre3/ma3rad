import { DatabaseManager } from '../database/db';
import type { CustomerLoyalty, LoyaltyTier, LoyaltyTransaction, EarnLoyaltyPointsDTO, RedeemLoyaltyPointsDTO } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';

export class LoyaltyService {
  private db = DatabaseManager.getInstance();

  public getAllLoyaltyTiers(): LoyaltyTier[] {
    return this.db.query<LoyaltyTier>('SELECT * FROM loyalty_tiers ORDER BY min_points ASC');
  }

  public getLoyaltyTierById(id: string): LoyaltyTier | null {
    const rows = this.db.query<LoyaltyTier>('SELECT * FROM loyalty_tiers WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createLoyaltyTier(tier: Omit<LoyaltyTier, 'id' | 'createdAt'>): LoyaltyTier {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'loyalty.manage');
    const id = `ltier_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
    this.db.run(`
      INSERT INTO loyalty_tiers (id, name, min_points, discount_percentage, benefits, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, tier.name, tier.minPoints, tier.discountPercentage, tier.benefits || null, tier.isActive ? 1 : 0, now]);
    return this.getLoyaltyTierById(id)!;
  }

  public getCustomerLoyalty(customerId: string): CustomerLoyalty | null {
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

  public initializeCustomerLoyalty(customerId: string): CustomerLoyalty {
    const existing = this.getCustomerLoyalty(customerId);
    if (existing) return existing;
    const id = `cloy_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
    this.db.run(`
      INSERT INTO customer_loyalty (id, customer_id, current_points, total_points_earned, total_points_redeemed, tier_id, joined_at, last_activity_at)
      VALUES (?, ?, 0, 0, 0, NULL, ?, ?)
    `, [id, customerId, now, now]);
    return this.getCustomerLoyalty(customerId)!;
  }

  public earnPoints(dto: EarnLoyaltyPointsDTO): { loyalty: CustomerLoyalty; transaction: LoyaltyTransaction } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'loyalty.earn');
    return this.db.executeTransaction((sqliteDb) => {
      const loyalty = this.initializeCustomerLoyalty(dto.customerId);
      const newPoints = loyalty.currentPoints + dto.points;
      const newTotalEarned = loyalty.totalPointsEarned + dto.points;
      const now = new Date().toISOString();
      const tiers = this.getAllLoyaltyTiers();
      let newTierId: string | null = null;
      for (const tier of tiers) {
        if (newTotalEarned >= tier.minPoints && tier.isActive) {
          newTierId = tier.id;
        }
      }
      sqliteDb.run(`
        UPDATE customer_loyalty
        SET current_points = ?, total_points_earned = ?, tier_id = ?, last_activity_at = ?
        WHERE customer_id = ?
      `, [newPoints, newTotalEarned, newTierId, now, dto.customerId]);
      const txId = `ltx_${uuidv4().substring(0, 8)}`;
      sqliteDb.run(`
        INSERT INTO loyalty_transactions (id, customer_id, type, points, reference_type, reference_id, description, created_by, created_at)
        VALUES (?, ?, 'EARN', ?, ?, ?, ?, ?, ?)
      `, [txId, dto.customerId, dto.points, dto.referenceType || null, dto.referenceId || null, dto.description || ` 획득 نقاط ولاء (${dto.points} نقطة)`, actor.id, now]);
      return {
        loyalty: this.getCustomerLoyalty(dto.customerId)!,
        transaction: this.getLoyaltyTransactionById(txId)!,
      };
    });
  }

  public redeemPoints(dto: RedeemLoyaltyPointsDTO): { loyalty: CustomerLoyalty; transaction: LoyaltyTransaction } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'loyalty.redeem');
    const loyalty = this.getCustomerLoyalty(dto.customerId);
    if (!loyalty) throw new Error('لم يتم العثور على سجل ولاء لهذا العميل.');
    if (loyalty.currentPoints < dto.points) throw new Error('رصيد النقاط غير كافٍ.');
    return this.db.executeTransaction((sqliteDb) => {
      const newPoints = loyalty.currentPoints - dto.points;
      const newTotalRedeemed = loyalty.totalPointsRedeemed + dto.points;
      const now = new Date().toISOString();
      sqliteDb.run(`
        UPDATE customer_loyalty
        SET current_points = ?, total_points_redeemed = ?, last_activity_at = ?
        WHERE customer_id = ?
      `, [newPoints, newTotalRedeemed, now, dto.customerId]);
      const txId = `ltx_${uuidv4().substring(0, 8)}`;
      sqliteDb.run(`
        INSERT INTO loyalty_transactions (id, customer_id, type, points, reference_type, reference_id, description, created_by, created_at)
        VALUES (?, ?, 'REDEEM', ?, ?, ?, ?, ?, ?)
      `, [txId, dto.customerId, -dto.points, dto.referenceType || null, dto.referenceId || null, dto.description || `استبدال نقاط ولاء (${dto.points} نقطة)`, actor.id, now]);
      return {
        loyalty: this.getCustomerLoyalty(dto.customerId)!,
        transaction: this.getLoyaltyTransactionById(txId)!,
      };
    });
  }

  public getLoyaltyTransactions(customerId?: string, limit = 100): LoyaltyTransaction[] {
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
}