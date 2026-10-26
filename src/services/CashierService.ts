import { DatabaseManager } from '../database/db';
import type { CashRegister, CashShift, Expense, ExpenseCategory, PaymentType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { paymentAccountCode, postLedgerEntry, reverseLedgerEntry } from '../database/ledger';

export class CashierService {
  private db = DatabaseManager.getInstance();
  private static readonly AUTO_CLOSE_ENABLED_KEY = 'cashShiftAutoCloseEnabled';
  private static readonly AUTO_CLOSE_TIME_KEY = 'cashShiftAutoCloseTime';

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

  public getLastClosedShift(registerId: string): CashShift | null {
    const rows = this.db.query<CashShift>(`
      SELECT cs.*, cr.name as registerName, u.full_name as userName
      FROM cash_shifts cs
      JOIN cash_registers cr ON cs.register_id = cr.id
      JOIN users u ON cs.user_id = u.id
      WHERE cs.register_id = ? AND cs.status = 'CLOSED'
      ORDER BY cs.closed_at DESC LIMIT 1
    `, [registerId]);
    return rows[0] || null;
  }

  public getSuggestedOpeningBalance(registerId: string): number {
    const lastShift = this.getLastClosedShift(registerId);
    if (lastShift) {
      return Number(lastShift.actualEndingCash ?? lastShift.expectedEndingCash ?? 0);
    }
    const register = this.db.query<{ currentBalance: number }>(
      'SELECT current_balance AS currentBalance FROM cash_registers WHERE id = ?',
      [registerId]
    )[0];
    return Number(register?.currentBalance || 0);
  }

  public getShiftAutoCloseSchedule(): { enabled: boolean; closeTime: string } {
    const rows = this.db.query<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE key IN (?, ?)`,
      [CashierService.AUTO_CLOSE_ENABLED_KEY, CashierService.AUTO_CLOSE_TIME_KEY]
    );
    const enabledValue = rows.find((row) => row.key === CashierService.AUTO_CLOSE_ENABLED_KEY)?.value;
    const timeValue = rows.find((row) => row.key === CashierService.AUTO_CLOSE_TIME_KEY)?.value;
    return {
      enabled: enabledValue !== '0',
      closeTime: /^\d{2}:\d{2}$/.test(timeValue || '')
        ? timeValue!
        : '23:59',
    };
  }

  public saveShiftAutoCloseSchedule(enabled: boolean, closeTime: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'cashier.shift');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(closeTime)) {
      throw new Error('أدخل وقت إغلاق صحيحًا بصيغة الساعة والدقيقة.');
    }
    const schedule = this.getShiftAutoCloseSchedule();
    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
        CashierService.AUTO_CLOSE_ENABLED_KEY, enabled ? '1' : '0',
      ]);
      sqliteDb.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
        CashierService.AUTO_CLOSE_TIME_KEY, closeTime,
      ]);
      sqliteDb.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, new_values)
         VALUES (?, ?, ?, 'تعديل جدول إغلاق الورديات', 'CASHIER', ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
          JSON.stringify({ before: schedule, after: { enabled, closeTime } })]
      );
    });
  }

  public closeScheduledShifts(now = new Date()): CashShift[] {
    const schedule = this.getShiftAutoCloseSchedule();
    if (!schedule.enabled) return [];
    const [hours, minutes] = schedule.closeTime.split(':').map(Number);
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    if (now < cutoff) cutoff.setDate(cutoff.getDate() - 1);

    const shifts = this.db.query<CashShift>(`
      SELECT * FROM cash_shifts
      WHERE status = 'OPEN'
      ORDER BY opened_at ASC
    `);
    const cutoffTimestamp = cutoff.getTime();
    return shifts
      .filter((shift) => {
        const openedAtValue = String(shift.openedAt).replace(' ', 'T');
        const openedAt = new Date(
          /(?:Z|[+-]\d{2}:\d{2})$/i.test(openedAtValue) ? openedAtValue : `${openedAtValue}Z`
        );
        return !Number.isNaN(openedAt.getTime()) && openedAt.getTime() <= cutoffTimestamp;
      })
      .map((shift) => this.closeShiftInternal(
        shift.id,
        null,
        `إغلاق تلقائي حسب الجدول (${schedule.closeTime})`,
        shift.userId,
        true
      ));
  }

  public openShift(registerId: string, userId: string, openingBalance: number): CashShift {
    PermissionService.require(AuthService.requireAuth(), 'cashier.shift');
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      throw new Error('الرصيد الافتتاحي يجب أن يكون رقمًا صحيحًا غير سالب.');
    }
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
    PermissionService.require(AuthService.requireAuth(), 'cashier.shift');
    if (!Number.isFinite(actualEndingCash) || actualEndingCash < 0) {
      throw new Error('المبلغ الفعلي يجب أن يكون رقمًا صحيحًا غير سالب.');
    }
    return this.closeShiftInternal(shiftId, actualEndingCash, closingNotes, performedBy, false);
  }

  private calculateExpectedEndingCash(shift: CashShift): number {
    return Number((
      shift.openingBalance +
      shift.totalSalesCash +
      shift.totalCustomerPayments -
      shift.totalSupplierPayments -
      shift.totalExpenses -
      shift.totalRefunds
    ).toFixed(2));
  }

  private closeShiftInternal(
    shiftId: string,
    actualEndingCash: number | null,
    closingNotes: string,
    performedBy: string,
    autoClosed: boolean
  ): CashShift {
    return this.db.executeTransaction((sqliteDb) => {
      const shift = this.db.query<CashShift>(
        `SELECT * FROM cash_shifts WHERE id = ? AND status = 'OPEN'`,
        [shiftId]
      )[0];
      if (!shift) throw new Error('الوردية غير موجودة أو مغلقة مسبقاً.');
      const expected = this.calculateExpectedEndingCash(shift);
      const diff = actualEndingCash === null
        ? null
        : Number((actualEndingCash - expected).toFixed(2));

      sqliteDb.run(`
        UPDATE cash_shifts SET
          closed_at = CURRENT_TIMESTAMP,
          expected_ending_cash = ?,
          actual_ending_cash = ?,
          cash_difference = ?,
          status = 'CLOSED',
          closing_notes = ?,
          auto_closed = ?
        WHERE id = ?
      `, [expected, actualEndingCash, diff, closingNotes, autoClosed ? 1 : 0, shiftId]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, ?, 'CASHIER', ?, ?)
      `, [
        `aud_${uuidv4().substring(0, 8)}`,
        performedBy,
        autoClosed ? 'النظام - إغلاق تلقائي' : 'الكاشير',
        autoClosed ? 'إغلاق وردية تلقائي' : 'إغلاق وردية الكاشير',
        shiftId,
        JSON.stringify({ expected, actualEndingCash, diff, autoClosed }),
      ]);

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
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'cashier.expense');
    if (amount <= 0) throw new Error('مبلغ المصروف يجب أن يكون أكبر من الصفر.');

    const expId = `exp_${uuidv4().substring(0, 8)}`;
    const today = localDateString();

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
      postLedgerEntry(sqliteDb.getDatabase(), {
        date: today,
        description,
        referenceType: 'EXPENSE',
        referenceId: expId,
        createdBy: actor.id,
        lines: [
          { accountCode: '5201', debit: amount, credit: 0 },
          { accountCode: paymentAccountCode(paymentType), debit: 0, credit: amount },
        ],
      });
      sqliteDb.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'تسجيل مصروف', 'CASHIER', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, expId, JSON.stringify({ category, amount, description, paymentType })]
      );

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

  public updateExpense(
    id: string,
    patch: { category: string; amount: number; description: string; recipient?: string; paymentType: PaymentType; registerId?: string }
  ): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'cashier.expense');
    const current = this.db.query<any>('SELECT * FROM expenses WHERE id = ?', [id])[0];
    if (!current) throw new Error('المصروف غير موجود.');
    if (!patch.description.trim()) throw new Error('بيان المصروف مطلوب.');
    if (!patch.amount || patch.amount <= 0) throw new Error('أدخل مبلغًا صحيحًا أكبر من صفر.');

    const registerId = patch.registerId || current.register_id || 'cr_main';
    this.db.executeTransaction((db) => {
      const ledgerDb = db.getDatabase();
      const currentPosting = ledgerDb.exec(`
        SELECT id FROM journal_entries
        WHERE ((reference_type = 'EXPENSE' AND reference_id = ?)
           OR (reference_type = 'EXPENSE_EDIT' AND reference_id LIKE ?))
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries reversal
            WHERE reversal.reference_type = 'EXPENSE_REVERSAL'
              AND reversal.reference_id LIKE journal_entries.id || ':%'
          )
        ORDER BY created_at DESC, id DESC LIMIT 1
      `, [id, `${id}:%`])[0]?.values[0]?.[0];
      if (currentPosting) {
        reverseLedgerEntry(ledgerDb, String(currentPosting), {
          date: localDateString(), description: `Reverse expense ${current.description}`,
          referenceType: 'EXPENSE_REVERSAL', referenceId: `${currentPosting}:${uuidv4()}`, createdBy: actor.id,
        });
      }
      if (current.payment_type === 'CASH') {
        db.run('UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?', [current.amount, current.register_id]);
        if (current.shift_id) {
          db.run('UPDATE cash_shifts SET total_expenses = total_expenses - ? WHERE id = ?', [current.amount, current.shift_id]);
        }
      }
      if (patch.paymentType === 'CASH') {
        db.run('UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?', [patch.amount, registerId]);
        if (current.shift_id) {
          db.run('UPDATE cash_shifts SET total_expenses = total_expenses + ? WHERE id = ?', [patch.amount, current.shift_id]);
        }
      }
      db.run(
        `UPDATE expenses SET category = ?, amount = ?, description = ?, recipient = ?, payment_type = ?, register_id = ?
         WHERE id = ?`,
        [patch.category, patch.amount, patch.description.trim(), patch.recipient || null, patch.paymentType, registerId, id]
      );
      postLedgerEntry(ledgerDb, {
        date: localDateString(), description: patch.description.trim(),
        referenceType: 'EXPENSE_EDIT', referenceId: `${id}:${uuidv4()}`, createdBy: actor.id,
        lines: [
          { accountCode: '5201', debit: patch.amount, credit: 0 },
          { accountCode: paymentAccountCode(patch.paymentType), debit: 0, credit: patch.amount },
        ],
      });
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, 'تعديل مصروف', 'CASHIER', ?, ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
          JSON.stringify({ amount: current.amount, category: current.category, description: current.description }),
          JSON.stringify({ amount: patch.amount, category: patch.category, description: patch.description }),
        ]
      );
    });
  }

  public deleteExpense(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'cashier.manage');
    const expense = this.db.query<any>('SELECT * FROM expenses WHERE id = ?', [id])[0];
    if (!expense) throw new Error('المصروف غير موجود.');

    this.db.executeTransaction((db) => {
      const ledgerDb = db.getDatabase();
      const currentPosting = ledgerDb.exec(`
        SELECT id FROM journal_entries
        WHERE ((reference_type = 'EXPENSE' AND reference_id = ?)
           OR (reference_type = 'EXPENSE_EDIT' AND reference_id LIKE ?))
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries reversal
            WHERE reversal.reference_type = 'EXPENSE_REVERSAL'
              AND reversal.reference_id LIKE journal_entries.id || ':%'
          )
        ORDER BY created_at DESC, id DESC LIMIT 1
      `, [id, `${id}:%`])[0]?.values[0]?.[0];
      if (currentPosting) {
        reverseLedgerEntry(ledgerDb, String(currentPosting), {
          date: localDateString(), description: `Reverse deleted expense ${expense.description}`,
          referenceType: 'EXPENSE_REVERSAL', referenceId: `${currentPosting}:${uuidv4()}`, createdBy: actor.id,
        });
      }
      if (expense.payment_type === 'CASH') {
        db.run('UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?', [expense.amount, expense.register_id]);
        if (expense.shift_id) {
          db.run('UPDATE cash_shifts SET total_expenses = total_expenses - ? WHERE id = ?', [expense.amount, expense.shift_id]);
        }
      }
      db.run('DELETE FROM expenses WHERE id = ?', [id]);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values)
         VALUES (?, ?, ?, 'حذف مصروف', 'CASHIER', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
          JSON.stringify({ category: expense.category, amount: expense.amount, description: expense.description }),
        ]
      );
    });
  }
}
