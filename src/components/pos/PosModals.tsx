import React from 'react';
import {
  AlertCircle, CheckCircle2, History, Info, Keyboard, Lock, PlayCircle,
  Printer, Receipt, Trash2, Unlock, UserPlus,
} from 'lucide-react';
import type { CashRegister, CashShift, Customer, ToneMixingConflict } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { Field, Modal, inputCls } from './PosShared';
import type { HeldOrder, Toast } from '../../types/pos';
import './PosModals_part01';
import './PosModals_part02';
import './PosModals_part03';
import './PosModals_part04';
import './PosModals_part05';
import './PosModals_part06';
import './PosModals_part07';
import './PosModals_part08';
import './PosModals_part09';
import './PosModals_part10';
export { PosToast } from './PosModals_part01';
export { SuccessInvoiceModal } from './PosModals_part02';
export { HeldOrdersModal } from './PosModals_part03';
export { NewCustomerModal } from './PosModals_part04';
export { OpenShiftModal } from './PosModals_part05';
export { CloseShiftModal } from './PosModals_part06';
export { ManagerOverrideModal } from './PosModals_part07';
export { PinLoginModal } from './PosModals_part08';
export { ToneWarningModal } from './PosModals_part09';
export { ShortcutsModal } from './PosModals_part10';
