/**
 * Indexes إضافية لتحسين أداء الاستعلامات المستخدمة بشكل متكرر في التقارير والجداول الكبيرة.
 * هذه الملفات تُنفذ بعد إنشاء الجداول الأساسية في schema parts.
 */

export const DATABASE_INDEXES = String.raw`

-- ============================================
-- Indexes لتقارير المبيعات والفواتير (ReportCenterService, CustomerReportsService, FinancialReportsService)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_date ON sales_invoices(customer_id, date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_date_status ON sales_invoices(date, invoice_status);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_warehouse_date ON sales_invoices(warehouse_id, date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_remaining ON sales_invoices(remaining_amount) WHERE remaining_amount > 0.01;
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer ON sales_invoices(customer_id);

-- ============================================
-- Indexes لعملاء والمديونيات (CustomerReportsService.creditExposure, customerAging)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customers_credit_limit ON customers(credit_limit);
CREATE INDEX IF NOT EXISTS idx_customers_current_balance ON customers(current_balance);
CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id);

-- ============================================
-- Indexes للشيكات (CustomerReportsService.chequeMaturity)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_cheques_status_due ON cheques(status, due_date);
CREATE INDEX IF NOT EXISTS idx_cheques_party ON cheques(party_name);

-- ============================================
-- Indexes للمشتريات (FinancialReportsService, PurchaseReports)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date_supplier ON purchase_invoices(date, supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_warehouse_date ON purchase_invoices(warehouse_id, date);

-- ============================================
-- Indexes للموظفين والرواتب (PayrollReportsService, EmployeeService)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_employees_branch_status ON employees(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_payroll_transactions_employee_date ON payroll_transactions(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_payroll_transactions_date ON payroll_transactions(date);

-- ============================================
-- Indexes للمخزون (InventoryReportsService.slowMovingStock)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_quantity ON warehouse_stock(quantity_m2) WHERE quantity_m2 > 0;
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_cost_price ON products(cost_price);

-- ============================================
-- Indexes للحسابات والتدفقات النقدية (FinancialReportsService.cashMovement)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customer_payments_date_register ON customer_payments(date, register_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_date_register ON supplier_payments(date, register_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date_register ON expenses(date, register_id);
CREATE INDEX IF NOT EXISTS idx_cash_registers_branch ON cash_registers(branch_id);

-- ============================================
-- Indexes لسجل التدقيق والموافقات (operationsLog, exceptionsLog)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at_type ON approval_requests(created_at, request_type);

-- ============================================
-- Indexes لجداول العناصر (Invoice items, Purchase items)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_product_invoice ON sales_invoice_items(product_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_product_invoice ON purchase_invoice_items(product_id, purchase_id);

-- ============================================
-- Indexes للفرع (Branch Access Service)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_branches_id ON branches(id);

-- ============================================
-- End of Database Indexes
-- ============================================

`;