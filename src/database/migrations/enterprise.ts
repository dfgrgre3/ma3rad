import { runEnterprisePart1, runEnterprisePart2, runEnterprisePart3 } from './enterprisePart01';
import { runEnterprisePart4, runEnterprisePart5, runEnterprisePart6, runEnterprisePart7, runEnterprisePart8 } from './enterprisePart02';
import { runEnterprisePart9 } from './enterprisePart03';
import type { Migration } from '../migrationSupport';

export const MIGRATION_ENTERPRISE: Migration = {
    id: '049_finance_and_accounting_enterprise',
    description: 'Enterprise finance: fiscal periods, closing cycle, bank reconciliation, cheques accounting, budgets, cost centers, cash forecasting, and e-payment settlements',
    up(db) {
      runEnterprisePart1(db);
      runEnterprisePart2(db);
      runEnterprisePart3(db);
      runEnterprisePart4(db);
      runEnterprisePart5(db);
      runEnterprisePart6(db);
      runEnterprisePart7(db);
      runEnterprisePart8(db);
      runEnterprisePart9(db);
    },
  };
