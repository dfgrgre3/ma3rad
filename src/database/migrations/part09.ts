import type { Database } from 'sql.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from '../repositories/ledger';
import { localDateString } from '../../utils/shared/date';
import {
  DEFAULT_SETTINGS, DEFAULT_BRANCH_ID, EXTENDED_SETTINGS_KEYS,
  tableExists, columnExists, addColumn, backfillReturnLedgerEntries,
  type Migration,
} from './support';
import './part09_part01';
import './part09_part02';
import './part09_part03';
export { MIGRATION_PART_09 } from './part09_part03';
