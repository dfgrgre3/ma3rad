type SqlMode = 'query' | 'run' | 'exec';

const READ_PERMISSION: Record<string, string[]> = {
  users: ['users.view', 'users.permissions'], user_sessions: ['users.view'], login_history: ['users.view'],
  permissions: ['users.permissions', 'roles.manage'], roles: ['roles.manage'], role_permissions: ['roles.manage'], user_permissions: ['users.permissions'],
  products: ['products.view'], categories: ['categories.view', 'products.view'], brands: ['brands.view', 'products.view'],
  warehouse_stock: ['inventory.view', 'products.view', 'sales.view', 'purchases.view'], inventory_transactions: ['inventory.view', 'sales.view', 'purchases.view'], warehouses: ['warehouses.view', 'inventory.view'],
  sales_invoices: ['sales.view', 'reports.view', 'finance.view', 'customers.view'], sales_invoice_items: ['sales.view', 'reports.view', 'products.view'], sales_returns: ['returns.view', 'sales.view'], sales_return_items: ['returns.view', 'sales.view'],
  customers: ['customers.view', 'sales.view', 'finance.debts.view'], customer_payments: ['customers.view', 'customers.payment', 'finance.view'], customer_payment_promises: ['customers.view', 'finance.debts.view'],
  suppliers: ['suppliers.view', 'purchases.view'], supplier_payments: ['suppliers.view', 'suppliers.payment', 'finance.view'], purchase_invoices: ['purchases.view', 'reports.view', 'finance.view'], purchase_invoice_items: ['purchases.view', 'products.view'], purchase_returns: ['purchases.view', 'returns.view'], purchase_return_items: ['purchases.view', 'returns.view'],
  cash_registers: ['cashier.view', 'finance.view'], cash_shifts: ['cashier.view'], expenses: ['cashier.view', 'reports.view', 'finance.view'], expense_categories: ['cashier.view'],
  audit_logs: ['audit.view'], system_settings: ['settings.view'], backup_history: ['settings.backup'], notifications: ['notifications.view'],
  branches: ['branches.view', 'operations.view'], employees: ['employees.view'], departments: ['employees.view'], employee_attendance: ['employees.view'], attendance: ['employees.view'], payroll_transactions: ['employees.manage'], commissions: ['employees.view'],
  quotations: ['quotations.view', 'sales.view'], quotation_items: ['quotations.view', 'sales.view'], orders: ['orders.view', 'sales.view'], order_items: ['orders.view', 'sales.view'],
  receivables: ['finance.debts.view'], receivable_updates: ['finance.debts.view'], receivable_attachments: ['finance.debts.view'], installment_plans: ['finance.installments.view'], installments: ['finance.installments.view'], cheques: ['finance.view'], fixed_assets: ['finance.view'], chart_of_accounts: ['finance.view'], journal_entries: ['finance.view'], journal_entry_lines: ['finance.view'],
  projects: ['projects.view'], project_units: ['projects.view'], project_products: ['projects.view'], leads: ['crm.view'], crm_activities: ['crm.view'],
  drivers: ['drivers.view', 'deliveries.view'], vehicles: ['vehicles.view', 'deliveries.view'], vehicle_maintenance: ['vehicles.view'], deliveries: ['deliveries.view'], delivery_items: ['deliveries.view'],
  price_lists: ['pricing.view'], price_list_items: ['pricing.view'], customer_price_overrides: ['pricing.view', 'customers.view'], price_change_history: ['pricing.view'], promotions: ['promotions.view'], promotion_targets: ['promotions.view'], campaigns: ['crm.view'],
  approvals: ['approvals.view'], approval_requests: ['approvals.view'],
  stock_transfers: ['inventory.view'], stock_transfer_items: ['inventory.view'], stock_counts: ['inventory.view'], stock_count_items: ['inventory.view'], stock_adjustments: ['inventory.view'], stock_adjustment_items: ['inventory.view'], stock_reservations: ['inventory.view'],
  purchase_requests: ['purchases.view'], purchase_request_items: ['purchases.view'], purchase_orders: ['purchases.view'], purchase_order_items: ['purchases.view'], purchase_order_receipts: ['purchases.view'], purchase_order_receipt_items: ['purchases.view'],
  attributes: ['products.view'], attribute_options: ['products.view'], product_attribute_values: ['products.view'], product_variants: ['products.view'], product_images: ['products.view'], product_documents: ['products.view'],
};

const WRITE_PERMISSION: Record<string, { insert?: string[]; update?: string[]; delete?: string[] }> = {
  employees: { insert: ['employees.manage'], update: ['employees.manage'], delete: ['employees.manage'] }, employee_attendance: { insert: ['employees.manage'], update: ['employees.manage'], delete: ['employees.manage'] }, attendance: { insert: ['employees.manage'], update: ['employees.manage'], delete: ['employees.manage'] }, payroll_transactions: { insert: ['employees.manage'], update: ['employees.manage'], delete: ['employees.manage'] },
  chart_of_accounts: { insert: ['finance.approve'], update: ['finance.approve'], delete: ['finance.approve'] }, journal_entries: { insert: ['finance.approve'], update: ['finance.approve'], delete: ['finance.approve'] }, journal_entry_lines: { insert: ['finance.approve'], update: ['finance.approve'], delete: ['finance.approve'] }, cheques: { insert: ['finance.approve'], update: ['finance.approve'], delete: ['finance.approve'] }, fixed_assets: { insert: ['finance.approve'], update: ['finance.approve'], delete: ['finance.approve'] },
  users: { insert: ['users.create'], update: ['users.update', 'users.permissions', 'users.reset_password'], delete: ['users.delete'] },
  permissions: { insert: ['roles.manage'], update: ['roles.manage'], delete: ['roles.manage'] }, roles: { insert: ['roles.manage'], update: ['roles.manage'], delete: ['roles.manage'] }, role_permissions: { insert: ['roles.manage'], update: ['roles.manage'], delete: ['roles.manage'] }, user_permissions: { insert: ['users.permissions'], update: ['users.permissions'], delete: ['users.permissions'] },
  products: { insert: ['products.create'], update: ['products.update'], delete: ['products.delete'] }, categories: { insert: ['categories.create'], update: ['categories.update'], delete: ['categories.delete'] }, brands: { insert: ['brands.create'], update: ['brands.update'], delete: ['brands.delete'] },
  sales_invoices: { insert: ['sales.create'], update: ['sales.update', 'customers.payment', 'sales.void'], delete: ['sales.void'] }, sales_invoice_items: { insert: ['sales.create'], update: ['sales.update'], delete: ['sales.void'] }, sales_returns: { insert: ['sales.refund'], update: ['sales.refund'], delete: ['sales.refund'] }, sales_return_items: { insert: ['sales.refund'], update: ['sales.refund'], delete: ['sales.refund'] },
  customers: { insert: ['customers.create'], update: ['customers.update', 'customers.payment', 'sales.create', 'sales.refund'], delete: ['customers.delete'] }, customer_payments: { insert: ['customers.payment'], update: ['customers.payment'], delete: ['customers.payment'] },
  suppliers: { insert: ['suppliers.create'], update: ['suppliers.update', 'suppliers.payment', 'purchases.create'], delete: ['suppliers.delete'] }, supplier_payments: { insert: ['suppliers.payment'], update: ['suppliers.payment'], delete: ['suppliers.payment'] }, purchase_invoices: { insert: ['purchases.create'], update: ['purchases.update'], delete: ['purchases.delete'] }, purchase_invoice_items: { insert: ['purchases.create'], update: ['purchases.update'], delete: ['purchases.delete'] }, purchase_returns: { insert: ['purchases.return'], update: ['purchases.return'], delete: ['purchases.return'] }, purchase_return_items: { insert: ['purchases.return'], update: ['purchases.return'], delete: ['purchases.return'] },
  warehouse_stock: { insert: ['inventory.adjust', 'sales.create', 'purchases.create'], update: ['inventory.adjust', 'inventory.transfer', 'sales.create', 'purchases.create', 'sales.refund', 'purchases.return'], delete: ['inventory.adjust'] }, inventory_transactions: { insert: ['inventory.adjust', 'inventory.transfer', 'sales.create', 'purchases.create', 'sales.refund', 'purchases.return'], update: ['inventory.adjust'], delete: ['inventory.adjust'] },
  cash_registers: { insert: ['cashier.manage'], update: ['cashier.manage', 'sales.create', 'customers.payment', 'suppliers.payment', 'cashier.expense'], delete: ['cashier.manage'] }, cash_shifts: { insert: ['cashier.shift'], update: ['cashier.shift', 'sales.create', 'customers.payment', 'suppliers.payment', 'cashier.expense'], delete: ['cashier.manage'] }, expenses: { insert: ['cashier.expense'], update: ['cashier.expense'], delete: ['cashier.expense'] },
  audit_logs: { insert: ['audit.view', 'sales.create', 'sales.update', 'sales.refund', 'customers.payment', 'customers.update', 'purchases.create', 'purchases.update', 'purchases.return', 'cashier.expense', 'cashier.shift', 'inventory.adjust', 'inventory.transfer', 'inventory.count', 'products.create', 'products.update', 'categories.create', 'categories.update', 'brands.create', 'brands.update', 'customers.create', 'customers.delete', 'suppliers.create', 'suppliers.update', 'employees.manage', 'orders.create', 'orders.update', 'quotations.create', 'quotations.update', 'projects.create', 'projects.update', 'crm.create', 'crm.update', 'pricing.update', 'promotions.manage', 'deliveries.manage', 'drivers.manage', 'vehicles.manage', 'settings.update', 'users.create', 'users.update', 'roles.manage', 'finance.approve', 'admin.data'], update: ['admin.data'], delete: ['admin.data'] },
  system_settings: { insert: ['settings.update'], update: ['settings.update'], delete: ['settings.update'] }, backup_history: { insert: ['settings.backup'], update: ['settings.backup'], delete: ['settings.backup'] }, notifications: { insert: ['notifications.view'], update: ['notifications.view'], delete: ['notifications.view'] },
  sequence_counters: { insert: ['admin.data'], update: ['admin.data'], delete: ['admin.data'] }, schema_migrations: { insert: ['admin.data'], update: ['admin.data'], delete: ['admin.data'] },
  stock_transfers: { insert: ['inventory.transfer'], update: ['inventory.transfer'], delete: ['inventory.transfer'] }, stock_transfer_items: { insert: ['inventory.transfer'], update: ['inventory.transfer'], delete: ['inventory.transfer'] }, stock_counts: { insert: ['inventory.count'], update: ['inventory.count'], delete: ['inventory.count'] }, stock_count_items: { insert: ['inventory.count'], update: ['inventory.count'], delete: ['inventory.count'] }, stock_adjustments: { insert: ['inventory.adjust'], update: ['inventory.adjust'], delete: ['inventory.adjust'] }, stock_adjustment_items: { insert: ['inventory.adjust'], update: ['inventory.adjust'], delete: ['inventory.adjust'] }, stock_reservations: { insert: ['orders.create', 'inventory.adjust'], update: ['orders.update', 'inventory.adjust'], delete: ['orders.update', 'inventory.adjust'] },
  purchase_requests: { insert: ['purchases.create'], update: ['purchases.update', 'purchases.approve'], delete: ['purchases.delete'] }, purchase_request_items: { insert: ['purchases.create'], update: ['purchases.update'], delete: ['purchases.delete'] }, purchase_orders: { insert: ['purchases.create'], update: ['purchases.update', 'purchases.approve'], delete: ['purchases.delete'] }, purchase_order_items: { insert: ['purchases.create'], update: ['purchases.update'], delete: ['purchases.delete'] }, purchase_order_receipts: { insert: ['purchases.create'], update: ['purchases.create'], delete: ['purchases.delete'] }, purchase_order_receipt_items: { insert: ['purchases.create'], update: ['purchases.create'], delete: ['purchases.delete'] },
  leads: { insert: ['crm.create'], update: ['crm.update'], delete: ['crm.delete'] }, crm_activities: { insert: ['crm.create', 'crm.update'], update: ['crm.update'], delete: ['crm.delete'] }, projects: { insert: ['projects.create'], update: ['projects.update'], delete: ['projects.delete'] }, project_units: { insert: ['projects.create'], update: ['projects.update'], delete: ['projects.delete'] }, project_products: { insert: ['projects.create'], update: ['projects.update'], delete: ['projects.delete'] },
  deliveries: { insert: ['deliveries.manage'], update: ['deliveries.manage'], delete: ['deliveries.manage'] }, delivery_items: { insert: ['deliveries.manage'], update: ['deliveries.manage'], delete: ['deliveries.manage'] }, drivers: { insert: ['drivers.manage'], update: ['drivers.manage'], delete: ['drivers.manage'] }, vehicles: { insert: ['vehicles.manage'], update: ['vehicles.manage'], delete: ['vehicles.manage'] }, vehicle_maintenance: { insert: ['vehicles.manage'], update: ['vehicles.manage'], delete: ['vehicles.manage'] },
  price_lists: { insert: ['pricing.update'], update: ['pricing.update'], delete: ['pricing.update'] }, price_list_items: { insert: ['pricing.update'], update: ['pricing.update'], delete: ['pricing.update'] }, customer_price_overrides: { insert: ['pricing.update'], update: ['pricing.update'], delete: ['pricing.update'] }, promotions: { insert: ['promotions.manage'], update: ['promotions.manage'], delete: ['promotions.manage'] }, promotion_targets: { insert: ['promotions.manage'], update: ['promotions.manage'], delete: ['promotions.manage'] }, campaigns: { insert: ['crm.create'], update: ['crm.update'], delete: ['crm.delete'] },
  attributes: { insert: ['products.create'], update: ['products.update'], delete: ['products.delete'] }, attribute_options: { insert: ['products.create'], update: ['products.update'], delete: ['products.delete'] }, product_attribute_values: { insert: ['products.create'], update: ['products.update'], delete: ['products.update'] }, product_variants: { insert: ['products.create'], update: ['products.update'], delete: ['products.delete'] }, product_images: { insert: ['products.create'], update: ['products.update'], delete: ['products.update'] }, product_documents: { insert: ['products.create'], update: ['products.update'], delete: ['products.update'] },
};

/** Conservative SQL gate for the LAN SQL bridge. Unknown syntax/tables fail closed. */
export function authorizeRemoteSql(
  sql: string,
  mode: SqlMode,
  can: (codes: string[]) => boolean,
  params: unknown[] = [],
  actorId = '',
): void {
  const normalized = sql.trim();
  if (!normalized || /--|\/\*/.test(normalized) || /;/.test(normalized.replace(/;\s*$/, ''))) {
    throw new Error('Remote SQL statement is not allowed.');
  }
  if (/^(BEGIN(?:\s+TRANSACTION)?|COMMIT|ROLLBACK)\s*;?$/i.test(normalized)) {
    if (!can(['sales.create', 'sales.update', 'purchases.create', 'purchases.update', 'inventory.adjust', 'inventory.transfer', 'customers.payment', 'suppliers.payment', 'cashier.expense', 'cashier.shift', 'admin.data'])) {
      throw new Error('Remote transaction permission denied.');
    }
    return;
  }

  const statement = normalized.replace(/;\s*$/, '');
  const kind = /^(SELECT|WITH)\b/i.exec(statement)?.[1]?.toUpperCase()
    || /^(INSERT|UPDATE|DELETE)\b/i.exec(statement)?.[1]?.toUpperCase();
  // The lightweight table scanner below cannot safely classify data-modifying
  // CTEs. Reject them instead of treating every WITH statement as a read.
  if (kind === 'WITH') throw new Error('Remote CTE statements are not allowed.');
  if (!kind || (mode === 'query' && !['SELECT', 'WITH'].includes(kind)) || (mode === 'run' && !['INSERT', 'UPDATE', 'DELETE'].includes(kind))) {
    throw new Error('Remote SQL statement is not allowed.');
  }

  const references = new Set<string>();
  const pattern = kind === 'INSERT'
    ? /\bINTO\s+([\w"`\[.]+)\b/gi
    : kind === 'UPDATE'
      ? /\bUPDATE\s+([\w"`\[.]+)\b/gi
      : kind === 'DELETE'
        ? /\bFROM\s+([\w"`\[.]+)\b/gi
        : /\b(?:FROM|JOIN)\s+([\w"`\[.]+)\b|\(\s*SELECT\b[\s\S]*?\bFROM\s+([\w"`\[.]+)(?=[\s,)])/gi;
  for (const match of statement.matchAll(pattern)) {
    const table = (match[1] || match[2]).replace(/["`\[\]]/g, '').split('.').pop()!.toLowerCase();
    references.add(table);
  }
  if (kind !== 'SELECT' && kind !== 'WITH') {
    for (const match of statement.matchAll(/\b(?:FROM|JOIN)\s+([\w"`\[.]+)\b|\(\s*SELECT\b[\s\S]*?\bFROM\s+([\w"`\[.]+)(?=[\s,)])/gi)) {
      references.add((match[1] || match[2]).replace(/["`\[\]]/g, '').split('.').pop()!.toLowerCase());
    }
  }

  if (!references.size) {
    throw new Error('Remote SQL statement is not allowed.');
  }
  for (const table of references) {
    if (kind === 'SELECT') {
      if (table === 'employees' && /\b(?:base_salary|salary_type)\b|\bSELECT\s+(?:\w+\.)?\*/i.test(statement)
        && !can(['employees.manage'])) {
        throw new Error('Remote access denied for employee payroll data.');
      }
      if (table === 'users') {
        const ownUser = /\bFROM\s+users(?:\s+\w+)?\s+WHERE\s+(?:users\.)?id\s*=\s*\?/i.test(statement)
          && !/\bOR\b/i.test(statement)
          && params[0] === actorId;
        if (/\bpassword_hash\b/i.test(statement) && !can(['users.permissions']) && !(ownUser && can(['users.reset_password']))) {
          throw new Error('Remote access denied for protected user credentials.');
        }
        if (/\bpin_code\b/i.test(statement) && !can(['users.view'])) {
          throw new Error('Remote access denied for protected user PINs.');
        }
        if (!ownUser && !can(['users.view', 'users.permissions'])) {
          // Reports and document lists may show the responsible user's name.
          // Permit only an explicit, non-sensitive identity projection there.
          const safeNameJoin = /\b\w+\.full_name\b/i.test(statement)
            && !/\b(?:password_hash|pin_code|username|phone|role|is_active)\b|\bSELECT\s+\*/i.test(statement);
          if (!safeNameJoin) throw new Error('Remote access denied for table: users');
        }
        continue;
      }
      const required = READ_PERMISSION[table] || ['admin.data'];
      if (!can(required)) throw new Error(`Remote access denied for table: ${table}`);
    } else {
      const operation = kind === 'INSERT' ? 'insert' : kind === 'UPDATE' ? 'update' : 'delete';
      if (table === 'sequence_counters' && operation !== 'delete') {
        const prefix = String(kind === 'INSERT' ? params[0] : params[params.length - 1] || '').toUpperCase();
        const sequencePermission = prefix === 'TX-VOID' ? ['sales.void']
          : prefix === 'TX-ADJ' ? ['inventory.adjust']
            : prefix.startsWith('TX-TRF') ? ['inventory.transfer']
              : prefix === 'TX-PUR' ? ['purchases.create']
                : prefix === 'TX-PRET' ? ['purchases.return']
                  : prefix === 'TX-RET' || prefix === 'RET' ? ['sales.refund']
                    : prefix === 'TX-SALE' || prefix === 'INV' ? ['sales.create']
                      : ['PUR', 'PRET', 'PAY'].includes(prefix) ? ['purchases.create', 'purchases.return', 'suppliers.payment']
                        : prefix === 'REC' ? ['customers.payment']
          : prefix === 'ORD' || prefix === 'QTN' ? ['orders.create', 'quotations.create', 'sales.create']
            : prefix === 'PRQ' || prefix === 'PO' ? ['purchases.create']
              : prefix === 'APR' ? ['approvals.view', 'approvals.approve']
                : prefix === 'JV' ? ['finance.approve']
                  : prefix === 'EMP' ? ['employees.manage']
                    : prefix === 'LEAD' ? ['crm.create']
                      : prefix === 'BR' || prefix === 'WH' ? ['operations.update', 'warehouses.manage']
                        : prefix === 'DRV' || prefix === 'VEH' || prefix === 'DLV' ? ['deliveries.manage', 'drivers.manage', 'vehicles.manage']
                          : prefix === 'PL' || prefix === 'PROMO' ? ['pricing.update', 'promotions.manage']
                            : prefix === 'PRJ' ? ['projects.create']
                              : prefix === 'ITX' ? ['inventory.adjust'] : ['admin.data'];
        if (!can(sequencePermission)) throw new Error('Remote sequence permission denied.');
        continue;
      }
      const required = WRITE_PERMISSION[table]?.[operation] || ['admin.data'];
      if (!can(required)) throw new Error(`Remote write denied for table: ${table}`);
      if (kind === 'UPDATE' && table === 'sales_invoices') {
        const assignments = statement.split(/\bSET\b/i)[1]?.split(/\bWHERE\b/i)[0] || '';
        if (/\binvoice_status\b/i.test(assignments) && !can(['sales.void'])) throw new Error('Remote invoice status update denied.');
        if (/\b(?:paid_amount|remaining_amount|payment_status)\b/i.test(assignments) && !can(['customers.payment'])) throw new Error('Remote payment update denied.');
      }
    }
  }
}
