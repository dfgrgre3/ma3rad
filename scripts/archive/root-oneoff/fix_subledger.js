const fs = require('fs');
const f = 'src/services/domains/finance/FinancePeriodCloseService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) { console.log('MISS:', a.slice(0, 70)); return; } s = s.split(a).join(b); };

rep(`          SELECT verified_subledger_balance AS verifiedSubledgerBalance,
                 control_balance AS controlBalance,
                 evidence_reference AS evidenceReference,
                 created_at AS createdAt
          FROM finance_subledger_manual_reconciliations`,
`          SELECT verified_subledger_balance / 100.0 AS verifiedSubledgerBalance,
                 control_balance / 100.0 AS controlBalance,
                 evidence_reference AS evidenceReference,
                 created_at AS createdAt
          FROM finance_subledger_manual_reconciliations`);

rep(`          SELECT balance FROM finance_subledger_control_baselines`,
`          SELECT balance / 100.0 AS balance FROM finance_subledger_control_baselines`);

rep(`                   SELECT SUM(balance) FROM finance_subledger_party_baselines`,
`                   SELECT SUM(balance) / 100.0 FROM finance_subledger_party_baselines`);

rep(`      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    \`, [
      \`fsmr_\${uuidv4().slice(0, 12)}\`, periodId, companyId, partyType,
      verifiedBalance, controlBalance, evidenceReference.trim(), notes?.trim() || null,`,
`      VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?)
    \`, [
      \`fsmr_\${uuidv4().slice(0, 12)}\`, periodId, companyId, partyType,
      verifiedBalance, controlBalance, evidenceReference.trim(), notes?.trim() || null,`);

rep(`        SELECT party_type AS partyType,
               verified_subledger_balance AS verifiedSubledgerBalance,
               control_balance AS controlBalance,`,
`        SELECT party_type AS partyType,
               verified_subledger_balance / 100.0 AS verifiedSubledgerBalance,
               control_balance / 100.0 AS controlBalance,`);

rep(`             ROUND(COALESCE(b.balance, 0) + COALESCE(SUM(e.amount), 0), 2) AS balance`,
`             ROUND((COALESCE(b.balance, 0) + COALESCE(SUM(e.amount), 0)) / 100.0, 2) AS balance`);

fs.writeFileSync(f, s);
console.log('done');
