import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';

export type PayrollTaxBasis = 'GROSS' | 'BASE';
export type PayrollTaxSource = 'RULE' | 'LEGACY_FLAT' | 'EXEMPT';

export interface PayrollTaxBracketInput {
  lowerLimit: number;
  upperLimit: number | null;
  ratePercent: number;
}

export interface PayrollTaxBracket extends PayrollTaxBracketInput {
  id: string;
  ruleId: string;
  sequence: number;
}

export interface PayrollTaxRuleInput {
  name: string;
  jurisdiction?: string | null;
  taxableBasis?: PayrollTaxBasis;
  effectiveFrom: string;
  effectiveTo?: string | null;
  dependentAllowance?: number;
  isActive?: boolean;
  notes?: string | null;
  brackets: PayrollTaxBracketInput[];
}

export interface PayrollTaxRule {
  id: string;
  companyId: string;
  name: string;
  jurisdiction: string | null;
  taxableBasis: PayrollTaxBasis;
  effectiveFrom: string;
  effectiveTo: string | null;
  dependentAllowance: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  brackets: PayrollTaxBracket[];
}

export interface PayrollTaxBreakdownLine {
  sequence: number;
  lowerLimit: number;
  upperLimit: number | null;
  ratePercent: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface PayrollTaxCalculation {
  source: PayrollTaxSource;
  ruleId: string | null;
  ruleName: string;
  taxableBasis: PayrollTaxBasis;
  grossAmount: number;
  baseAmount: number;
  taxableAmount: number;
  employeeExemptionAmount: number;
  dependentAllowanceAmount: number;
  exemptionAmount: number;
  dependents: number;
  legacyRate: number;
  taxAmount: number;
  lines: PayrollTaxBreakdownLine[];
}

export interface PayrollTaxCalculationInput {
  employeeId: string;
  companyId: string | null;
  date: string;
  grossAmount: number;
  baseAmount: number;
  legacyRate: number;
}

interface EmployeeTaxProfileRow {
  taxExempt: number;
  taxExemptionAmount: number;
  taxDependents: number;
}

const MAX_DATE = '9999-12-31';

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export class PayrollTaxService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve',
    ]);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'employees.payroll.manage');
    return actor;
  }

  private static currentCompanyId(actor = AuthService.requireAuth()): string {
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const companyId = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM branches WHERE id = ?',
      [branchId]
    )[0]?.companyId;
    if (!companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة؛ لا يمكن إدارة قواعد الضريبة.');
    return companyId;
  }

  private static mapRule(row: any, brackets: PayrollTaxBracket[]): PayrollTaxRule {
    return {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      jurisdiction: row.jurisdiction ?? null,
      taxableBasis: row.taxableBasis === 'BASE' ? 'BASE' : 'GROSS',
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo ?? null,
      dependentAllowance: Number(row.dependentAllowance) || 0,
      isActive: Boolean(row.isActive),
      notes: row.notes ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      brackets,
    };
  }

  private static getBrackets(ruleId: string): PayrollTaxBracket[] {
    return this.db.query<any>(
      `SELECT id, rule_id AS ruleId, sequence, lower_limit AS lowerLimit,
              upper_limit AS upperLimit, rate_percent AS ratePercent
       FROM payroll_tax_brackets WHERE rule_id = ?
       ORDER BY lower_limit, sequence`,
      [ruleId]
    ).map((row) => ({
      id: row.id,
      ruleId: row.ruleId,
      sequence: Number(row.sequence) || 0,
      lowerLimit: Number(row.lowerLimit) || 0,
      upperLimit: row.upperLimit == null ? null : Number(row.upperLimit),
      ratePercent: Number(row.ratePercent) || 0,
    }));
  }

  static getRules(): PayrollTaxRule[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const rows = this.db.query<any>(
      `SELECT id, company_id AS companyId, name, jurisdiction, taxable_basis AS taxableBasis,
              effective_from AS effectiveFrom, effective_to AS effectiveTo,
              dependent_allowance AS dependentAllowance, is_active AS isActive,
              notes, created_at AS createdAt, updated_at AS updatedAt
       FROM payroll_tax_rules WHERE company_id = ?
       ORDER BY is_active DESC, effective_from DESC, name`,
      [companyId]
    );
    return rows.map((row) => this.mapRule(row, this.getBrackets(row.id)));
  }

  static getActiveRule(companyId: string, date: string): PayrollTaxRule | null {
    const row = this.db.query<any>(
      `SELECT id, company_id AS companyId, name, jurisdiction, taxable_basis AS taxableBasis,
              effective_from AS effectiveFrom, effective_to AS effectiveTo,
              dependent_allowance AS dependentAllowance, is_active AS isActive,
              notes, created_at AS createdAt, updated_at AS updatedAt
       FROM payroll_tax_rules
       WHERE company_id = ? AND is_active = 1
         AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
      [companyId, date, date]
    )[0];
    return row ? this.mapRule(row, this.getBrackets(row.id)) : null;
  }

  private static normalizeBrackets(brackets: PayrollTaxBracketInput[]): PayrollTaxBracketInput[] {
    if (!Array.isArray(brackets) || !brackets.length) {
      throw new Error('أضف شريحة ضريبية واحدة على الأقل.');
    }
    return brackets
      .map((bracket, index) => {
        const lowerLimit = roundMoney(Number(bracket.lowerLimit));
        const upperLimit = bracket.upperLimit == null || String(bracket.upperLimit).trim() === ''
          ? null
          : roundMoney(Number(bracket.upperLimit));
        const ratePercent = Number(bracket.ratePercent);
        if (!Number.isFinite(lowerLimit) || lowerLimit < 0) {
          throw new Error(`الحد الأدنى للشريحة ${index + 1} يجب أن يكون رقماً غير سالب.`);
        }
        if (upperLimit != null && (!Number.isFinite(upperLimit) || upperLimit <= lowerLimit)) {
          throw new Error(`الحد الأعلى للشريحة ${index + 1} يجب أن يكون أكبر من الحد الأدنى.`);
        }
        if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
          throw new Error(`نسبة الشريحة ${index + 1} يجب أن تكون بين 0 و100.`);
        }
        return { lowerLimit, upperLimit, ratePercent: roundMoney(ratePercent) };
      })
      .sort((left, right) => left.lowerLimit - right.lowerLimit)
      .map((bracket, index, sorted) => {
        if (bracket.upperLimit == null && index < sorted.length - 1) {
          throw new Error('الشريحة المفتوحة (بدون حد أعلى) يجب أن تكون الأخيرة.');
        }
        const previous = sorted[index - 1];
        if (previous && (previous.upperLimit == null || previous.upperLimit > bracket.lowerLimit)) {
          throw new Error('شرائح الضريبة متداخلة؛ اجعل كل شريحة تبدأ من نهاية الشريحة السابقة أو بعدها.');
        }
        return bracket;
      });
  }

  private static assertNoOverlappingActiveRule(
    companyId: string,
    ruleId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    isActive: boolean
  ): void {
    if (!isActive) return;
    const overlapping = this.db.query<{ name: string }>(
      `SELECT name FROM payroll_tax_rules
       WHERE company_id = ? AND is_active = 1 AND id <> ?
         AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       LIMIT 1`,
      [companyId, ruleId || '', effectiveTo || MAX_DATE, effectiveFrom]
    )[0];
    if (overlapping) {
      throw new Error(`توجد قاعدة ضريبة نشطة متداخلة مع هذه الفترة: ${overlapping.name}.`);
    }
  }

  static saveRule(input: PayrollTaxRuleInput, id?: string): PayrollTaxRule {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const name = input.name?.trim();
    if (!name) throw new Error('اسم قاعدة الضريبة مطلوب.');
    if (!isValidDate(input.effectiveFrom)) throw new Error('تاريخ بداية سريان قاعدة الضريبة غير صالح.');
    if (input.effectiveTo && !isValidDate(input.effectiveTo)) {
      throw new Error('تاريخ نهاية سريان قاعدة الضريبة غير صالح.');
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new Error('تاريخ نهاية سريان القاعدة يجب ألا يسبق تاريخ بدايتها.');
    }
    const taxableBasis: PayrollTaxBasis = input.taxableBasis === 'BASE' ? 'BASE' : 'GROSS';
    const brackets = this.normalizeBrackets(input.brackets);
    const isActive = input.isActive !== false;
    const dependentAllowance = Math.max(0, Number(input.dependentAllowance) || 0);
    if (id) {
      const existing = this.db.query<{ id: string }>(
        'SELECT id FROM payroll_tax_rules WHERE id = ? AND company_id = ?',
        [id, companyId]
      )[0];
      if (!existing) throw new Error('قاعدة الضريبة غير موجودة.');
    }
    this.assertNoOverlappingActiveRule(
      companyId, id || '', input.effectiveFrom, input.effectiveTo || null, isActive
    );
    const ruleId = id || `ptr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      if (id) {
        db.run(
          `UPDATE payroll_tax_rules SET name = ?, jurisdiction = ?, taxable_basis = ?,
             effective_from = ?, effective_to = ?, dependent_allowance = ?, is_active = ?,
             notes = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND company_id = ?`,
          [name, input.jurisdiction?.trim() || null, taxableBasis, input.effectiveFrom,
            input.effectiveTo || null, dependentAllowance, isActive ? 1 : 0,
            input.notes?.trim() || null, id, companyId]
        );
        db.run('DELETE FROM payroll_tax_brackets WHERE rule_id = ?', [id]);
      } else {
        db.run(
          `INSERT INTO payroll_tax_rules
             (id, company_id, name, jurisdiction, taxable_basis, effective_from, effective_to,
              dependent_allowance, is_active, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ruleId, companyId, name, input.jurisdiction?.trim() || null, taxableBasis,
            input.effectiveFrom, input.effectiveTo || null, dependentAllowance, isActive ? 1 : 0,
            input.notes?.trim() || null, actor.id]
        );
      }
      brackets.forEach((bracket, index) => {
        db.run(
          `INSERT INTO payroll_tax_brackets
             (id, rule_id, sequence, lower_limit, upper_limit, rate_percent)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [`ptb_${uuidv4().replace(/-/g, '').slice(0, 16)}`, ruleId, index + 1,
            bracket.lowerLimit, bracket.upperLimit, bracket.ratePercent]
        );
      });
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
        [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName,
          id ? 'تعديل قاعدة ضريبة رواتب' : 'إضافة قاعدة ضريبة رواتب', ruleId,
          JSON.stringify({ name, taxableBasis, effectiveFrom: input.effectiveFrom, brackets })]
      );
    });
    return this.getRule(ruleId, companyId)!;
  }

  private static getRule(id: string, companyId: string): PayrollTaxRule | null {
    const row = this.db.query<any>(
      `SELECT id, company_id AS companyId, name, jurisdiction, taxable_basis AS taxableBasis,
              effective_from AS effectiveFrom, effective_to AS effectiveTo,
              dependent_allowance AS dependentAllowance, is_active AS isActive,
              notes, created_at AS createdAt, updated_at AS updatedAt
       FROM payroll_tax_rules WHERE id = ? AND company_id = ?`,
      [id, companyId]
    )[0];
    return row ? this.mapRule(row, this.getBrackets(row.id)) : null;
  }

  static deleteRule(id: string): void {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const rule = this.db.query<{ name: string }>(
      'SELECT name FROM payroll_tax_rules WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!rule) throw new Error('قاعدة الضريبة غير موجودة.');
    this.db.executeTransaction((db) => {
      db.run('DELETE FROM payroll_tax_brackets WHERE rule_id = ?', [id]);
      db.run('DELETE FROM payroll_tax_rules WHERE id = ? AND company_id = ?', [id, companyId]);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'حذف قاعدة ضريبة رواتب', 'HR', ?, ?)`,
        [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, id,
          JSON.stringify({ name: rule.name })]
      );
    });
  }

  private static getEmployeeTaxProfile(employeeId: string): EmployeeTaxProfileRow {
    return this.db.query<EmployeeTaxProfileRow>(
      `SELECT COALESCE(tax_exempt, 0) AS taxExempt,
              COALESCE(tax_exemption_amount, 0) AS taxExemptionAmount,
              COALESCE(tax_dependents, 0) AS taxDependents
       FROM employees WHERE id = ?`,
      [employeeId]
    )[0] || { taxExempt: 0, taxExemptionAmount: 0, taxDependents: 0 };
  }

  /**
   * Calculate payroll income tax for one employee and period.
   *
   * When no effective rule exists the legacy company flat rate is used, so
   * existing installations keep working until an administrator publishes a
   * rule. The returned breakdown is stored on the payroll item snapshot.
   */
  static calculate(input: PayrollTaxCalculationInput): PayrollTaxCalculation {
    const grossAmount = roundMoney(Math.max(0, Number(input.grossAmount) || 0));
    const baseAmount = roundMoney(Math.max(0, Number(input.baseAmount) || 0));
    const legacyRate = Math.max(0, Number(input.legacyRate) || 0);
    const profile = this.getEmployeeTaxProfile(input.employeeId);
    const employeeExemptionAmount = roundMoney(Math.max(0, Number(profile.taxExemptionAmount) || 0));
    const dependents = Math.max(0, Math.round(Number(profile.taxDependents) || 0));

    if (profile.taxExempt) {
      return {
        source: 'EXEMPT',
        ruleId: null,
        ruleName: 'إعفاء موظف',
        taxableBasis: 'GROSS',
        grossAmount,
        baseAmount,
        taxableAmount: 0,
        employeeExemptionAmount,
        dependentAllowanceAmount: 0,
        exemptionAmount: employeeExemptionAmount,
        dependents,
        legacyRate,
        taxAmount: 0,
        lines: [],
      };
    }

    const rule = input.companyId
      ? this.getActiveRule(input.companyId, input.date)
      : null;

    if (!rule) {
      const taxAmount = roundMoney(grossAmount * legacyRate / 100);
      return {
        source: 'LEGACY_FLAT',
        ruleId: null,
        ruleName: legacyRate > 0 ? `النسبة الثابتة ${legacyRate}%` : 'بدون ضريبة',
        taxableBasis: 'GROSS',
        grossAmount,
        baseAmount,
        taxableAmount: grossAmount,
        employeeExemptionAmount,
        dependentAllowanceAmount: 0,
        exemptionAmount: employeeExemptionAmount,
        dependents,
        legacyRate,
        taxAmount,
        lines: taxAmount > 0
          ? [{
            sequence: 1,
            lowerLimit: 0,
            upperLimit: null,
            ratePercent: legacyRate,
            taxableAmount: grossAmount,
            taxAmount,
          }]
          : [],
      };
    }

    const dependentAllowanceAmount = roundMoney(dependents * Math.max(0, rule.dependentAllowance));
    const exemptionAmount = roundMoney(employeeExemptionAmount + dependentAllowanceAmount);
    const taxableBase = rule.taxableBasis === 'BASE' ? baseAmount : grossAmount;
    const taxableAmount = roundMoney(Math.max(0, taxableBase - exemptionAmount));
    let remaining = taxableAmount;
    let taxAmount = 0;
    const lines: PayrollTaxBreakdownLine[] = [];
    for (const bracket of rule.brackets) {
      if (remaining <= 0) break;
      if (taxableAmount <= bracket.lowerLimit) break;
      const upper = bracket.upperLimit == null ? taxableAmount : Math.min(taxableAmount, bracket.upperLimit);
      const portion = roundMoney(Math.max(0, upper - bracket.lowerLimit));
      if (portion <= 0) continue;
      const lineTax = roundMoney(portion * bracket.ratePercent / 100);
      taxAmount = roundMoney(taxAmount + lineTax);
      lines.push({
        sequence: bracket.sequence,
        lowerLimit: bracket.lowerLimit,
        upperLimit: bracket.upperLimit,
        ratePercent: bracket.ratePercent,
        taxableAmount: portion,
        taxAmount: lineTax,
      });
      remaining = roundMoney(remaining - portion);
    }
    return {
      source: 'RULE',
      ruleId: rule.id,
      ruleName: rule.name,
      taxableBasis: rule.taxableBasis,
      grossAmount,
      baseAmount,
      taxableAmount,
      employeeExemptionAmount,
      dependentAllowanceAmount,
      exemptionAmount,
      dependents,
      legacyRate,
      taxAmount: roundMoney(taxAmount),
      lines,
    };
  }
}
