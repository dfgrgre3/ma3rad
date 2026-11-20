const fs = require('fs');
const f = 'src/services/domains/projects/ProjectExecutionService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) { console.log('MISS:', JSON.stringify(a.slice(0, 80))); return; }
  s = s.split(a).join(b);
};

rep("import type { ApartmentEstimateVersion } from '../../../types/projects/apartmentEstimate';",
    "import type { ApartmentEstimateVersion } from '../../../types/projects/apartmentEstimate';\nimport { unscaleMoneyRow } from '../../../utils/money';");
rep("type EstimateRow",
    "const CONTRACT_MONEY_FIELDS = ['contract_value'] as const;\nconst CERTIFICATE_MONEY_FIELDS = ['requested_amount', 'approved_amount', 'paid_amount'] as const;\nconst COST_ENTRY_MONEY_FIELDS = ['amount'] as const;\n\ntype EstimateRow");

// createContract INSERT contract_value (pos7 of 10)
rep("contract_number, contract_date, contract_value, terms, quotation_id, created_by)\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`",
    "contract_number, contract_date, contract_value, terms, quotation_id, created_by)\n         VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?)`");
// createContract UPDATE projects.contract_value
rep("UPDATE projects SET contract_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [amount, input.projectId]",
    "UPDATE projects SET contract_value = ROUND(?*100), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [amount, input.projectId]");

// getContracts c.*
rep("LEFT JOIN quotations q ON q.id = c.quotation_id WHERE c.project_id = ? ORDER BY c.created_at DESC`, [projectId]\n    );",
    "LEFT JOIN quotations q ON q.id = c.quotation_id WHERE c.project_id = ? ORDER BY c.created_at DESC`, [projectId]\n    ).map((row) => unscaleMoneyRow(row, CONTRACT_MONEY_FIELDS));");

// getCertificates c.*
rep("WHERE c.project_id = ? ORDER BY c.certificate_date DESC, c.created_at DESC`, [projectId]\n    );",
    "WHERE c.project_id = ? ORDER BY c.certificate_date DESC, c.created_at DESC`, [projectId]\n    ).map((row) => unscaleMoneyRow(row, CERTIFICATE_MONEY_FIELDS));");

// createCertificate: contractValue sum -> major
rep("`SELECT contract_value AS amount FROM project_estimate_contracts WHERE project_id = ? AND status <> 'CANCELLED'`",
    "`SELECT contract_value / 100.0 AS amount FROM project_estimate_contracts WHERE project_id = ? AND status <> 'CANCELLED'`");
// approved certificates SUM -> major
rep("`SELECT COALESCE(SUM(approved_amount), 0) AS amount FROM project_payment_certificates WHERE project_id = ? AND status IN ('APPROVED','PAID')`",
    "`SELECT COALESCE(SUM(approved_amount), 0) / 100.0 AS amount FROM project_payment_certificates WHERE project_id = ? AND status IN ('APPROVED','PAID')`");
// certificate INSERT requested_amount (pos12 of 13)
rep("progress_percent, requested_amount, created_by)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`",
    "progress_percent, requested_amount, created_by)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?)`");

// reviewCertificate: unscale row + ROUND write
rep("const row = this.db.query<any>('SELECT * FROM project_payment_certificates WHERE id = ?', [id])[0];\n    if (!row) throw new Error('المستخلص غير موجود.');",
    "const row = unscaleMoneyRow(this.db.query<any>('SELECT * FROM project_payment_certificates WHERE id = ?', [id])[0], CERTIFICATE_MONEY_FIELDS);\n    if (!row) throw new Error('المستخلص غير موجود.');");
rep("approved_amount = ?, review_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,\n      [decision, decision === 'APPROVED' ? Number(row.requested_amount) : null, notes.trim() || null, actor.id, id]",
    "approved_amount = ROUND(?*100), review_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,\n      [decision, decision === 'APPROVED' ? Number(row.requested_amount) : null, notes.trim() || null, actor.id, id]");

// recordCertificatePayment: unscale row, ROUND write, fix status CASE (approved_amount is piastres)
rep("const row = this.db.query<any>('SELECT * FROM project_payment_certificates WHERE id = ?', [id])[0];\n    if (!row || !['APPROVED', 'PAID'].includes(row.status))",
    "const row = unscaleMoneyRow(this.db.query<any>('SELECT * FROM project_payment_certificates WHERE id = ?', [id])[0], CERTIFICATE_MONEY_FIELDS);\n    if (!row || !['APPROVED', 'PAID'].includes(row.status))");
rep("`UPDATE project_payment_certificates SET paid_amount = ?, payment_reference = ?, paid_at = CURRENT_TIMESTAMP,\n       status = CASE WHEN ? + 0.005 >= approved_amount THEN 'PAID' ELSE 'APPROVED' END WHERE id = ?`,\n      [Number(paid.toFixed(2)), reference.trim() || null, paid, id]",
    "`UPDATE project_payment_certificates SET paid_amount = ROUND(?*100), payment_reference = ?, paid_at = CURRENT_TIMESTAMP,\n       status = CASE WHEN ? * 100 + 0.5 >= approved_amount THEN 'PAID' ELSE 'APPROVED' END WHERE id = ?`,\n      [Number(paid.toFixed(2)), reference.trim() || null, paid, id]");

// getActualCosts c.*
rep("WHERE c.project_id = ? ORDER BY c.cost_date DESC, c.created_at DESC`, [projectId]\n    );",
    "WHERE c.project_id = ? ORDER BY c.cost_date DESC, c.created_at DESC`, [projectId]\n    ).map((row) => unscaleMoneyRow(row, COST_ENTRY_MONEY_FIELDS));");

// addActualCost INSERT amount (pos8 of 11)
rep("cost_date, category, description, amount, source_type, reference_id, created_by)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`",
    "cost_date, category, description, amount, source_type, reference_id, created_by)\n       VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?)`");

// getSummary SUMs
rep("`SELECT category, SUM(amount) AS amount FROM project_actual_cost_entries WHERE project_id = ? GROUP BY category`",
    "`SELECT category, SUM(amount) / 100.0 AS amount FROM project_actual_cost_entries WHERE project_id = ? GROUP BY category`");
rep("`SELECT COALESCE(SUM(CASE WHEN status IN ('APPROVED','PAID') THEN approved_amount ELSE 0 END),0) AS approved,\n              COALESCE(SUM(paid_amount),0) AS paid FROM project_payment_certificates WHERE project_id = ?`",
    "`SELECT COALESCE(SUM(CASE WHEN status IN ('APPROVED','PAID') THEN approved_amount ELSE 0 END),0) / 100.0 AS approved,\n              COALESCE(SUM(paid_amount),0) / 100.0 AS paid FROM project_payment_certificates WHERE project_id = ?`");

fs.writeFileSync(f, s);
console.log('done');
