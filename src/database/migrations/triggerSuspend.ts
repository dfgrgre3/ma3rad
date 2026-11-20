/**
 * Runs `fn` with every trigger that mentions `table` temporarily dropped.
 *
 * Money-conversion migrations UPDATE rows in ledger tables whose immutability
 * triggers ("... is immutable. Update is prohibited.") would abort those
 * UPDATEs. The triggers are always recreated afterwards, even if `fn` throws.
 */
export function withTableTriggersSuspended<T>(db: any, table: string, fn: () => T): T {
  const triggers = db.exec(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL AND sql LIKE ?`,
    [`%${table}%`]
  )[0]?.values || [];

  for (const [triggerName] of triggers) {
    db.exec(`DROP TRIGGER IF EXISTS "${String(triggerName)}"`);
  }

  try {
    return fn();
  } finally {
    for (const [triggerName, sql] of triggers) {
      db.exec(`DROP TRIGGER IF EXISTS "${String(triggerName)}"`);
      db.exec(String(sql));
    }
  }
}
