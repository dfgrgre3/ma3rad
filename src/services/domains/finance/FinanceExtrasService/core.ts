import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { localDateString } from '../../../../utils/shared/date';
import { assertLedgerDateOpenForPosting } from '../../../../database/repositories/ledger';
import { BranchAccessService } from '../../auth/BranchAccessService';
import { validDate } from './types';

export abstract class ExtrasCoreBase {
  protected db = DatabaseManager.getInstance();
  protected branchAccess = new BranchAccessService();

  protected requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.finance.overview.view');
    return actor;
  }

  protected requireManage() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.finance.receivables.approve');
    return actor;
  }

  protected assertPostingDate(date: string, allowCurrentMonthEnd = false): void {
    const currentPeriod = localDateString().slice(0, 7);
    if (!validDate(date) || (date > localDateString() && !(allowCurrentMonthEnd && date.slice(0, 7) === currentPeriod))) {
      throw new Error('تاريخ الترحيل غير صالح أو يقع في المستقبل.');
    }
    assertLedgerDateOpenForPosting(this.db.getDatabase(), date);
  }
}
