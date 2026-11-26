import type { Database } from 'sql.js';
import { SCHEMA_SQL } from '../schema';
import type { Migration } from './support';
import { MIGRATION_PART_01 } from './part01';
import { MIGRATION_PART_02 } from './part02';
import { MIGRATION_PART_03 } from './part03';
import { MIGRATION_PART_04 } from './part04';
import { MIGRATION_PART_05 } from './part05';
import { MIGRATION_PART_06 } from './part06';
import { MIGRATION_PART_07 } from './part07';
import { MIGRATION_PART_08 } from './part08';
import { MIGRATION_PART_09 } from './part09';
import { MIGRATION_PART_10 } from './part10';
import { MIGRATION_PART_11 } from './part11';
import { MIGRATION_PART_12 } from './part12';
import { MIGRATION_PART_13 } from './part13';
import { MIGRATION_PART_14 } from './part14';
import { MIGRATION_PART_15 } from './part15';
import { MIGRATION_PART_16 } from './part16';
import { MIGRATION_PART_17 } from './part17';
import { MIGRATION_PART_18 } from './part18';
import { MIGRATION_PART_19 } from './part19';
import { MIGRATION_PART_20 } from './part20';
import { MIGRATION_PART_21 } from './part21';
import { MIGRATION_PART_22 } from './part22';
import { MIGRATION_PART_23 } from './part23';
import { MIGRATION_PART_24 } from './part24';
import { MIGRATION_PART_25 } from './part25';
import { MIGRATION_PART_26 } from './part26';
import { MIGRATION_PART_27 } from './part27';
import { MIGRATION_PART_28 } from './part28';
import { MIGRATION_PART_29 } from './part29';
import { MIGRATION_PART_30 } from './part30';
import { MIGRATION_PART_31 } from './part31';
import { MIGRATION_PART_32 } from './part32';
import { MIGRATION_PART_33 } from './part33';
import { MIGRATION_PART_34 } from './part34';
import { MIGRATION_PART_35 } from './part35';
import { MIGRATION_PART_36 } from './part36';
import { MIGRATION_PART_37 } from './part37';
import { MIGRATION_PART_38 } from './part38';
import { MIGRATION_PART_39 } from './part39';
import { MIGRATION_PART_40 } from './part40';
import { MIGRATION_PART_41 } from './part41';
import { MIGRATION_PART_42 } from './part42';
import { MIGRATION_PART_43 } from './part43';
import { MIGRATION_PART_44 } from './part44';
import { MIGRATION_PART_45 } from './part45';
import { MIGRATION_PART_46 } from './part46';
import { MIGRATION_PART_47 } from './part47';
import { MIGRATION_PART_48 } from './part48';
import { MIGRATION_PART_49 } from './part49';
import { MIGRATION_PART_50 } from './part50';
import { MIGRATION_PART_51 } from './part51';
import { MIGRATION_PART_52 } from './part52';
import { MIGRATION_PART_53 } from './part53';
import { MIGRATION_PART_54 } from './part54';
import { MIGRATION_PART_55 } from './part55';
import { MIGRATION_PART_56 } from './part56';
import { MIGRATION_PART_57 } from './part57';
import { MIGRATION_PART_58 } from './part58';
import { MIGRATION_PART_59 } from './part59';
import { MIGRATION_PART_60 } from './part60';
import { MIGRATION_PART_61 } from './part61';
import { MIGRATION_PART_62 } from './part62';
import { MIGRATION_PART_63 } from './part63';
import { MIGRATION_PART_64 } from './part64';
import { MIGRATION_PART_65 } from './part65';
import { MIGRATION_PART_66 } from './part66';
import { MIGRATION_PART_67 } from './part67';
import { MIGRATION_PART_68 } from './part68';
import { MIGRATION_PART_69 } from './part69';
import { MIGRATION_PART_70 } from './part70';
import { MIGRATION_PART_71 } from './part71';
import { MIGRATION_PART_72 } from './part72';
import { MIGRATION_PART_73 } from './part73';
import { MIGRATION_PART_74 } from './part74';
import { MIGRATION_PART_76 } from './part76';
import { MIGRATION_PART_77 } from './part77';
import { MIGRATION_PART_79 } from './part79';
import { MIGRATION_PART_80 } from './part80';
import { MIGRATION_PART_81 } from './part81';
import { MIGRATION_PART_82 } from './part82';
import { MIGRATION_PART_83 } from './part83';
import { MIGRATION_PART_84 } from './part84';
import { MIGRATION_PART_85 } from './part85';
import { MIGRATION_PART_100 } from './part100';
import { MIGRATION_PART_101 } from './part101';
import { MIGRATION_PART_102 } from './part102';
import { MIGRATION_PART_103 } from './part103';
import { MIGRATION_PART_104 } from './part104';
import { MIGRATION_PART_105 } from './part105';
import { MIGRATION_PART_106 } from './part106';
import { MIGRATION_PART_107 } from './part107';
import { MIGRATION_PART_108 } from './part108';
import { MIGRATION_PART_109 } from './part109';
import { MIGRATION_PART_110 } from './part110';
import { MIGRATION_PART_111 } from './part111';
import { MIGRATION_PART_112 } from './part112';
import { MIGRATION_PART_113 } from './part113';
import { MIGRATION_PART_115 } from './part115';
import { MIGRATION_PART_116 } from './part116';
import { MIGRATION_PART_117 } from './part117';
import { MIGRATION_PART_118 } from './part118';
import { MIGRATION_PART_119 } from './part119';
import { MIGRATION_PART_120 } from './part120';
import { MIGRATION_PART_121 } from './part121';
import { MIGRATION_PART_122 } from './part122';
import { MIGRATION_PART_123 } from './part123';
import { MIGRATION_PART_124 } from './part124';
import { MIGRATION_PART_125 } from './part125';
import { MIGRATION_PART_126 } from './part126';
import { MIGRATION_PART_127 } from './part127';
import { MIGRATION_PART_128 } from './part128';
import { MIGRATION_PART_129 } from './part129';
import { MIGRATION_PART_130 } from './part130';
import { MIGRATION_PART_131 } from './part131';
import { MIGRATION_PART_132 } from './part132';
import { MIGRATION_PART_133 } from './part133';
import { MIGRATION_PART_134 } from './part134';
import { MIGRATION_PART_135 } from './part135';
import { MIGRATION_PART_136 } from './part136';
import { MIGRATION_PART_137 } from './part137';
import { MIGRATION_PART_138 } from './part138';
import { MIGRATION_PART_139 } from './part139';
import { MIGRATION_PART_140 } from './part140';
import { MIGRATION_PART_141 } from './part141';
import { MIGRATION_PART_142 } from './part142';
import { MIGRATION_PART_143 } from './part143';
import { MIGRATION_PART_144 } from './part144';
import { MIGRATION_PART_145 } from './part145';
import { MIGRATION_PART_146 } from './part146';
import { MIGRATION_PART_147 } from './part147';
import { MIGRATION_PART_148 } from './part148';
import { MIGRATION_PART_149 } from './part149';
import { MIGRATION_PART_150 } from './part150';
import { MIGRATION_237_BOM_OPERATIONS, MIGRATION_238_MANUFACTURING_DOWNTIME, MIGRATION_239_MANUFACTURING_PHASE2_COLUMNS } from './part151';
import { MIGRATION_240_PRODUCTION_ORDER_APPROVAL, MIGRATION_241_PRODUCTION_OPERATOR_AND_BATCH } from './part152';
import { MIGRATION_242_QUALITY_AQL_AND_DEFECTS, MIGRATION_243_BOM_REQUIRES_FINAL_QC } from './part153';
import { MIGRATION_244_PRODUCTION_REWORK_ORDER } from './part154';
import { MIGRATION_245_OPERATION_LABOR_AND_PM_RECURRENCE, MIGRATION_246_MPS_AND_WIP_ACCOUNT, MIGRATION_248_MATERIAL_ISSUE_LOTS } from './part155';
import { MIGRATION_247_INDUSTRY_VERTICALS } from './part156';
import { MIGRATION_249_HSE_RECORDS } from './part156';
import { MIGRATION_250_SHIPMENT_PACKING_QC } from './part156';
import { MIGRATION_251_PRODUCTION_LINES } from './part156';
import { MIGRATION_252_CERAMIC_AREA_QUOTES } from './part157';
import { MIGRATION_253_CERAMIC_QUOTE_CONVERSION } from './part158';
import { MIGRATION_254_CERAMIC_SERVICE_WORKFLOW, MIGRATION_255_SITE_MANAGEMENT } from './part159';
import { MIGRATION_256_ESTIMATE_LINE_PROGRESS, MIGRATION_257_BOQ_ESTIMATE_KIND, MIGRATION_258_SUBCONTRACTOR_CONTRACT_FIELDS, MIGRATION_259_SUBCONTRACTOR_CERTIFICATES } from './part160';
import { MIGRATION_260_LICENSE_DEVICE_CHECK_FIXES } from './part161';
import { MIGRATION_261_PLATFORM_SECURITY_INCIDENTS } from './part162';
import { MIGRATION_262_PLATFORM_POLICY_DOCUMENTS } from './part163';
import { MIGRATION_263_RESTAURANT_OPERATIONS_PHASE2 } from './part164';
import { MIGRATION_264_RESTAURANT_DELIVERY_TRACKING } from './part165';
import { MIGRATION_265_RESTAURANT_POS } from './part166';
import { MIGRATION_266_RESTAURANT_OPERATIONS_SUITE } from './part167';
import { MIGRATION_267_BOM_ITEM_WASTE } from './part168';
import { MIGRATION_268_MENU_CATEGORY_FIELDS } from './part169';
import { MIGRATION_269_RESTAURANT_GUEST_SUITE } from './part170';
import { MIGRATION_270_RESTAURANT_TABLE_LAYOUT } from './part171';
import { MIGRATION_271_RESTAURANT_OPERATIONS_GAPS } from './part172';
import { MIGRATION_272_RESTAURANT_ITEM_DISCOUNT } from './part173';
import { MIGRATION_273_RESTAURANT_MENU_ITEM_DETAILS } from './part174';
import { MIGRATION_274_DASHBOARD_USER_PREFERENCES } from './part175';
import { MIGRATION_275_RESTAURANT_REMOVAL } from './part176';
import { MIGRATION_276_COMPANY_PROFILE_FIELDS } from './part177';
import { MIGRATION_PART_114 } from './part114';
import { MIGRATION_ENTERPRISE } from './enterprise';
import { MIGRATION_014_PAYROLL_NOTIFICATION_SETTINGS, MIGRATION_050_CASH_SHIFT_AUTO_CLOSE, MIGRATION_051_CHEQUES_REPRESENTED_STATUS, MIGRATION_052_PURCHASE_INVOICE_DUE_DATES, MIGRATION_053_SALES_BATCH_RETURN_TRACEABILITY, MIGRATION_054_SALES_FINANCIAL_RECONCILIATIONS, MIGRATION_055_REMOVE_UNMODIFIED_SAMPLE_RECORDS, MIGRATION_056_SUPPLIER_PAYMENT_IDEMPOTENCY, MIGRATION_057_EXPLICIT_USER_BRANCH_SCOPE, MIGRATION_058_BRANCH_SCOPED_APPROVALS_AND_ACTION_PERMISSIONS, MIGRATION_059_INVOICE_CREATED_AT_LIST_INDEXES } from './steps/inline-014';
import { MIGRATION_060_BRANCH_SCOPED_CASH_TRANSACTIONS, MIGRATION_061_BRANCH_SCOPED_LEDGER_ENTRIES, MIGRATION_062_BRANCH_SCOPED_HR_TRANSACTIONS, MIGRATION_063_MODULE_REGISTRY_LIFECYCLE, MIGRATION_064_COMPANIES_AND_BRANCH_OWNERSHIP, MIGRATION_065_DOCUMENTS_AND_CONTRACTS, MIGRATION_066_PROJECTS_AND_HR_MODULE_HARDENING } from './steps/inline-060';
import { MIGRATION_067_HR_LEAVE_REQUESTS, MIGRATION_068_PROJECT_CONTROLS, MIGRATION_069_HR_EMPLOYEE_CONTRACTS, MIGRATION_070_HR_EMPLOYEE_DOCUMENTS, MIGRATION_071_MANUFACTURING_CORE, MIGRATION_072_COMPANY_SCOPE_COLUMNS, MIGRATION_073_MANUFACTURING_WAREHOUSE } from './steps/inline-067';
import { MIGRATION_074_MANUFACTURING_QUALITY_CHECKS, MIGRATION_075_MANUFACTURING_MAINTENANCE, MIGRATION_076_COMPANY_ORGANIZATION_SETTINGS, MIGRATION_077_COMPANY_PAYROLL_SETTINGS, MIGRATION_078_QUALITY_DISPOSITION, MIGRATION_079_SERVICE_COST_ACCOUNTS, MIGRATION_080_UOM_QUANTITY_COLUMNS, MIGRATION_081_COMPANY_SCOPE_BACKFILL, MIGRATION_082_JOURNAL_COMPANY_SCOPE, MIGRATION_083_SALES_INVOICE_PAYMENTS, MIGRATION_084_HELD_ORDERS, MIGRATION_086_PROMOTIONS } from './steps/inline-074';
import { MIGRATION_087_SYNC_EVENT_SCOPE, MIGRATION_088_SYNC_CONFLICTS_AND_VERSIONS, MIGRATION_089_SYNC_MASTER_DATA_BOOTSTRAP, MIGRATION_090_SYNC_ENTITY_POLICIES, MIGRATION_091_SYNC_REMOTE_BUSINESS_RECORDS, MIGRATION_092_SYNC_REMOTE_PURCHASE_REPORTS, MIGRATION_093_SYNC_PAYMENT_BUSINESS_RECORDS, MIGRATION_094_SYNC_STOCK_TRANSFER_BUSINESS_RECORDS, MIGRATION_095_SYNC_BRANCH_DEVICE_VERIFICATION, MIGRATION_096_BRANCH_DEVICE_ACTIVATION_ONBOARDING, MIGRATION_097_BUSINESS_TERMINOLOGY_OVERRIDES, MIGRATION_098_ACTIVITY_CONFIGURATION_VERSIONS } from './steps/inline-087';
import { MIGRATION_099_RESTAURANT_TABLE_KITCHEN_WORKFLOW, MIGRATION_100_BRANCH_SCOPED_FINANCIAL_CLOSURES, MIGRATION_101_ORDER_DEPOSITS, MIGRATION_102_ORDER_DEPOSIT_ACCOUNT, MIGRATION_103_ORDER_LIFECYCLE_DIMENSIONS, MIGRATION_101_USER_TWO_FACTOR_AUTH, MIGRATION_102_CANONICAL_PRICING_PROMOTIONS, MIGRATION_103_DEFAULT_BUSINESS_TYPE, MIGRATION_103_LEGACY_FIXED_ASSET_COUNT_SNAPSHOT_COLUMNS, MIGRATION_104_JOURNAL_ENTRIES_REFERENCE_UNIQUE, MIGRATION_113_TABLE_FIRST_INVOICE_DEFAULT, MIGRATION_114_PRODUCT_FORM_FIELD_PREFERENCES_AND_TONES } from './steps/inline-099';
import { MIGRATION_115_SUPPLIER_CLAIM_BRANCH_SCOPE, MIGRATION_116_SYNC_EXPENSE_BUSINESS_RECORDS, MIGRATION_117_SALES_RETURN_CUSTOMER_CREDITS, MIGRATION_118_SALES_RETURN_CUSTOMER_CREDIT_VAT, MIGRATION_119_SALES_RETURN_TAX_AND_RECONCILIATION, MIGRATION_120_RESTORE_RECORDED_SALES_RETURN_CREDITS, MIGRATION_121_RECORD_HISTORICAL_RETURN_PURCHASE_TAX_DECISION, MIGRATION_170_FISCAL_CLOSE_DATABASE_GUARDS, MIGRATION_171_FISCAL_PARTY_SUBLEDGER_HISTORY, MIGRATION_172_FISCAL_PARTY_SUBLEDGER_RECONCILIATION } from './steps/inline-115';
import { MIGRATION_178_INVENTORY_FIFO_GRN_PROVENANCE, MIGRATION_179_INVENTORY_RECONCILIATION_SCOPE_CHECKS, MIGRATION_180_WAREHOUSE_LOCATION_MOVEMENT_AUDIT, MIGRATION_181_SPECIAL_STOCK_DISCOUNTED_SALE_LIFECYCLE, MIGRATION_182_EXPLICIT_WAREHOUSE_TYPES, MIGRATION_183_INVENTORY_ADJUSTMENT_APPROVAL_AND_POSTING, MIGRATION_184_INVENTORY_COST_LAYER_LANDED_COST, MIGRATION_185_INVENTORY_TRANSFER_BATCH_AND_TRANSIT_TRACKING, MIGRATION_186_INVENTORY_RETURNS_LOCATION_AND_BIN_CONTROLS, MIGRATION_187_INVENTORY_REORDER_PLANNING_AND_STOCK_TRACKED_POLICY, MIGRATION_188_QUOTATION_BRANCH_COMPANY_SCOPE, MIGRATION_189_SALES_RETURN_REQUEST_FINGERPRINT } from './steps/inline-178';
import { MIGRATION_190_SALES_RETURN_INVOICE_ITEM_IDENTITY, MIGRATION_191_PROMOTION_USAGE_REVERSAL_AUDIT, MIGRATION_192_ORDER_DEPOSIT_REFUNDS, MIGRATION_193_ALLOW_PARTIAL_ORDER_DEPOSIT_REFUNDS, MIGRATION_194_SALES_INVOICE_EXTRA_FEE_BREAKDOWN, MIGRATION_195_DYNAMIC_APPROVAL_POLICIES, MIGRATION_197_INVENTORY_BATCH_SORTING_GRADE, MIGRATION_196_APPROVAL_WORKFLOW_DECISIONS } from './steps/inline-190';
import { MIGRATION_198_PRODUCT_SERIALS } from './steps/inline-198';
import { MIGRATION_199_POS_INVOICE_DRAFTS } from './steps/inline-199';

export { DEFAULT_SETTINGS, DEFAULT_BRANCH_ID } from './support';
export type { Migration } from './support';

export const MIGRATIONS: Migration[] = [
  MIGRATION_PART_01,
  MIGRATION_PART_02,
  MIGRATION_PART_03,
  MIGRATION_PART_04,
  MIGRATION_PART_05,
  MIGRATION_PART_06,
  MIGRATION_PART_07,
  MIGRATION_PART_08,
  MIGRATION_PART_09,
  MIGRATION_PART_10,
  MIGRATION_PART_11,
  MIGRATION_PART_12,
  MIGRATION_PART_13,
  MIGRATION_014_PAYROLL_NOTIFICATION_SETTINGS,
  MIGRATION_ENTERPRISE,
  MIGRATION_PART_54,
  MIGRATION_PART_55,
  MIGRATION_PART_56,
  MIGRATION_PART_57,
  MIGRATION_PART_58,
  MIGRATION_PART_59,
  MIGRATION_PART_60,
  MIGRATION_PART_61,
  MIGRATION_PART_62,
  MIGRATION_PART_63,
  MIGRATION_PART_64,
  MIGRATION_PART_65,
  MIGRATION_PART_66,
  MIGRATION_PART_67,
  MIGRATION_PART_68,
  MIGRATION_PART_69,
  MIGRATION_PART_70,
  MIGRATION_PART_71,
  MIGRATION_PART_72,
  MIGRATION_PART_73,
  MIGRATION_PART_74,
  MIGRATION_PART_76,
  MIGRATION_PART_77,
  MIGRATION_PART_79,
  MIGRATION_PART_80,
  MIGRATION_PART_81,
  MIGRATION_PART_82,
  MIGRATION_PART_83,
  MIGRATION_PART_84,
  MIGRATION_PART_85,
  MIGRATION_PART_100,
  ...MIGRATION_PART_101,
  ...MIGRATION_PART_102,
  ...MIGRATION_PART_103,
  ...MIGRATION_PART_104,
  ...MIGRATION_PART_105,
  ...MIGRATION_PART_106,
  ...MIGRATION_PART_107,
  ...MIGRATION_PART_108,
  ...MIGRATION_PART_109,
  MIGRATION_PART_110,
  MIGRATION_PART_111,
  MIGRATION_PART_112,
  MIGRATION_PART_113,
  MIGRATION_PART_114,
  MIGRATION_PART_115,
  MIGRATION_PART_116,
  MIGRATION_PART_117,
  MIGRATION_PART_118,
  MIGRATION_PART_119,
  MIGRATION_050_CASH_SHIFT_AUTO_CLOSE,
  MIGRATION_051_CHEQUES_REPRESENTED_STATUS,
  MIGRATION_052_PURCHASE_INVOICE_DUE_DATES,
  MIGRATION_053_SALES_BATCH_RETURN_TRACEABILITY,
  MIGRATION_054_SALES_FINANCIAL_RECONCILIATIONS,
  MIGRATION_055_REMOVE_UNMODIFIED_SAMPLE_RECORDS,
  MIGRATION_056_SUPPLIER_PAYMENT_IDEMPOTENCY,
  MIGRATION_057_EXPLICIT_USER_BRANCH_SCOPE,
  MIGRATION_058_BRANCH_SCOPED_APPROVALS_AND_ACTION_PERMISSIONS,
  MIGRATION_059_INVOICE_CREATED_AT_LIST_INDEXES,
  MIGRATION_060_BRANCH_SCOPED_CASH_TRANSACTIONS,
  MIGRATION_061_BRANCH_SCOPED_LEDGER_ENTRIES,
  MIGRATION_062_BRANCH_SCOPED_HR_TRANSACTIONS,
  MIGRATION_063_MODULE_REGISTRY_LIFECYCLE,
  MIGRATION_064_COMPANIES_AND_BRANCH_OWNERSHIP,
  MIGRATION_065_DOCUMENTS_AND_CONTRACTS,
  MIGRATION_066_PROJECTS_AND_HR_MODULE_HARDENING,
  MIGRATION_067_HR_LEAVE_REQUESTS,
  MIGRATION_068_PROJECT_CONTROLS,
  MIGRATION_069_HR_EMPLOYEE_CONTRACTS,
  MIGRATION_070_HR_EMPLOYEE_DOCUMENTS,
  MIGRATION_071_MANUFACTURING_CORE,
  MIGRATION_072_COMPANY_SCOPE_COLUMNS,
  MIGRATION_073_MANUFACTURING_WAREHOUSE,
  MIGRATION_074_MANUFACTURING_QUALITY_CHECKS,
  MIGRATION_075_MANUFACTURING_MAINTENANCE,
  MIGRATION_076_COMPANY_ORGANIZATION_SETTINGS,
  MIGRATION_077_COMPANY_PAYROLL_SETTINGS,
  MIGRATION_078_QUALITY_DISPOSITION,
  MIGRATION_079_SERVICE_COST_ACCOUNTS,
  MIGRATION_080_UOM_QUANTITY_COLUMNS,
  MIGRATION_081_COMPANY_SCOPE_BACKFILL,
  MIGRATION_082_JOURNAL_COMPANY_SCOPE,
  MIGRATION_083_SALES_INVOICE_PAYMENTS,
  MIGRATION_084_HELD_ORDERS,
  MIGRATION_086_PROMOTIONS,
  MIGRATION_087_SYNC_EVENT_SCOPE,
  MIGRATION_088_SYNC_CONFLICTS_AND_VERSIONS,
  MIGRATION_089_SYNC_MASTER_DATA_BOOTSTRAP,
  MIGRATION_090_SYNC_ENTITY_POLICIES,
  MIGRATION_091_SYNC_REMOTE_BUSINESS_RECORDS,
  MIGRATION_092_SYNC_REMOTE_PURCHASE_REPORTS,
  MIGRATION_093_SYNC_PAYMENT_BUSINESS_RECORDS,
  MIGRATION_094_SYNC_STOCK_TRANSFER_BUSINESS_RECORDS,
  MIGRATION_095_SYNC_BRANCH_DEVICE_VERIFICATION,
  MIGRATION_096_BRANCH_DEVICE_ACTIVATION_ONBOARDING,
  MIGRATION_097_BUSINESS_TERMINOLOGY_OVERRIDES,
  MIGRATION_098_ACTIVITY_CONFIGURATION_VERSIONS,
  MIGRATION_099_RESTAURANT_TABLE_KITCHEN_WORKFLOW,
  MIGRATION_100_BRANCH_SCOPED_FINANCIAL_CLOSURES,
  MIGRATION_101_ORDER_DEPOSITS,
  MIGRATION_102_ORDER_DEPOSIT_ACCOUNT,
  MIGRATION_103_ORDER_LIFECYCLE_DIMENSIONS,
  MIGRATION_101_USER_TWO_FACTOR_AUTH,
  MIGRATION_102_CANONICAL_PRICING_PROMOTIONS,
  MIGRATION_103_DEFAULT_BUSINESS_TYPE,
  MIGRATION_103_LEGACY_FIXED_ASSET_COUNT_SNAPSHOT_COLUMNS,
  MIGRATION_104_JOURNAL_ENTRIES_REFERENCE_UNIQUE,
  ...MIGRATION_PART_14,
  ...MIGRATION_PART_15,
  MIGRATION_113_TABLE_FIRST_INVOICE_DEFAULT,
  MIGRATION_114_PRODUCT_FORM_FIELD_PREFERENCES_AND_TONES,
  MIGRATION_115_SUPPLIER_CLAIM_BRANCH_SCOPE,
  MIGRATION_116_SYNC_EXPENSE_BUSINESS_RECORDS,
  MIGRATION_117_SALES_RETURN_CUSTOMER_CREDITS,
  MIGRATION_118_SALES_RETURN_CUSTOMER_CREDIT_VAT,
  MIGRATION_119_SALES_RETURN_TAX_AND_RECONCILIATION,
  MIGRATION_120_RESTORE_RECORDED_SALES_RETURN_CREDITS,
  MIGRATION_121_RECORD_HISTORICAL_RETURN_PURCHASE_TAX_DECISION,
  ...MIGRATION_PART_16,
  ...MIGRATION_PART_17,
  ...MIGRATION_PART_18,
  ...MIGRATION_PART_19,
  ...MIGRATION_PART_20,
  ...MIGRATION_PART_21,
  ...MIGRATION_PART_22,
  ...MIGRATION_PART_23,
  ...MIGRATION_PART_24,
  ...MIGRATION_PART_25,
  ...MIGRATION_PART_26,
  ...MIGRATION_PART_27,
  ...MIGRATION_PART_28,
  ...MIGRATION_PART_29,
  ...MIGRATION_PART_30,
  ...MIGRATION_PART_31,
  ...MIGRATION_PART_32,
  ...MIGRATION_PART_33,
  ...MIGRATION_PART_34,
  ...MIGRATION_PART_36,
  ...MIGRATION_PART_35,
  ...MIGRATION_PART_37,
  ...MIGRATION_PART_38,
  ...MIGRATION_PART_39,
  ...MIGRATION_PART_40,
  ...MIGRATION_PART_41,
  ...MIGRATION_PART_42,
  ...MIGRATION_PART_43,
  ...MIGRATION_PART_44,
  ...MIGRATION_PART_45,
  ...MIGRATION_PART_46,
  ...MIGRATION_PART_47,
  ...MIGRATION_PART_48,
  ...MIGRATION_PART_49,
  ...MIGRATION_PART_50,
  ...MIGRATION_PART_51,
  ...MIGRATION_PART_52,
  MIGRATION_PART_53,
  MIGRATION_170_FISCAL_CLOSE_DATABASE_GUARDS,
  MIGRATION_171_FISCAL_PARTY_SUBLEDGER_HISTORY,
  MIGRATION_172_FISCAL_PARTY_SUBLEDGER_RECONCILIATION,
  MIGRATION_178_INVENTORY_FIFO_GRN_PROVENANCE,
  MIGRATION_179_INVENTORY_RECONCILIATION_SCOPE_CHECKS,
  MIGRATION_180_WAREHOUSE_LOCATION_MOVEMENT_AUDIT,
  MIGRATION_181_SPECIAL_STOCK_DISCOUNTED_SALE_LIFECYCLE,
  MIGRATION_182_EXPLICIT_WAREHOUSE_TYPES,
  MIGRATION_183_INVENTORY_ADJUSTMENT_APPROVAL_AND_POSTING,
  MIGRATION_184_INVENTORY_COST_LAYER_LANDED_COST,
  MIGRATION_185_INVENTORY_TRANSFER_BATCH_AND_TRANSIT_TRACKING,
  MIGRATION_186_INVENTORY_RETURNS_LOCATION_AND_BIN_CONTROLS,
  MIGRATION_187_INVENTORY_REORDER_PLANNING_AND_STOCK_TRACKED_POLICY,
  MIGRATION_188_QUOTATION_BRANCH_COMPANY_SCOPE,
  MIGRATION_189_SALES_RETURN_REQUEST_FINGERPRINT,
  MIGRATION_190_SALES_RETURN_INVOICE_ITEM_IDENTITY,
  MIGRATION_191_PROMOTION_USAGE_REVERSAL_AUDIT,
  MIGRATION_192_ORDER_DEPOSIT_REFUNDS,
  MIGRATION_193_ALLOW_PARTIAL_ORDER_DEPOSIT_REFUNDS,
  MIGRATION_194_SALES_INVOICE_EXTRA_FEE_BREAKDOWN,
  MIGRATION_195_DYNAMIC_APPROVAL_POLICIES,
  MIGRATION_197_INVENTORY_BATCH_SORTING_GRADE,
  MIGRATION_196_APPROVAL_WORKFLOW_DECISIONS,
  MIGRATION_198_PRODUCT_SERIALS,
  MIGRATION_199_POS_INVOICE_DRAFTS,
  MIGRATION_PART_120,
  MIGRATION_PART_121,
  MIGRATION_PART_122,
  MIGRATION_PART_123,
  MIGRATION_PART_124,
  MIGRATION_PART_125,
  MIGRATION_PART_126,
  MIGRATION_PART_127,
  MIGRATION_PART_128,
  MIGRATION_PART_129,
  MIGRATION_PART_130,
  MIGRATION_PART_131,
  MIGRATION_PART_132,
  MIGRATION_PART_133,
  MIGRATION_PART_134,
  MIGRATION_PART_135,
  MIGRATION_PART_136,
  MIGRATION_PART_137,
  MIGRATION_PART_138,
  MIGRATION_PART_139,
  MIGRATION_PART_140,
  MIGRATION_PART_141,
  MIGRATION_PART_142,
  MIGRATION_PART_143,
  MIGRATION_PART_144,
  MIGRATION_PART_145,
  MIGRATION_PART_146,
  MIGRATION_PART_147,
  MIGRATION_PART_148,
  MIGRATION_PART_149,
  ...MIGRATION_PART_150,
  MIGRATION_237_BOM_OPERATIONS,
  MIGRATION_238_MANUFACTURING_DOWNTIME,
  MIGRATION_239_MANUFACTURING_PHASE2_COLUMNS,
  MIGRATION_240_PRODUCTION_ORDER_APPROVAL,
  MIGRATION_241_PRODUCTION_OPERATOR_AND_BATCH,
  MIGRATION_242_QUALITY_AQL_AND_DEFECTS,
  MIGRATION_243_BOM_REQUIRES_FINAL_QC,
  MIGRATION_244_PRODUCTION_REWORK_ORDER,
  MIGRATION_245_OPERATION_LABOR_AND_PM_RECURRENCE,
  MIGRATION_246_MPS_AND_WIP_ACCOUNT,
  MIGRATION_247_INDUSTRY_VERTICALS,
  MIGRATION_248_MATERIAL_ISSUE_LOTS,
  MIGRATION_249_HSE_RECORDS,
  MIGRATION_250_SHIPMENT_PACKING_QC,
  MIGRATION_251_PRODUCTION_LINES,
  MIGRATION_252_CERAMIC_AREA_QUOTES,
  MIGRATION_253_CERAMIC_QUOTE_CONVERSION,
  MIGRATION_254_CERAMIC_SERVICE_WORKFLOW,
  MIGRATION_255_SITE_MANAGEMENT,
  MIGRATION_256_ESTIMATE_LINE_PROGRESS,
  MIGRATION_257_BOQ_ESTIMATE_KIND,
  MIGRATION_258_SUBCONTRACTOR_CONTRACT_FIELDS,
  MIGRATION_259_SUBCONTRACTOR_CERTIFICATES,
  MIGRATION_260_LICENSE_DEVICE_CHECK_FIXES,
  MIGRATION_261_PLATFORM_SECURITY_INCIDENTS,
  MIGRATION_262_PLATFORM_POLICY_DOCUMENTS,
  MIGRATION_263_RESTAURANT_OPERATIONS_PHASE2,
  MIGRATION_264_RESTAURANT_DELIVERY_TRACKING,
  MIGRATION_265_RESTAURANT_POS,
  MIGRATION_266_RESTAURANT_OPERATIONS_SUITE,
  MIGRATION_267_BOM_ITEM_WASTE,
  MIGRATION_268_MENU_CATEGORY_FIELDS,
  MIGRATION_269_RESTAURANT_GUEST_SUITE,
  MIGRATION_270_RESTAURANT_TABLE_LAYOUT,
  MIGRATION_271_RESTAURANT_OPERATIONS_GAPS,
  MIGRATION_272_RESTAURANT_ITEM_DISCOUNT,
  MIGRATION_273_RESTAURANT_MENU_ITEM_DETAILS,
  MIGRATION_274_DASHBOARD_USER_PREFERENCES,
  MIGRATION_275_RESTAURANT_REMOVAL,
  MIGRATION_276_COMPANY_PROFILE_FIELDS,
].flat().sort((left, right) => {
  const leftNumber = Number(/^([0-9]+)/.exec(left.id || '')?.[1] ?? Number.MAX_SAFE_INTEGER);
  const rightNumber = Number(/^([0-9]+)/.exec(right.id || '')?.[1] ?? Number.MAX_SAFE_INTEGER);
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  return String(left.id || '').localeCompare(String(right.id || ''));
});

/** Validate the append-only migration catalog before touching a database. */
export function validateMigrationCatalog(migrations: Migration[] = MIGRATIONS): void {
  const seen = new Set<string>();
  let previousNumber = -1;
  for (const migration of migrations) {
    if (!migration.id || seen.has(migration.id)) {
      throw new Error(`Duplicate or empty migration id: ${migration.id || '<empty>'}`);
    }
    seen.add(migration.id);
    const numeric = Number(/^([0-9]+)/.exec(migration.id)?.[1]);
    if (Number.isFinite(numeric) && numeric < previousNumber) {
      throw new Error(`Migration catalog is out of numeric order at ${migration.id}.`);
    }
    if (Number.isFinite(numeric)) previousNumber = numeric;
  }
}

validateMigrationCatalog();

export interface MigrationReport {
  applied: string[];
  skipped: string[];
  failed: Array<{ id: string; error: string }>;
  /** True when the stored bundle fingerprint matched and no DDL/migration ran. */
  schemaReplayed: boolean;
}

function appliedIds(db: Database): Set<string> {
  const res = db.exec('SELECT id FROM schema_migrations');
  return new Set((res[0]?.values ?? []).map((row) => String(row[0])));
}

function setForeignKeysEnabled(db: Database, errorMessage: string): void {
  db.run('PRAGMA foreign_keys = ON');
  const enabled = Number(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0]) === 1;
  if (!enabled) {
    throw new Error(errorMessage);
  }
}

function createSchemaTables(db: Database): void {
  const schemaWithoutIndexes = SCHEMA_SQL.replace(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?;\s*/gi,
    ''
  );
  db.run('BEGIN TRANSACTION');
  try {
    db.exec(schemaWithoutIndexes);
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function applyMigration(db: Database, migration: Migration, report: MigrationReport): boolean {
  if (migration.disableForeignKeys) {
    db.run('PRAGMA foreign_keys = OFF');
  }

  let applied = false;
  try {
    db.run('BEGIN TRANSACTION');
    migration.up(db);
    db.run('INSERT OR REPLACE INTO schema_migrations (id, description) VALUES (?, ?)', [
      migration.id,
      migration.description,
    ]);
    db.run('COMMIT');
    report.applied.push(migration.id);
    applied = true;
  } catch (error) {
    try { db.run('ROLLBACK'); } catch { /* transaction may already be closed */ }
    const message = error instanceof Error ? error.message : String(error);
    report.failed.push({ id: migration.id, error: message });
    console.error(`❌ Migration ${migration.id} failed:`, message);
  } finally {
    setForeignKeysEnabled(
      db,
      `SQLite foreign key enforcement was not restored after migration ${migration.id}.`
    );
  }
  return applied;
}

function applyPendingMigrations(db: Database, report: MigrationReport): void {
  const done = appliedIds(db);
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) {
      report.skipped.push(migration.id);
      continue;
    }
    if (!applyMigration(db, migration, report)) {
      break;
    }
  }
}

function createSchemaIndexes(db: Database): void {
  db.run('BEGIN TRANSACTION');
  try {
    db.exec(SCHEMA_SQL);
    db.run('COMMIT');
  } catch (error) {
    try { db.run('ROLLBACK'); } catch { /* transaction may already be closed */ }
    throw error;
  }
}

const SCHEMA_BUNDLE_SETTINGS_KEY = '__schema_bundle_v1';

/**
 * Fingerprint of everything runMigrations can change: the declarative schema
 * text plus the ordered migration catalog. When it matches the marker stored
 * in system_settings, the database already reflects the current bundle and
 * the (large) idempotent schema replay can be skipped entirely on boot.
 */
let cachedSchemaFingerprint: string | null = null;

function schemaBundleFingerprint(): string {
  if (cachedSchemaFingerprint !== null) return cachedSchemaFingerprint;
  const ids = MIGRATIONS.map((migration) => migration.id).join(',');
  let hash = 0x811c9dc5;
  const input = `${SCHEMA_SQL.length}:${ids}:${SCHEMA_SQL}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  cachedSchemaFingerprint = `${MIGRATIONS.length}:${SCHEMA_SQL.length}:${hash.toString(16)}`;
  return cachedSchemaFingerprint;
}

/**
 * The bundle marker alone is not sufficient: schema_migrations rows could be
 * lost independently (partial restore, manual repair), in which case pending
 * migrations must re-apply even though the code bundle is unchanged.
 */
function schemaMigrationsComplete(db: Database): boolean {
  try {
    const applied = appliedIds(db);
    return MIGRATIONS.every((migration) => applied.has(migration.id));
  } catch {
    return false;
  }
}

/** Cheap steady-state check: marker matches AND every migration is recorded. */
export function isSchemaBundleCurrent(db: Database): boolean {
  return readSchemaBundleMarker(db) === schemaBundleFingerprint()
    && schemaMigrationsComplete(db);
}

function readSchemaBundleMarker(db: Database): string | null {
  try {
    const row = db.exec(
      'SELECT value FROM system_settings WHERE key = ?',
      [SCHEMA_BUNDLE_SETTINGS_KEY],
    )[0]?.values?.[0]?.[0];
    return row == null ? null : String(row);
  } catch {
    // system_settings does not exist yet on a fresh database.
    return null;
  }
}

function writeSchemaBundleMarker(db: Database, fingerprint: string): void {
  try {
    db.run(
      'INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)',
      [SCHEMA_BUNDLE_SETTINGS_KEY, fingerprint],
    );
  } catch {
    // Marker is a boot-time optimization only; never fail migrations over it.
  }
}

/**
 * sqlite_stat1 persists inside the database file, so ANALYZE only needs to run
 * once per database lifetime. The query planner on a ~550-table schema benefits
 * measurably from fresh statistics; skipping it when stat tables already exist
 * keeps steady-state boots cheap.
 */
function ensureSqliteStats(db: Database): void {
  try {
    const exists = db.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_stat1'",
    )[0]?.values?.length;
    if (!exists) {
      db.exec('ANALYZE');
    }
  } catch {
    // Statistics are advisory; a failure must not block startup.
  }
}

/**
 * Brings any database — brand new or years old — up to the current schema.
 * Call on every startup, before any service issues a query.
 *
 * A migration that throws is left unrecorded. Later migrations depend on earlier
 * schema and data invariants, so stop immediately and retry on the next launch.
 */
export function runMigrations(db: Database): MigrationReport {
  const report: MigrationReport = { applied: [], skipped: [], failed: [], schemaReplayed: false };

  // PRAGMA foreign_keys is connection-scoped and SQLite ignores changes made
  // inside a transaction, so configure it before executing schema/migrations.
  setForeignKeysEnabled(db, 'SQLite foreign key enforcement could not be enabled.');

  // 0. Steady-state fast path: when the stored bundle fingerprint matches, the
  //    schema tables, indexes and every migration already reflect this exact
  //    SCHEMA_SQL + migration catalog, so replaying thousands of idempotent
  //    DDL statements on every boot is pure overhead.
  if (isSchemaBundleCurrent(db)) {
    report.schemaReplayed = true;
    report.skipped.push(...MIGRATIONS.map((migration) => migration.id));
    ensureSqliteStats(db);
    return report;
  }

  // 1. Create missing tables before migrations. Indexes are deferred because a
  //    legacy table may not have the columns referenced by a newer index yet.
  //    Executing the whole schema at once would roll back table creation too,
  //    leaving migrations unable to add those columns on the next launch.
  createSchemaTables(db);

  // 2. Apply the ordered migration list.
  applyPendingMigrations(db, report);

  // 3. Re-run the idempotent schema after column migrations so all indexes
  //    exist on both fresh and upgraded databases.
  if (report.failed.length === 0) {
    createSchemaIndexes(db);
    writeSchemaBundleMarker(db, schemaBundleFingerprint());
    ensureSqliteStats(db);
  }

  if (report.applied.length > 0) {
    console.log(`✅ Applied ${report.applied.length} migration(s):`, report.applied.join(', '));
  }

  return report;
}
