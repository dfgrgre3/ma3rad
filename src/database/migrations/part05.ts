import type { Database } from 'sql.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  paymentAccountCode, postLedgerEntry, queryLedgerRows,
  type LedgerPostingLine,
} from '../repositories/ledger';
import { localDateString } from '../../utils/shared/date';
import {
  DEFAULT_SETTINGS, DEFAULT_BRANCH_ID, EXTENDED_SETTINGS_KEYS,
  tableExists, columnExists, addColumn, backfillReturnLedgerEntries,
  type Migration,
} from './support';
import './part05_part01';
import './part05_part02';
import './part05_part03';
import './part05_part04';
export { MIGRATION_PART_05 } from './part05_part04';
