import { v4 as uuidv4 } from 'uuid';
import { unscaleMoneyRow } from '../../../../utils/money';
import { ExtrasTaxBase } from './tax';
import { round2 } from './types';
import type { Cheque, ChequeStatus } from './types';

export abstract class ExtrasChequesBase extends ExtrasTaxBase {
  // ─── Cheques ────────────────────────────────────────────────────────────────

  getCheques(): Cheque[] {
    this.requireView();
    return this.db.query<Cheque>('SELECT * FROM cheques ORDER BY due_date ASC, created_at DESC').map((row) => unscaleMoneyRow(row, ['amount', 'bounce_fee']));
  }

  saveCheque(input: Partial<Cheque> & { chequeNumber: string; partyName: string; amount: number; dueDate: string }): void {
    const actor = this.requireManage();
    if (!input.chequeNumber.trim()) throw new Error('رقم الشيك مطلوب.');
    if (!input.partyName.trim()) throw new Error('اسم الطرف مطلوب.');
    if (!(Number(input.amount) > 0)) throw new Error('قيمة الشيك يجب أن تكون أكبر من صفر.');
    if (!input.dueDate) throw new Error('تاريخ الاستحقاق مطلوب.');
    const values = [
      input.chequeNumber.trim(),
      input.type || 'RECEIVED',
      input.partyType || 'OTHER',
      input.partyId || null,
      input.partyName.trim(),
      input.bankName || null,
      round2(Number(input.amount)),
      input.dueDate,
      input.status || 'PENDING',
      input.notes || null,
    ];
    if (input.id) {
      this.db.run(
        `UPDATE cheques SET cheque_number = ?, type = ?, party_type = ?, party_id = ?, party_name = ?, bank_name = ?,
           amount = ROUND(?*100), due_date = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, input.id]
      );
    } else {
      this.db.run(
        `INSERT INTO cheques (id, cheque_number, type, party_type, party_id, party_name, bank_name, amount, due_date, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?)`,
        [`chq_${uuidv4().substring(0, 8)}`, ...values, actor.id]
      );
    }
  }

  setChequeStatus(id: string, status: ChequeStatus): void {
    this.requireManage();
    this.db.run('UPDATE cheques SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  }

  deleteCheque(id: string): void {
    this.requireManage();
    this.db.run('DELETE FROM cheques WHERE id = ?', [id]);
  }
}
