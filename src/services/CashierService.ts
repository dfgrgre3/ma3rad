import { DatabaseManager } from '../database/db';
import type { CashRegister, CashShift, Expense, ExpenseCategory, PaymentType } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class CashierService {
  private db = DatabaseManager.getInstance();

  public getAllRegisters(): CashRegister[] {
    return this.db.query<CashRegister>(`SELECT * FROM cash_registers WHERE is_active = 1`);
  }

  public getActiveShift(userId?: string): CashShift | null {
    let sql = `
      SELECT cs.*, cr.name as registerName, u.full_name as userName
      FROM cash_shifts cs
      JOIN cash_registers cr ON cs.register_id = cr.id
      JOIN users u ON cs.user_id = u.id
      WHERE cs.status = 'OPEN'
    `;
    const params: any[] = [];
    if (userId) {
      sql += ` AND cs.user_id = ?`;
      params.push(userId);
    }
    sql += ` ORDER BY cs.opened_at DESC LIMIT 1`;

    const rows = this.db.query<CashShift>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  public openShift(registerId: string, userId: string, openingBalance: number): CashShift {
    const existing = this.getActiveShift(userId);
    if (existing) {
      throw new Error(`توجد وردية مفتوحة بالفعل للكاشير (${existing.shiftNumber}). يجب إغلاقها أولاً.`);
    }

    const shiftId = `shf_${uuidv4().substring(0, 8)}`;
    const shiftNumber = `SHF-${Date.now().toString().slice(-6)}`;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`
        INSERT INTO cash_shifts (
          id, shift_number, register_id, user_id, opening_balance, expected_ending_cash, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
      `, [shiftId, shiftNumber, registerId, userId, openingBalance, openingBalance]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id)
        VALUES (?, ?, 'الكاشير', 'فتح وردية جديدة', 'CASHIER', ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, userId, shiftId]);

      return this.getActiveShift(userId)!;
    });
  }

  public closeShift(shiftId: string, actualEndingCash: number, closingNotes = '', performedBy = 'usr_admin'): CashShift {
    const rows = this.db.query<CashShift>(`SELECT * FROM cash_shifts WHERE id = ? AND status = 'OPEN'`, [shiftId]);
    if (rows.length === 0) throw new Error('الوردية غير موجودة أو مغلقة مسبقاً.');

    const shift = rows[0];
    const expected = Number((
      shift.openingBalance +
      shift.totalSalesCash +
      shift.totalCustomerPayments -
      shift.totalSupplierPayments -
      shift.totalExpenses -
      shift.totalRefunds
    ).toFixed(2));

    const diff = Number((actualEndingCash - expected).toFixed(2));

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`
        UPDATE cash_shifts SET
          closed_at = CURRENT_TIMESTAMP,
          expected_ending_cash = ?,
          actual_ending_cash = ?,
          cash_difference = ?,
          status = 'CLOSED',
          closing_notes = ?
        WHERE id = ?
      `, [expected, actualEndingCash, diff, closingNotes, shiftId]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, 'الكاشير', 'إغلاق وردية الكاشير', 'CASHIER', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, shiftId, JSON.stringify({ expected, actualEndingCash, diff })]);

      return this.db.query<CashShift>(`SELECT * FROM cash_shifts WHERE id = ?`, [shiftId])[0];
    });
  }

  public getExpenseCategories(): ExpenseCategory[] {
    return this.db.query<ExpenseCategory>(`SELECT * FROM expense_categories ORDER BY name ASC`);
  }

  public getAllExpenses(dateFrom?: string, dateTo?: string): Expense[] {
    let sql = `
      SELECT e.*, u.full_name as performedByName
      FROM expenses e
      LEFT JOIN users u ON e.performed_by = u.id
    `;
    const params: any[] = [];

    if (dateFrom) {
      sql += ` WHERE e.date >= ?`;
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += (dateFrom ? ' AND' : ' WHERE') + ` e.date <= ?`;
      params.push(dateTo);
    }

    sql += ` ORDER BY e.created_at DESC`;
    return this.db.query<Expense>(sql, params);
  }

  public addExpense(
    category: string,
    amount: number,
    description: string,
    registerId = 'cr_main',
    shiftId?: string,
    paymentType: PaymentType = 'CASH',
    recipient = '',
    performedBy = 'usr_admin'
  ): Expense {
    if (amount <= 0) throw new Error('مبلغ المصروف يجب أن يكون أكبر من الصفر.');

    const expId = `exp_${uuidv4().substring(0, 8)}`;
    const today = new Date().toISOString().slice(0, 10);

    return this.db.executeTransaction((sqliteDb) => {
      // 1. Insert Expense
      sqliteDb.run(`
        INSERT INTO expenses (
          id, category, amount, register_id, shift_id, payment_type, date, recipient, description, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [expId, category, amount, registerId, shiftId || null, paymentType, today, recipient || null, description, performedBy]);

      // 2. Deduct from Cash register if cash
      if (paymentType === 'CASH') {
        sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`, [amount, registerId]);
      }

      // 3. Update shift if active
      if (shiftId) {
        sqliteDb.run(`UPDATE cash_shifts SET total_expenses = total_expenses + ? WHERE id = ?`, [amount, shiftId]);
      }

      return {
        id: expId,
        category,
        amount,
        registerId,
        shiftId,
        paymentType,
        date: today,
        recipient,
        description,
        performedBy,
        createdAt: new Date().toISOString()
      };
    });
  }
}
