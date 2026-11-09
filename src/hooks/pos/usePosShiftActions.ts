import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CashShift } from '../../types';
import type { CashierService } from '../../services/finance/CashierService';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { writeAndPrintWindow } from '../../utils/shared/printWindow';
import type { Toast } from '../../types/pos';
import './usePosShiftActions_part01';
import './usePosShiftActions_part02';
export { usePosShiftActions } from './usePosShiftActions_part02';
