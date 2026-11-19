import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { assertDate, MONEY_EPSILON, money } from './money';
import { auditPartner } from './audit';
import type { PartnerActor } from './types';

type OwnershipBasis = 'AGREED_CAPITAL' | 'PAID_CONTRIBUTIONS';

export function assertOwnershipPercent(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('نسبة الشراكة يجب أن تكون بين 0 و100%.');
  }
}

export function assertOwnershipCapacity(db: DatabaseManager, companyId: string, ownership: number, exceptPartnerId?: string): void {
  const remaining = db.query<{ total: number }>(`
    SELECT COALESCE(SUM(ownership_percent), 0) AS total
    FROM business_partners
    WHERE company_id = ? AND is_active = 1 AND (? IS NULL OR id <> ?)
  `, [companyId, exceptPartnerId || null, exceptPartnerId || null])[0]?.total || 0;
  if (money(Number(remaining) + ownership) > 100 + MONEY_EPSILON) {
    throw new Error('مجموع نسب الشراكة للشركاء النشطين لا يمكن أن يتجاوز 100%.');
  }
}

export function assertProfitShareCapacity(
  db: DatabaseManager,
  companyId: string,
  profitShare: number,
  exceptPartnerId?: string
): void {
  const remaining = db.query<{ total: number }>(`
    SELECT COALESCE(SUM(profit_share_percent), 0) AS total
    FROM business_partners
    WHERE company_id = ? AND is_active = 1 AND (? IS NULL OR id <> ?)
  `, [companyId, exceptPartnerId || null, exceptPartnerId || null])[0]?.total || 0;
  if (money(Number(remaining) + profitShare) > 100 + MONEY_EPSILON) {
    throw new Error('مجموع نسب توزيع الأرباح للشركاء النشطين لا يمكن أن يتجاوز 100%.');
  }
}

export function areProfitSharesAligned(db: DatabaseManager, companyId: string, exceptPartnerId?: string): boolean {
  return db.query<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM business_partners
    WHERE company_id = ? AND is_active = 1 AND (? IS NULL OR id <> ?)
      AND ABS(profit_share_percent - ownership_percent) > ?
  `, [companyId, exceptPartnerId || null, exceptPartnerId || null, MONEY_EPSILON])[0]?.count === 0;
}

export function applyProfitShares(
  db: DatabaseManager,
  actor: PartnerActor,
  companyId: string,
  shares: Map<string, number>,
  effectiveDate: string,
  reason: string
): void {
  for (const [partnerId, share] of shares) {
    const current = db.query<{ profitSharePercent: number }>(
      'SELECT profit_share_percent AS profitSharePercent FROM business_partners WHERE id = ? AND company_id = ?',
      [partnerId, companyId]
    )[0];
    if (!current) continue;
    const next = money(share);
    if (money(Number(current.profitSharePercent)) === next) continue;
    db.run(
      'UPDATE business_partners SET profit_share_percent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [next, partnerId]
    );
    recordProfitShareHistory(
      db, actor, partnerId, companyId, Number(current.profitSharePercent), next,
      effectiveDate, reason
    );
    auditPartner(db, actor, 'تعديل نسبة توزيع أرباح الشريك', partnerId, {
      profitSharePercent: Number(current.profitSharePercent),
    }, { profitSharePercent: next, effectiveDate, reason });
  }
}

export function calculateOwnershipShares(
  db: DatabaseManager,
  companyId: string,
  basis: OwnershipBasis,
  targetPartnerId: string,
  targetCapitalAmount: number,
  targetInitialPaidAmount = 0
): Map<string, number> {
  const rows = db.query<{
    id: string;
    capitalAmount: number;
    netContributions: number;
  }>(`
    SELECT p.id, p.capital_amount / 100.0 AS capitalAmount,
           COALESCE(SUM(CASE
             WHEN t.transaction_type = 'CAPITAL_CONTRIBUTION' THEN t.amount
             WHEN t.transaction_type = 'WITHDRAWAL' THEN -t.amount
             WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'CAPITAL_CONTRIBUTION' THEN -t.amount
             WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'WITHDRAWAL' THEN t.amount
             ELSE 0
           END), 0) / 100.0 AS netContributions
    FROM business_partners p
    LEFT JOIN partner_account_transactions t ON t.partner_id = p.id
    WHERE p.company_id = ? AND p.is_active = 1 AND p.id <> ?
    GROUP BY p.id
    ORDER BY p.id
  `, [companyId, targetPartnerId]);
  const weights = rows.map((row) => ({
    id: row.id,
    amount: Math.max(0, money(basis === 'AGREED_CAPITAL'
      ? Number(row.capitalAmount)
      : Number(row.netContributions))),
  }));
  weights.push({
    id: targetPartnerId,
    amount: Math.max(0, money(basis === 'AGREED_CAPITAL'
      ? targetCapitalAmount
      : targetInitialPaidAmount)),
  });
  const total = money(weights.reduce((sum, item) => sum + item.amount, 0));
  if (total <= 0) {
    throw new Error(basis === 'AGREED_CAPITAL'
      ? 'أدخل رأس مال متفقًا عليه أكبر من صفر لحساب نسب الملكية تلقائيًا.'
      : 'سجّل مساهمة فعلية واحدة على الأقل قبل حساب نسب الملكية من المساهمات.');
  }

  let remaining = 100;
  const shares = new Map<string, number>();
  const weighted = weights.filter((item) => item.amount > 0);
  weighted.forEach((item, index) => {
    const percent = index === weighted.length - 1
      ? money(remaining)
      : money(item.amount / total * 100);
    shares.set(item.id, percent);
    remaining = money(remaining - percent);
  });
  for (const item of weights) {
    if (!shares.has(item.id)) shares.set(item.id, 0);
  }
  return shares;
}

export function applyOwnershipShares(
  db: DatabaseManager,
  actor: PartnerActor,
  companyId: string,
  shares: Map<string, number>,
  effectiveDate: string,
  reason: string,
  excludedPartnerId?: string
): void {
  for (const [partnerId, share] of shares) {
    const current = db.query<{ ownershipPercent: number }>(
      'SELECT ownership_percent AS ownershipPercent FROM business_partners WHERE id = ? AND company_id = ?',
      [partnerId, companyId]
    )[0];
    if (!current) continue;
    const next = money(share);
    if (money(Number(current.ownershipPercent)) === next) continue;
    db.run(
      'UPDATE business_partners SET ownership_percent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [next, partnerId]
    );
    recordOwnershipHistory(
      db, actor, partnerId, companyId, Number(current.ownershipPercent), next,
      effectiveDate, reason
    );
    auditPartner(db, actor, 'تعديل نسبة ملكية الشريك', partnerId, {
      ownershipPercent: Number(current.ownershipPercent),
    }, { ownershipPercent: next, effectiveDate, reason });
  }
  if (excludedPartnerId) return;
}

export function recordOwnershipHistory(
  db: DatabaseManager,
  actor: PartnerActor,
  partnerId: string,
  companyId: string,
  oldPercent: number,
  newPercent: number,
  effectiveDate: string,
  reason: string
): void {
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('سبب تغيير نسبة الملكية مطلوب.');
  db.run(`
    INSERT INTO partner_ownership_history (
      id, partner_id, company_id, old_percent, new_percent, effective_date, reason, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    `pown_${uuidv4().slice(0, 10)}`, partnerId, companyId,
    money(oldPercent), money(newPercent), assertDate(effectiveDate), cleanReason, actor.id,
  ]);
}

export function recordCapitalHistory(
  db: DatabaseManager,
  actor: PartnerActor,
  partnerId: string,
  companyId: string,
  oldAmount: number,
  newAmount: number,
  effectiveDate: string,
  reason: string
): void {
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('سبب تغيير رأس المال مطلوب.');
  db.run(`
    INSERT INTO partner_capital_history (
      id, partner_id, company_id, old_amount, new_amount, effective_date, reason, created_by
    ) VALUES (?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?)
  `, [
    `pcap_${uuidv4().slice(0, 10)}`, partnerId, companyId,
    money(oldAmount), money(newAmount), assertDate(effectiveDate), cleanReason, actor.id,
  ]);
}

export function recordProfitShareHistory(
  db: DatabaseManager,
  actor: PartnerActor,
  partnerId: string,
  companyId: string,
  oldPercent: number,
  newPercent: number,
  effectiveDate: string,
  reason: string
): void {
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('سبب تغيير نسبة توزيع الأرباح مطلوب.');
  db.run(`
    INSERT INTO partner_profit_share_history (
      id, partner_id, company_id, old_percent, new_percent, effective_date, reason, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    `ppsh_${uuidv4().slice(0, 10)}`, partnerId, companyId,
    money(oldPercent), money(newPercent), assertDate(effectiveDate), cleanReason, actor.id,
  ]);
}

export function setOwnershipBasis(
  db: DatabaseManager,
  actor: PartnerActor,
  companyId: string,
  basis: OwnershipBasis
): void {
  db.run(`
    INSERT INTO partner_ownership_policies (company_id, basis, updated_by)
    VALUES (?, ?, ?)
    ON CONFLICT(company_id) DO UPDATE SET
      basis = excluded.basis, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
  `, [companyId, basis, actor.id]);
}

export function calculateCurrentOwnershipShares(
  db: DatabaseManager,
  companyId: string,
  basis: OwnershipBasis,
  allowNoActivePartners = false
): Map<string, number> {
  const rows = db.query<{ id: string; baseAmount: number }>(`
    SELECT p.id,
           CASE WHEN ? = 'AGREED_CAPITAL' THEN p.capital_amount
                ELSE COALESCE(SUM(CASE
                  WHEN t.transaction_type = 'CAPITAL_CONTRIBUTION' THEN t.amount
                  WHEN t.transaction_type = 'WITHDRAWAL' THEN -t.amount
                  WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'CAPITAL_CONTRIBUTION' THEN -t.amount
                  WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'WITHDRAWAL' THEN t.amount
                  ELSE 0
                END), 0)
           END AS baseAmount
    FROM business_partners p
    LEFT JOIN partner_account_transactions t ON t.partner_id = p.id
    WHERE p.company_id = ? AND p.is_active = 1
    GROUP BY p.id
    ORDER BY p.id
  `, [basis, companyId]);
  const weights = rows.map((row) => ({ id: row.id, amount: Math.max(0, money(Number(row.baseAmount))) }));
  const total = money(weights.reduce((sum, item) => sum + item.amount, 0));
  if (allowNoActivePartners && weights.length === 0) return new Map();
  if (total <= 0) {
    throw new Error(basis === 'AGREED_CAPITAL'
      ? 'لا يمكن إعادة حساب الملكية؛ إجمالي رأس المال المتفق عليه يجب أن يكون أكبر من صفر.'
      : 'لا يمكن إعادة حساب الملكية؛ سجّل مساهمات فعلية للشركاء أولًا.');
  }

  const weighted = weights.filter((item) => item.amount > 0);
  const shares = new Map<string, number>();
  let remaining = 100;
  weighted.forEach((item, index) => {
    const percent = index === weighted.length - 1
      ? money(remaining)
      : money(item.amount / total * 100);
    shares.set(item.id, percent);
    remaining = money(remaining - percent);
  });
  for (const item of weights) if (!shares.has(item.id)) shares.set(item.id, 0);
  return shares;
}

export function recalculateOwnershipAfterCapitalMovement(
  db: DatabaseManager,
  actor: PartnerActor,
  companyId: string,
  effectiveDate: string,
  reason: string
): void {
  const basis = db.query<{ basis: OwnershipBasis }>(
    'SELECT basis FROM partner_ownership_policies WHERE company_id = ?',
    [companyId]
  )[0]?.basis;
  if (basis !== 'PAID_CONTRIBUTIONS') return;
  applyOwnershipShares(
    db, actor, companyId, calculateCurrentOwnershipShares(db, companyId, basis),
    effectiveDate, reason
  );
}
