import { AuthService } from '../../auth/AuthService';
import { BranchAccessService } from '../../auth/BranchAccessService';

/**
 * Branch/company SQL scopes shared by the command-centre aggregate queries.
 * Extracted verbatim from ExecutiveCommandService.
 */
export class CommandScopes {
  private branchAccess = new BranchAccessService();

  public salesScopes() {
    const actor = AuthService.requireAuth();
    return {
      branch: this.branchAccess.sqlScope('si.branch_id', undefined, actor),
      company: this.branchAccess.companyScopeViaBranch('si.branch_id', actor),
    };
  }

  public purchaseScopes() {
    const actor = AuthService.requireAuth();
    return {
      branch: this.branchAccess.sqlScope('pi.branch_id', undefined, actor),
      company: this.branchAccess.companyScopeViaBranch('pi.branch_id', actor),
    };
  }

  public expenseScopes() {
    const actor = AuthService.requireAuth();
    return {
      branch: this.branchAccess.sqlScope('e.branch_id', undefined, actor),
      company: this.branchAccess.companyScopeViaBranch('e.branch_id', actor),
    };
  }

  public warehouseScope() {
    return this.branchAccess.warehouseBranchScope('w');
  }
}
