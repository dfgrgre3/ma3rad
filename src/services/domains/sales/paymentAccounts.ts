import type { DatabaseManager } from '../../../database/repositories/databaseManager';

export function getActiveBankAccount(db: DatabaseManager, bankAccountId?: string | null): { id: string; glAccountCode: string } {
  if (!bankAccountId) throw new Error('Select the bank account used for this payment.');
  const account = db.query<{ id: string; glAccountCode: string }>(
    `SELECT ba.id, coa.code AS glAccountCode
     FROM bank_accounts ba JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
     WHERE ba.id = ? AND ba.is_active = 1`, [bankAccountId]
  )[0];
  if (!account) throw new Error('The selected bank account is unavailable or inactive.');
  return account;
}

export function updateBankBalance(db: DatabaseManager, bankAccountId: string, amount: number): void {
  db.run('UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ? AND is_active = 1', [amount, bankAccountId]);
  if (Number((db.getDatabase() as any).getRowsModified?.() ?? 0) !== 1) {
    throw new Error('The selected bank account balance could not be updated.');
  }
}
