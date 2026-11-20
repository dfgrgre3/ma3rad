const fs = require('fs');
const f = 'src/services/domains/projects/ProjectService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) { console.log('MISS:', JSON.stringify(a.slice(0, 80))); return; }
  s = s.split(a).join(b);
};

rep("import { ModuleRegistryService } from '../config/ModuleRegistryService';",
    "import { ModuleRegistryService } from '../config/ModuleRegistryService';\nimport { unscaleMoneyRow } from '../../../utils/money';");
rep("export type ProjectStatus",
    "const PROJECT_MONEY_FIELDS = ['contract_value', 'total_sold', 'total_paid', 'outstanding_amount'] as const;\nconst PROJECT_PRODUCT_MONEY_FIELDS = ['agreed_price_m2'] as const;\nconst PROJECT_BUDGET_MONEY_FIELDS = ['planned_amount', 'actual_amount'] as const;\nconst CHANGE_REQUEST_MONEY_FIELDS = ['cost_impact'] as const;\n\nexport type ProjectStatus");

// scopedProject single-row read
rep("    if (rows.length === 0) return null;\n    return { ...rows[0], progress: this.computeProgress(rows[0]) };",
    "    if (rows.length === 0) return null;\n    const project = unscaleMoneyRow(rows[0], PROJECT_MONEY_FIELDS);\n    return { ...project, progress: this.computeProgress(project) };");

// getProjects list read
rep("    return this.db.query<Project>(sql, params).map((p) => ({\n      ...p,\n      progress: this.computeProgress(p),\n    }));",
    "    return this.db.query<Project>(sql, params)\n      .map((p) => unscaleMoneyRow(p, PROJECT_MONEY_FIELDS))\n      .map((p) => ({\n        ...p,\n        progress: this.computeProgress(p),\n      }));");

// INSERT projects: contract_value(pos15), outstanding_amount(pos16)
rep("contract_value, outstanding_amount, status, notes, created_by\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`",
    "contract_value, outstanding_amount, status, notes, created_by\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?)`");

// UPDATE projects money COALESCE
rep("actual_end_date = ?, contract_value = COALESCE(?, contract_value),\n        total_paid = COALESCE(?, total_paid), outstanding_amount = COALESCE(?, outstanding_amount),",
    "actual_end_date = ?, contract_value = COALESCE(ROUND(?*100), contract_value),\n        total_paid = COALESCE(ROUND(?*100), total_paid), outstanding_amount = COALESCE(ROUND(?*100), outstanding_amount),");

// project_products INSERT agreed_price_m2 (pos7 of 8)
rep("planned_quantity_m2, agreed_price_m2, notes)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`",
    "planned_quantity_m2, agreed_price_m2, notes)\n       VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?)`");

// project_products UPDATE
rep("agreed_price_m2 = COALESCE(?, agreed_price_m2),", "agreed_price_m2 = COALESCE(ROUND(?*100), agreed_price_m2),");

// project_products SELECT * reads
rep("`SELECT pp.*, u.name AS unit_name FROM project_products pp\n       LEFT JOIN project_units u ON u.id = pp.unit_id\n       WHERE pp.project_id = ? ORDER BY pp.created_at`,\n      [projectId]\n    );",
    "`SELECT pp.*, u.name AS unit_name FROM project_products pp\n       LEFT JOIN project_units u ON u.id = pp.unit_id\n       WHERE pp.project_id = ? ORDER BY pp.created_at`,\n      [projectId]\n    ).map((row) => unscaleMoneyRow(row, PROJECT_PRODUCT_MONEY_FIELDS));");
rep("return this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0];",
    "return unscaleMoneyRow(this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0], PROJECT_PRODUCT_MONEY_FIELDS);");
// the two `const existing = ... SELECT * FROM project_products` reads
rep("const existing = this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0];",
    "const existing = unscaleMoneyRow(this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0], PROJECT_PRODUCT_MONEY_FIELDS);");

// budget lines INSERT planned/actual (pos5,6 of 9)
rep("planned_amount, actual_amount, notes, created_at, updated_at\n       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`",
    "planned_amount, actual_amount, notes, created_at, updated_at\n       ) VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?)`");

// budget lines UPDATE
rep("planned_amount = COALESCE(?, planned_amount), actual_amount = COALESCE(?, actual_amount),",
    "planned_amount = COALESCE(ROUND(?*100), planned_amount), actual_amount = COALESCE(ROUND(?*100), actual_amount),");

// budget lines SELECT * reads
rep("`SELECT * FROM project_budget_lines WHERE project_id = ? ORDER BY category, created_at`,",
    "`SELECT * FROM project_budget_lines WHERE project_id = ? ORDER BY category, created_at`,");
// handle list query wrapping: find its .map or return — patch individually below
rep("return this.db.query<ProjectBudgetLine>(`SELECT * FROM project_budget_lines WHERE id = ?`, [id])[0];",
    "return unscaleMoneyRow(this.db.query<ProjectBudgetLine>(`SELECT * FROM project_budget_lines WHERE id = ?`, [id])[0], PROJECT_BUDGET_MONEY_FIELDS);");

// change request INSERT cost_impact (pos5 of 10)
rep("cost_impact, time_impact_days, status,\n         requested_by, created_at, updated_at\n       ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`",
    "cost_impact, time_impact_days, status,\n         requested_by, created_at, updated_at\n       ) VALUES (?, ?, ?, ?, ROUND(?*100), ?, 'PENDING', ?, ?, ?)`");

// change requests list SELECT c.* -> unscale
rep("      WHERE c.project_id = ?\n       ORDER BY CASE c.status WHEN 'PENDING' THEN 0 ELSE 1 END, c.created_at DESC`,\n      [projectId]\n    );",
    "      WHERE c.project_id = ?\n       ORDER BY CASE c.status WHEN 'PENDING' THEN 0 ELSE 1 END, c.created_at DESC`,\n      [projectId]\n    ).map((row) => unscaleMoneyRow(row, CHANGE_REQUEST_MONEY_FIELDS));");

fs.writeFileSync(f, s);
console.log('done');
