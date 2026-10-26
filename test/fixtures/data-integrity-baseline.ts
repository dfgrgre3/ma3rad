/**
 * Expected outcomes for the repeatable receivables/inventory lifecycle tests.
 * Keep these business results stable across releases; update only with an
 * explicitly reviewed accounting or inventory policy change.
 */
export const DATA_INTEGRITY_BASELINE = {
  purchaseReceipt: {
    partialQuantityM2: 4,
    finalQuantityM2: 10,
    receiptCount: 2,
  },
  customerAllocation: {
    totalReceipt: 15,
    invoiceRemainingM2: [15, 10],
    paymentRows: 2,
  },
  supplierPaymentRetry: {
    initialBalance: 100,
    paymentAmount: 25,
    expectedBalance: 75,
    paymentRows: 1,
  },
  balanceReconciliation: {
    customerBalance: 12.34,
    supplierBalance: 23.45,
    stockQuantityM2: 4.5,
    stockUnitCost: 8.25,
    stockValue: 37.13,
  },
} as const;
