import { v4 as uuidv4 } from "uuid";
import { DatabaseManager } from "../../../../database/repositories/databaseManager";
import { AuthService } from "../../../../services/domains/auth/AuthService";
import { PermissionService } from "../../../../services/domains/auth/PermissionService";
import type { PromiseFormState, PromiseRow } from "./types";

export function recordPaymentPromise(
  promiseCustomerId: string,
  promiseForm: PromiseFormState,
): PromiseRow[] {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, "customers.update");
  const promiseId = `promise_${uuidv4().slice(0, 10)}`;
  const db = DatabaseManager.getInstance();
  db.executeTransaction((tx) => {
    tx.run(
      `INSERT INTO customer_payment_promises (id,customer_id,promised_amount,promise_date,followup_date,notes,created_by) VALUES (?,?,ROUND(?*100),?,?,?,?,?)`,
      [
        promiseId,
        promiseCustomerId,
        promiseForm.amount ? Number(promiseForm.amount) : null,
        promiseForm.promiseDate || null,
        promiseForm.followupDate || null,
        promiseForm.notes || null,
        actor.id,
      ],
    );
    tx.run(
      `INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
      [
        `aud_${uuidv4().slice(0, 8)}`,
        actor.id,
        actor.fullName,
        "تسجيل وعد سداد",
        "CUSTOMERS",
        promiseCustomerId,
        JSON.stringify(promiseForm),
      ],
    );
  });
  return db.query<PromiseRow>(
    `SELECT id,promised_amount / 100.0 AS promisedAmount,promise_date AS promiseDate,followup_date AS followupDate,status,notes FROM customer_payment_promises WHERE customer_id=? ORDER BY created_at DESC`,
    [promiseCustomerId],
  );
}
