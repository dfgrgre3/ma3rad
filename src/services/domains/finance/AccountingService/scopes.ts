import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { SqlScope } from './types';

export function branchScope(access: BranchAccessService, expression: string, fallbackExpression?: string): SqlScope {
  return access.sqlScope(expression, fallbackExpression);
}

/** Journal entries are scoped by branch *and* the legal entity that owns it. */
export function ledgerScope(access: BranchAccessService, alias = 'e'): SqlScope {
  const branch = access.sqlScope(`${alias}.branch_id`);
  const company = access.companyScope(`${alias}.company_id`);
  return {
    clause: `(${branch.clause}) AND (${company.clause})`,
    params: [...branch.params, ...company.params],
  };
}
