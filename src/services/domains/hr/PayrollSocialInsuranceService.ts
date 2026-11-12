import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type SocialInsuranceSystemType = 'PRIVATE' | 'CIVIL' | 'PUBLIC' | 'OTHER';

export interface SocialInsuranceRule {
  id: string;
  companyId: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  employeeSharePercent: number;
  employerSharePercent: number;
  contributionCeiling: number;
  minimumContributionBase: number;
  maximumContributionBase: number;
  endOfServicePerYearPercent: number;
  endOfServiceMonthsPerYear: number;
}

export interface SocialInsuranceCalculation {
  ruleId: string | null;
  ruleName: string;
  contributionBase: number;
  employeeShareAmount: number;
  employerShareAmount: number;
  totalAmount: number;
  effectiveDate: string;
  ceilingApplied: boolean;
}

export interface EndOfServiceRule {
  id: string;
  companyId: string;
  systemType: SocialInsuranceSystemType;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  serviceYearsForFullBenefit: number;
  benefitMonthsPerYearFirstPeriod: number;
  benefitMonthsPerYearSecondPeriod: number;
  secondPeriodThresholdYears: number;
}

export interface EndOfServiceCalculation {
  ruleId: string | null;
  ruleName: string;
  systemType: SocialInsuranceSystemType | null;
  serviceYears: number;
  serviceMonths: number;
  lastMonthlySalary: number;
  benefitAmount: number;
}

export interface SocialInsuranceRuleInput {
  name: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  employeeSharePercent?: number;
  employerSharePercent?: number;
  contributionCeiling?: number;
  minimumContributionBase?: number;
  maximumContributionBase?: number;
  endOfServicePerYearPercent?: number;
  endOfServiceMonthsPerYear?: number;
  isActive?: boolean;
}

export interface EndOfServiceRuleInput {
  systemType: SocialInsuranceSystemType;
  name: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  serviceYearsForFullBenefit?: number;
  benefitMonthsPerYearFirstPeriod?: number;
  benefitMonthsPerYearSecondPeriod?: number;
  secondPeriodThresholdYears?: number;
  isActive?: boolean;
}

const MAX_DATE = '9999-12-31';

function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export class PayrollSocialInsuranceService {
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
    const row = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!row?.companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة.');
    return row.companyId;
  }

  /** Company id of the current branch, for calculators that operate outside a rule row. */
  static getCurrentCompanyId(): string {
    this.requireView();
    return this.currentCompanyId();
  }

  /* ========== Social Insurance Rules ========== */

  static getSocialInsuranceRules(): SocialInsuranceRule[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const rows = this.db.query<any>(
      `SELECT id, company_id AS companyId, name, effective_from AS effectiveFrom,
              effective_to AS effectiveTo, is_active AS isActive,
              employee_share_percent AS employeeSharePercent,
              employer_share_percent AS employerSharePercent,
              contribution_ceiling AS contributionCeiling,
              minimum_contribution_base AS minimumContributionBase,
              maximum_contribution_base AS maximumContributionBase,
              end_of_service_per_year_percent AS endOfServicePerYearPercent,
              end_of_service_months_per_year AS endOfServiceMonthsPerYear,
              created_at AS createdAt, updated_at AS updatedAt
       FROM payroll_social_insurance_rules
       WHERE company_id = ?
       ORDER BY is_active DESC, effective_from DESC, name`,
      [companyId]
    );
    return rows.map((row) => this.mapSocialInsuranceRule(row));
  }

  static getActiveSocialInsuranceRule(companyId: string, date: string): SocialInsuranceRule | null {
    const row = this.db.query<any>(
      `SELECT id, company_id AS companyId, name, effective_from AS effectiveFrom,
              effective_to AS effectiveTo, is_active AS isActive,
              employee_share_percent AS employeeSharePercent,
              employer_share_percent AS employerSharePercent,
              contribution_ceiling AS contributionCeiling,
              minimum_contribution_base AS minimumContributionBase,
              maximum_contribution_base AS maximumContributionBase,
              end_of_service_per_year_percent AS endOfServicePerYearPercent,
              end_of_service_months_per_year AS endOfServiceMonthsPerYear
       FROM payroll_social_insurance_rules
       WHERE company_id = ? AND is_active = 1
         AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
      [companyId, date, date]
    )[0];
    return row ? this.mapSocialInsuranceRule(row) : null;
  }

  private static mapSocialInsuranceRule(row: any): SocialInsuranceRule {
    return {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo ?? null,
      isActive: Boolean(row.isActive),
      employeeSharePercent: Number(row.employeeSharePercent) || 0,
      employerSharePercent: Number(row.employerSharePercent) || 0,
      contributionCeiling: Number(row.contributionCeiling) || 0,
      minimumContributionBase: Number(row.minimumContributionBase) || 0,
      maximumContributionBase: Number(row.maximumContributionBase) || 0,
      endOfServicePerYearPercent: Number(row.endOfServicePerYearPercent) || 0,
      endOfServiceMonthsPerYear: Number(row.endOfServiceMonthsPerYear) || 0,
    };
  }

  static saveSocialInsuranceRule(input: SocialInsuranceRuleInput, id?: string): SocialInsuranceRule {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const name = input.name?.trim();
    if (!name) throw new Error('اسم قاعدة التأمينات الاجتماعية مطلوب.');
    if (!isValidDate(input.effectiveFrom)) throw new Error('تاريخ بداية سريان القاعدة غير صالح.');
    if (input.effectiveTo && !isValidDate(input.effectiveTo)) {
      throw new Error('تاريخ نهاية سريان القاعدة غير صالح.');
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new Error('تاريخ نهاية سريان القاعدة يجب ألا يسبق تاريخ بدايتها.');
    }
    const isActive = input.isActive !== false;
    const employeeSharePercent = Math.max(0, Math.min(100, Number(input.employeeSharePercent || 0)));
    const employerSharePercent = Math.max(0, Math.min(100, Number(input.employerSharePercent || 0)));
    const contributionCeiling = Math.max(0, Number(input.contributionCeiling || 0));
    const minimumContributionBase = Math.max(0, Number(input.minimumContributionBase || 0));
    const maximumContributionBase = Math.max(0, Number(input.maximumContributionBase || 0));
    const endOfServicePerYearPercent = Math.max(0, Math.min(100, Number(input.endOfServicePerYearPercent || 0)));
    const endOfServiceMonthsPerYear = Math.max(0, Math.min(12, Number(input.endOfServiceMonthsPerYear || 0)));

    if (id) {
      const existing = this.db.query<{ id: string }>(
        'SELECT id FROM payroll_social_insurance_rules WHERE id = ? AND company_id = ?',
        [id, companyId]
      )[0];
      if (!existing) throw new Error('قاعدة التأمينات الاجتماعية غير موجودة.');
    }

    if (isActive) {
      const overlapping = this.db.query<{ name: string }>(
        `SELECT name FROM payroll_social_insurance_rules
         WHERE company_id = ? AND is_active = 1 AND id <> ?
           AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
         LIMIT 1`,
        [companyId, id || '', input.effectiveTo || MAX_DATE, input.effectiveFrom]
      )[0];
      if (overlapping) {
        throw new Error(`توجد قاعدة تأمينات اجتماعية نشطة متداخلة مع هذه الفترة: ${overlapping.name}.`);
      }
    }

    const ruleId = id || `psi_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      if (id) {
        db.run(
          `UPDATE payroll_social_insurance_rules SET name = ?, effective_from = ?, effective_to = ?,
             is_active = ?, employee_share_percent = ?, employer_share_percent = ?,
             contribution_ceiling = ?, minimum_contribution_base = ?, maximum_contribution_base = ?,
             end_of_service_per_year_percent = ?, end_of_service_months_per_year = ?,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND company_id = ?`,
          [name, input.effectiveFrom, input.effectiveTo || null, isActive ? 1 : 0,
            employeeSharePercent, employerSharePercent, contributionCeiling,
            minimumContributionBase, maximumContributionBase,
            endOfServicePerYearPercent, endOfServiceMonthsPerYear, id, companyId]
        );
      } else {
        db.run(
          `INSERT INTO payroll_social_insurance_rules
             (id, company_id, name, effective_from, effective_to, is_active,
              employee_share_percent, employer_share_percent, contribution_ceiling,
              minimum_contribution_base, maximum_contribution_base,
              end_of_service_per_year_percent, end_of_service_months_per_year,
              created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ruleId, companyId, name, input.effectiveFrom, input.effectiveTo || null, isActive ? 1 : 0,
            employeeSharePercent, employerSharePercent, contributionCeiling,
            minimumContributionBase, maximumContributionBase,
            endOfServicePerYearPercent, endOfServiceMonthsPerYear, actor.id]
        );
      }
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
        [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName,
          id ? 'تعديل قاعدة تأمينات اجتماعية' : 'إضافة قاعدة تأمينات اجتماعية', ruleId,
          JSON.stringify({ name, effectiveFrom: input.effectiveFrom, employeeSharePercent, employerSharePercent })]
      );
    });
    return this.getSocialInsuranceRule(ruleId, companyId)!;
  }

  static deleteSocialInsuranceRule(id: string): void {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const rule = this.db.query<{ name: string }>(
      'SELECT name FROM payroll_social_insurance_rules WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!rule) throw new Error('قاعدة التأمينات الاجتماعية غير موجودة.');
    this.db.executeTransaction((db) => {
      db.run('DELETE FROM payroll_social_insurance_contributions WHERE rule_id = ?', [id]);
      db.run('DELETE FROM payroll_social_insurance_rules WHERE id = ? AND company_id = ?', [id, companyId]);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'حذف قاعدة تأمينات اجتماعية', 'HR', ?, ?)`,
        [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, id,
          JSON.stringify({ name: rule.name })]
      );
    });
  }

  private static getSocialInsuranceRule(id: string, companyId: string): SocialInsuranceRule | null {
    const row = this.db.query<any>(
      `SELECT id, company_id AS companyId, name, effective_from AS effectiveFrom,
              effective_to AS effectiveTo, is_active AS isActive,
              employee_share_percent AS employeeSharePercent,
              employer_share_percent AS employerSharePercent,
              contribution_ceiling AS contributionCeiling,
              minimum_contribution_base AS minimumContributionBase,
              maximum_contribution_base AS maximumContributionBase,
              end_of_service_per_year_percent AS endOfServicePerYearPercent,
              end_of_service_months_per_year AS endOfServiceMonthsPerYear
       FROM payroll_social_insurance_rules WHERE id = ? AND company_id = ?`,
      [id, companyId]
    )[0];
    return row ? this.mapSocialInsuranceRule(row) : null;
  }

  /* ========== Social Insurance Calculation ========== */

  /**
   * Calculate social insurance contributions for a gross salary amount.
   * Applies the active rule for the given company and date.
   * Respects contribution ceiling, minimum base, and maximum base.
   */
  static calculateSocialInsurance(
    companyId: string,
    date: string,
    grossAmount: number
  ): SocialInsuranceCalculation {
    const gross = roundMoney(Math.max(0, Number(grossAmount) || 0));
    const rule = this.getActiveSocialInsuranceRule(companyId, date);

    if (!rule) {
      return {
        ruleId: null,
        ruleName: 'لا توجد قاعدة سارية',
        contributionBase: gross,
        employeeShareAmount: 0,
        employerShareAmount: 0,
        totalAmount: 0,
        effectiveDate: date,
        ceilingApplied: false,
      };
    }

    let contributionBase = gross;
    let ceilingApplied = false;

    // Apply minimum contribution base
    if (rule.minimumContributionBase > 0 && contributionBase < rule.minimumContributionBase) {
      contributionBase = rule.minimumContributionBase;
    }

    // Apply contribution ceiling
    if (rule.contributionCeiling > 0 && contributionBase > rule.contributionCeiling) {
      contributionBase = rule.contributionCeiling;
      ceilingApplied = true;
    }

    // Apply maximum contribution base
    if (rule.maximumContributionBase > 0 && contributionBase > rule.maximumContributionBase) {
      contributionBase = rule.maximumContributionBase;
      ceilingApplied = true;
    }

    const employeeShareAmount = roundMoney(contributionBase * rule.employeeSharePercent / 100);
    const employerShareAmount = roundMoney(contributionBase * rule.employerSharePercent / 100);
    const totalAmount = roundMoney(employeeShareAmount + employerShareAmount);

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      contributionBase,
      employeeShareAmount,
      employerShareAmount,
      totalAmount,
      effectiveDate: rule.effectiveFrom,
      ceilingApplied,
    };
  }

  /* ========== End-of-Service Rules ========== */

  static getEndOfServiceRules(): EndOfServiceRule[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const rows = this.db.query<any>(
      `SELECT id, company_id AS companyId, system_type AS systemType, name,
              effective_from AS effectiveFrom, effective_to AS effectiveTo,
              is_active AS isActive, service_years_for_full_benefit AS serviceYearsForFullBenefit,
              benefit_months_per_year_first_period AS benefitMonthsPerYearFirstPeriod,
              benefit_months_per_year_second_period AS benefitMonthsPerYearSecondPeriod,
              second_period_threshold_years AS secondPeriodThresholdYears
       FROM payroll_end_of_service_rules
       WHERE company_id = ?
       ORDER BY system_type, is_active DESC, effective_from DESC, name`,
      [companyId]
    );
    return rows.map((row) => this.mapEndOfServiceRule(row));
  }

  static getActiveEndOfServiceRule(
    companyId: string,
    systemType: SocialInsuranceSystemType,
    date: string
  ): EndOfServiceRule | null {
    const row = this.db.query<any>(
      `SELECT id, company_id AS companyId, system_type AS systemType, name,
              effective_from AS effectiveFrom, effective_to AS effectiveTo,
              is_active AS isActive, service_years_for_full_benefit AS serviceYearsForFullBenefit,
              benefit_months_per_year_first_period AS benefitMonthsPerYearFirstPeriod,
              benefit_months_per_year_second_period AS benefitMonthsPerYearSecondPeriod,
              second_period_threshold_years AS secondPeriodThresholdYears
       FROM payroll_end_of_service_rules
       WHERE company_id = ? AND system_type = ? AND is_active = 1
         AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
      [companyId, systemType, date, date]
    )[0];
    return row ? this.mapEndOfServiceRule(row) : null;
  }

  private static mapEndOfServiceRule(row: any): EndOfServiceRule {
    return {
      id: row.id,
      companyId: row.companyId,
      systemType: row.systemType,
      name: row.name,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo ?? null,
      isActive: Boolean(row.isActive),
      serviceYearsForFullBenefit: Number(row.serviceYearsForFullBenefit) || 0,
      benefitMonthsPerYearFirstPeriod: Number(row.benefitMonthsPerYearFirstPeriod) || 0,
      benefitMonthsPerYearSecondPeriod: Number(row.benefitMonthsPerYearSecondPeriod) || 0,
      secondPeriodThresholdYears: Number(row.secondPeriodThresholdYears) || 0,
    };
  }

  static saveEndOfServiceRule(input: EndOfServiceRuleInput, id?: string): EndOfServiceRule {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const name = input.name?.trim();
    if (!name) throw new Error('اسم قاعدة نهاية الخدمة مطلوب.');
    if (!isValidDate(input.effectiveFrom)) throw new Error('تاريخ بداية سريان القاعدة غير صالح.');
    if (input.effectiveTo && !isValidDate(input.effectiveTo)) {
      throw new Error('تاريخ نهاية سريان القاعدة غير صالح.');
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new Error('تاريخ نهاية سريان القاعدة يجب ألا يسبق تاريخ بدايتها.');
    }
    const isActive = input.isActive !== false;
    const systemType = input.systemType;
    const serviceYearsForFullBenefit = Math.max(0, Number(input.serviceYearsForFullBenefit || 0));
    const benefitMonthsPerYearFirstPeriod = Math.max(0, Math.min(12, Number(input.benefitMonthsPerYearFirstPeriod || 0)));
    const benefitMonthsPerYearSecondPeriod = Math.max(0, Math.min(12, Number(input.benefitMonthsPerYearSecondPeriod || 0)));
    const secondPeriodThresholdYears = Math.max(0, Number(input.secondPeriodThresholdYears || 0));

    if (id) {
      const existing = this.db.query<{ id: string }>(
        'SELECT id FROM payroll_end_of_service_rules WHERE id = ? AND company_id = ?',
        [id, companyId]
      )[0];
      if (!existing) throw new Error('قاعدة نهاية الخدمة غير موجودة.');
    }

    if (isActive) {
      const overlapping = this.db.query<{ name: string }>(
        `SELECT name FROM payroll_end_of_service_rules
         WHERE company_id = ? AND system_type = ? AND is_active = 1 AND id <> ?
           AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
         LIMIT 1`,
        [companyId, systemType, id || '', input.effectiveTo || MAX_DATE, input.effectiveFrom]
      )[0];
      if (overlapping) {
        throw new Error(`توجد قاعدة نهاية خدمة نشطة متداخلة مع هذه الفترة: ${overlapping.name}.`);
      }
    }

    const ruleId = id || `eos_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      if (id) {
        db.run(
          `UPDATE payroll_end_of_service_rules SET name = ?, system_type = ?, effective_from = ?,
             effective_to = ?, is_active = ?, service_years_for_full_benefit = ?,
             benefit_months_per_year_first_period = ?, benefit_months_per_year_second_period = ?,
             second_period_threshold_years = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND company_id = ?`,
          [name, systemType, input.effectiveFrom, input.effectiveTo || null, isActive ? 1 : 0,
            serviceYearsForFullBenefit, benefitMonthsPerYearFirstPeriod,
            benefitMonthsPerYearSecondPeriod, secondPeriodThresholdYears, id, companyId]
        );
      } else {
        db.run(
          `INSERT INTO payroll_end_of_service_rules
             (id, company_id, system_type, name, effective_from, effective_to, is_active,
              service_years_for_full_benefit, benefit_months_per_year_first_period,
              benefit_months_per_year_second_period, second_period_threshold_years,
              created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ruleId, companyId, systemType, name, input.effectiveFrom, input.effectiveTo || null,
            isActive ? 1 : 0, serviceYearsForFullBenefit, benefitMonthsPerYearFirstPeriod,
            benefitMonthsPerYearSecondPeriod, secondPeriodThresholdYears, actor.id]
        );
      }
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
        [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName,
          id ? 'تعديل قاعدة نهاية خدمة' : 'إضافة قاعدة نهاية خدمة', ruleId,
          JSON.stringify({ name, systemType, effectiveFrom: input.effectiveFrom })]
      );
    });
    return this.getEndOfServiceRule(ruleId, companyId)!;
  }

  static deleteEndOfServiceRule(id: string): void {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const rule = this.db.query<{ name: string }>(
      'SELECT name FROM payroll_end_of_service_rules WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!rule) throw new Error('قاعدة نهاية الخدمة غير موجودة.');
    this.db.executeTransaction((db) => {
      db.run('DELETE FROM payroll_end_of_service_settlements WHERE rule_id = ?', [id]);
      db.run('DELETE FROM payroll_end_of_service_rules WHERE id = ? AND company_id = ?', [id, companyId]);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'حذف قاعدة نهاية خدمة', 'HR', ?, ?)`,
        [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, id,
          JSON.stringify({ name: rule.name })]
      );
    });
  }

  private static getEndOfServiceRule(id: string, companyId: string): EndOfServiceRule | null {
    const row = this.db.query<any>(
      `SELECT id, company_id AS companyId, system_type AS systemType, name,
              effective_from AS effectiveFrom, effective_to AS effectiveTo,
              is_active AS isActive, service_years_for_full_benefit AS serviceYearsForFullBenefit,
              benefit_months_per_year_first_period AS benefitMonthsPerYearFirstPeriod,
              benefit_months_per_year_second_period AS benefitMonthsPerYearSecondPeriod,
              second_period_threshold_years AS secondPeriodThresholdYears
       FROM payroll_end_of_service_rules WHERE id = ? AND company_id = ?`,
      [id, companyId]
    )[0];
    return row ? this.mapEndOfServiceRule(row) : null;
  }

  /* ========== End-of-Service Calculation ========== */

  /**
   * Calculate end-of-service benefit for an employee.
   * Egyptian labor law: typically half month per year for first 5 years, one month per year after.
   * Rules are configurable per company.
   */
  static calculateEndOfService(
    companyId: string,
    systemType: SocialInsuranceSystemType,
    date: string,
    joinDate: string,
    terminationDate: string,
    lastMonthlySalary: number
  ): EndOfServiceCalculation {
    const salary = roundMoney(Math.max(0, Number(lastMonthlySalary) || 0));
    const rule = this.getActiveEndOfServiceRule(companyId, systemType, date);

    const join = new Date(`${joinDate}T00:00:00Z`);
    const term = new Date(`${terminationDate}T00:00:00Z`);
    const totalDays = Math.max(0, Math.floor((term.getTime() - join.getTime()) / 86_400_000));
    const serviceYears = totalDays / 365;
    const serviceMonths = Math.round((totalDays % 365) / 30.44);

    let benefitAmount = 0;
    let ruleName = 'لا توجد قاعدة سارية';
    let ruleId: string | null = null;

    if (rule) {
      ruleName = rule.name;
      ruleId = rule.id;

      const fullBenefitYears = rule.serviceYearsForFullBenefit || 0;
      const firstPeriodMonths = rule.benefitMonthsPerYearFirstPeriod || 0;
      const secondPeriodMonths = rule.benefitMonthsPerYearSecondPeriod || 0;
      const _secondPeriodThreshold = rule.secondPeriodThresholdYears || 0;

      if (serviceYears <= fullBenefitYears) {
        benefitAmount = roundMoney(serviceYears * (firstPeriodMonths / 12) * salary);
      } else {
        const firstPart = roundMoney(fullBenefitYears * (firstPeriodMonths / 12) * salary);
        const secondPartYears = serviceYears - fullBenefitYears;
        const secondPart = roundMoney(secondPartYears * (secondPeriodMonths / 12) * salary);
        benefitAmount = roundMoney(firstPart + secondPart);
      }
    }

    return {
      ruleId,
      ruleName,
      systemType: rule ? rule.systemType : null,
      serviceYears: roundMoney(serviceYears),
      serviceMonths: roundMoney(serviceMonths),
      lastMonthlySalary: salary,
      benefitAmount: roundMoney(benefitAmount),
    };
  }

  /* ========== Social Insurance Contributions Storage (payroll run integration) ========== */

  static getSocialInsuranceContributions(payrollRunId: string): Array<{
    id: string; payrollRunItemId: string; employeeId: string; employeeName: string;
    period: string; contributionBase: number; employeeShareAmount: number;
    employerShareAmount: number; totalAmount: number; ruleName: string | null;
  }> {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('pr.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT sic.id, sic.payroll_run_item_id AS payrollRunItemId, sic.employee_id AS employeeId,
              e.name AS employeeName, sic.period, sic.contribution_base AS contributionBase,
              sic.employee_share_amount AS employeeShareAmount,
              sic.employer_share_amount AS employerShareAmount,
              sic.total_amount AS totalAmount, sic.rule_name AS ruleName
       FROM payroll_social_insurance_contributions sic
       JOIN payroll_run_items pri ON pri.id = sic.payroll_run_item_id
       JOIN payroll_runs pr ON pr.id = sic.payroll_run_id
       JOIN employees e ON e.id = sic.employee_id
       WHERE sic.payroll_run_id = ? AND ${scope.clause}
       ORDER BY e.name`,
      [payrollRunId, ...scope.params]
    );
    return rows.map((row) => ({
      id: row.id,
      payrollRunItemId: row.payrollRunItemId,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      period: row.period,
      contributionBase: Number(row.contributionBase) || 0,
      employeeShareAmount: Number(row.employeeShareAmount) || 0,
      employerShareAmount: Number(row.employerShareAmount) || 0,
      totalAmount: Number(row.totalAmount) || 0,
      ruleName: row.ruleName ?? null,
    }));
  }

  static persistSocialInsuranceContribution(
    payrollRunId: string,
    payrollRunItemId: string,
    employeeId: string,
    period: string,
    calculation: SocialInsuranceCalculation
  ): void {
    this.db.run(
      `INSERT OR REPLACE INTO payroll_social_insurance_contributions
         (id, payroll_run_id, payroll_run_item_id, employee_id, period,
          contribution_base, employee_share_amount, employer_share_amount,
          total_amount, rule_id, rule_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `sic_${uuidv4().replace(/-/g, '').slice(0, 16)}`, payrollRunId, payrollRunItemId,
        employeeId, period, calculation.contributionBase, calculation.employeeShareAmount,
        calculation.employerShareAmount, calculation.totalAmount,
        calculation.ruleId || null, calculation.ruleName,
      ]
    );
  }

  static removeSocialInsuranceContribution(payrollRunItemId: string): void {
    this.db.run(
      'DELETE FROM payroll_social_insurance_contributions WHERE payroll_run_item_id = ?',
      [payrollRunItemId]
    );
  }
}
