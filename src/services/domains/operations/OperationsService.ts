import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { AuditService } from '../security/AuditService';
import { InventoryCostingService } from '../inventory/InventoryCostingService';
import { BranchService } from '../organization/BranchService';
import { CentralUsageLimitService } from '../licensing/CentralUsageLimitService';
import { isWarehouseType, type WarehouseType } from '../../../types/products/catalog';

export interface Branch {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  phone2?: string | null;
  taxNumber?: string | null;
  address?: string | null;
  city?: string | null;
  managerId?: string | null;
  managerName?: string;
  companyId?: string | null;
  companyName?: string | null;
  companyCurrency?: string | null;
  deviceType?: string | null;
  activationCode?: string | null;
  isMain: boolean;
  isActive: boolean;
  warehousesCount?: number;
  createdAt: string;
}

export interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  warehouseType: WarehouseType;
  location?: string | null;
  branchId?: string | null;
  branchName?: string;
  isDefault: boolean;
  isActive: boolean;
  productsCount?: number;
  stockValue?: number;
  createdAt: string;
}

export interface Driver {
  id: string;
  code: string;
  employeeId?: string | null;
  fullName: string;
  phone: string;
  nationalId?: string | null;
  licenseNumber?: string | null;
  licenseExpiresAt?: string | null;
  branchId?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  tripsCount?: number;
}

export interface Vehicle {
  id: string;
  code: string;
  plateNumber: string;
  vehicleType: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  capacityKg?: number | null;
  assignedDriverId?: string | null;
  assignedDriverName?: string;
  licenseExpiresAt?: string | null;
  insuranceExpiresAt?: string | null;
  status: 'AVAILABLE' | 'ON_DELIVERY' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
}

export interface Delivery {
  id: string;
  deliveryNumber: string;
  date: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  address: string;
  city?: string | null;
  driverId?: string | null;
  driverName?: string;
  vehicleId?: string | null;
  plateNumber?: string;
  scheduledAt?: string | null;
  deliveredAt?: string | null;
  deliveryFee: number;
  totalQuantityM2: number;
  status: 'PENDING' | 'SCHEDULED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
  failureReason?: string | null;
  notes?: string | null;
  createdAt: string;
}

export class OperationsService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private requireManage(permission: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    PermissionService.require(actor, 'operations.update');
  }

  // ── Branches ───────────────────────────────────────────────────────────────
  public getBranches(search = '', includeAllAuthorizedBranches = false): Branch[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.branches.branches.view');
    PermissionService.require(actor, 'operations.view');
    const scope = this.branchAccess.sqlScope('b.id', undefined, actor, includeAllAuthorizedBranches);
    let sql = `
      SELECT b.*, u.full_name AS manager_name, sb.device_type AS deviceType, sb.activation_code AS activationCode,
        c.name AS company_name, c.currency AS company_currency,
        (SELECT COUNT(*) FROM warehouses w WHERE w.branch_id = b.id AND w.is_active = 1) AS warehouses_count
      FROM branches b
      LEFT JOIN users u ON u.id = b.manager_id
      LEFT JOIN sync_branches sb ON sb.branch_id = b.id
      LEFT JOIN companies c ON c.id = b.company_id
      WHERE ${scope.clause}`;
    const params: any[] = [...scope.params];
    if (search.trim()) {
      sql += ` AND (b.name LIKE ? OR b.code LIKE ? OR b.address LIKE ? OR b.city LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    sql += ` ORDER BY b.is_main DESC, b.name`;
    return this.db.query<Branch>(sql, params).map((b) => ({
      ...b,
      isMain: Boolean(b.isMain),
      isActive: Boolean(b.isActive),
      deviceType: b.deviceType ?? null,
      activationCode: b.activationCode ?? null,
    }));
  }

  public createBranch(input: {
    name: string;
    phone?: string;
    phone2?: string;
    taxNumber?: string;
    address?: string;
    city?: string;
    deviceType?: string;
    deviceName?: string;
    managerId?: string;
    managerName?: string;
    permissions?: string[];
    notes?: string;
    companyId?: string;
    isDefault?: boolean;
  }): Branch {
    ModuleRegistryService.assertModuleEnabled('operations');
    this.requireManage('ui.branches.branches.manage');
    PermissionService.require(AuthService.getCurrentUser(), 'ui.branches.branches.create');
    PermissionService.require(AuthService.getCurrentUser(), 'ui.branches.branches.access_all');
    CentralUsageLimitService.assertWithin('maxBranches');
    const trimmedName = input.name?.trim();
    if (!trimmedName) throw new Error('اسم الفرع مطلوب.');
    const id = `br_${uuidv4().substring(0, 8)}`;
    const deviceType = (input.deviceType || 'WINDOWS').trim().toUpperCase();
    const permissionList = Array.isArray(input.permissions) ? input.permissions.filter(Boolean).map((p) => String(p).trim()).filter(Boolean) : [];
    const actor = AuthService.requireAuth();
    const accessibleBranchIds = this.branchAccess.getAccessibleBranchIds(actor);
    const companyId = input.companyId || (accessibleBranchIds === null
      ? this.db.query<{ companyId: string }>(
        'SELECT company_id AS companyId FROM branches WHERE is_main = 1 AND company_id IS NOT NULL LIMIT 1'
      )[0]?.companyId
      : accessibleBranchIds.length
        ? this.db.query<{ companyId: string }>(
          `SELECT company_id AS companyId FROM branches
           WHERE id IN (${accessibleBranchIds.map(() => '?').join(', ')})
             AND company_id IS NOT NULL
           ORDER BY is_main DESC, id ASC LIMIT 1`,
          accessibleBranchIds
        )[0]?.companyId
        : undefined);
    if (!companyId) throw new Error('تعذر تحديد الشركة المالكة للفرع الجديد.');
    const company = this.db.query<{ isActive: number }>(
      'SELECT is_active AS isActive FROM companies WHERE id = ?',
      [companyId]
    )[0];
    if (!company || Number(company.isActive) !== 1) throw new Error('الشركة المحددة غير موجودة أو غير نشطة.');
    this.branchAccess.requireCompanyAccess(companyId, actor);
    if (input.managerId && !this.db.query(
      'SELECT id FROM users WHERE id = ? AND is_active = 1',
      [input.managerId]
    ).length) {
      throw new Error('المسؤول المحدد غير موجود أو غير نشط.');
    }
    const notesPayload = {
      deviceType,
      deviceName: input.deviceName?.trim() || null,
      managerName: input.managerName?.trim() || null,
      permissions: permissionList,
      createdFrom: 'branch-onboarding',
    };
    const activationCode = `BR-${uuidv4().slice(0, 8).toUpperCase()}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('BR');
      const notes = input.notes || JSON.stringify(notesPayload);
      if (input.isDefault) {
        db.run('UPDATE branches SET is_main = 0 WHERE is_main = 1');
      }
      db.run(
        `INSERT INTO branches
           (id, code, name, phone, phone2, tax_number, address, city, manager_id, company_id, is_main, is_active, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          id, code, trimmedName, input.phone?.trim() || null, input.phone2?.trim() || null,
          input.taxNumber?.trim() || null, input.address?.trim() || null,
          input.city?.trim() || null, input.managerId || null, companyId, input.isDefault ? 1 : 0, notes,
        ]
      );
      if (input.managerId) {
        db.run(
          'INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES (?, ?)',
          [input.managerId, id]
        );
      }
      db.run(
        `INSERT INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id)
         VALUES (?, ?, 0, 1, 1, ?)`,
        [`cr_${id}`, `الخزينة الرئيسية - ${code}`, id]
      );
      db.run(
        `INSERT OR REPLACE INTO sync_branches (branch_id, tenant_id, name, status, is_verified, verified_at, authorized_by, device_type, activation_code, last_contact_at, last_sync_at, updated_at)
         VALUES (?, ?, ?, 'ACTIVE', 1, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, null, trimmedName, new Date().toISOString(), AuthService.getCurrentUser()?.id || null, deviceType, activationCode]
      );
      const branch = db.query<Branch>(`
        SELECT b.*, u.full_name AS manager_name, c.name AS company_name, c.currency AS company_currency
        FROM branches b
        LEFT JOIN users u ON u.id = b.manager_id
        LEFT JOIN companies c ON c.id = b.company_id
        WHERE b.id = ?
      `, [id])[0];
      if (!branch) throw new Error('تعذر قراءة بيانات الفرع بعد إنشائه.');
      return {
        ...branch,
        isMain: Boolean(branch.isMain),
        isActive: Boolean(branch.isActive),
        deviceType,
        activationCode,
        notes,
      };
    });
  }

  public toggleBranch(id: string, active: boolean): void {
    ModuleRegistryService.assertModuleEnabled('operations');
    new BranchService().setBranchActive(id, active);
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────
  private warehouseHasStockHistory(warehouseId: string): boolean {
    const checks = [
      'SELECT 1 FROM warehouse_stock WHERE warehouse_id = ? AND (quantity_m2 <> 0 OR reserved_m2 <> 0) LIMIT 1',
      'SELECT 1 FROM inventory_transactions WHERE warehouse_id = ? LIMIT 1',
      'SELECT 1 FROM inventory_cost_layers WHERE warehouse_id = ? LIMIT 1',
      'SELECT 1 FROM sales_invoices WHERE warehouse_id = ? LIMIT 1',
      'SELECT 1 FROM purchase_invoices WHERE warehouse_id = ? LIMIT 1',
      'SELECT 1 FROM stock_transfers WHERE from_warehouse_id = ? OR to_warehouse_id = ? OR transit_warehouse_id = ? LIMIT 1',
    ];
    for (const sql of checks) {
      const params = sql.includes('transit_warehouse_id') ? [warehouseId, warehouseId, warehouseId] : [warehouseId];
      if (this.db.query<any>(sql, params).length) return true;
    }
    return false;
  }

  public getWarehouses(search = ''): WarehouseRow[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.warehouses.warehouses.view');
    PermissionService.require(actor, 'operations.view');
    const scope = this.branchAccess.sqlScope('w.branch_id', undefined, actor);
    const fifo = InventoryCostingService.costingMethod(this.db) === 'FIFO';
    const valueExpr = fifo
      ? `(SELECT COALESCE(SUM(icl.quantity_remaining * icl.unit_cost), 0) FROM inventory_cost_layers icl WHERE icl.warehouse_id = w.id AND icl.quantity_remaining > 0)`
      : `(SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0) FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id WHERE ws.warehouse_id = w.id)`;
    let sql = `
      SELECT w.*, b.name AS branch_name,
        (SELECT COUNT(DISTINCT ws.product_id) FROM warehouse_stock ws WHERE ws.warehouse_id = w.id AND ws.quantity_m2 > 0) AS products_count,
        ${valueExpr} AS stock_value
      FROM warehouses w LEFT JOIN branches b ON b.id = w.branch_id WHERE ${scope.clause}`;
    const params: any[] = [...scope.params];
    if (search.trim()) {
      sql += ` AND (w.name LIKE ? OR w.code LIKE ? OR w.location LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY w.is_default DESC, w.name`;
    return this.db.query<WarehouseRow>(sql, params).map((w) => ({
      ...w,
      isDefault: Boolean(w.isDefault),
      isActive: Boolean(w.isActive),
    }));
  }

  public createWarehouse(input: {
    name: string;
    location?: string;
    branchId?: string;
    warehouseType?: WarehouseType;
  }): WarehouseRow {
    ModuleRegistryService.assertModuleEnabled('operations');
    this.requireManage('warehouses.manage');
    CentralUsageLimitService.assertWithin('maxWarehouses');
    if (!input.name.trim()) throw new Error('اسم المخزن مطلوب.');
    const warehouseType = input.warehouseType ?? 'BRANCH_WAREHOUSE';
    if (!isWarehouseType(warehouseType)) throw new Error('نوع المخزن غير صالح.');
    const actor = AuthService.requireAuth();
    const branchId = input.branchId
      ? (this.branchAccess.requireBranchAccess(input.branchId, actor), input.branchId)
      : this.branchAccess.getDefaultAccessibleBranchId(actor);
    const id = `wh_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('WH');
      const companyId = db.query<{ companyId: string | null }>(
        'SELECT company_id AS companyId FROM branches WHERE id = ?',
        [branchId]
      )[0]?.companyId ?? null;
      db.run(
        `INSERT INTO warehouses (id, name, code, location, warehouse_type, branch_id, company_id, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [id, input.name.trim(), code, input.location || null, warehouseType, branchId, companyId]
      );
      return this.getWarehouses().find((w) => w.id === id)!;
    });
  }

  public updateWarehouseType(id: string, warehouseType: WarehouseType): void {
    ModuleRegistryService.assertModuleEnabled('operations');
    const actor = AuthService.requireAuth();
    this.requireManage('warehouses.manage');
    if (!isWarehouseType(warehouseType)) throw new Error('نوع المخزن غير صالح.');
    this.getManageableWarehouse(id, actor);
    this.db.run('UPDATE warehouses SET warehouse_type = ? WHERE id = ?', [warehouseType, id]);
  }

  public updateWarehouse(id: string, input: {
    name: string;
    location?: string;
    branchId?: string;
    warehouseType?: WarehouseType;
  }): WarehouseRow {
    ModuleRegistryService.assertModuleEnabled('operations');
    const actor = AuthService.requireAuth();
    this.requireManage('warehouses.manage');
    const warehouse = this.getManageableWarehouse(id, actor);
    const name = input.name.trim();
    if (!name) throw new Error('اسم المخزن مطلوب.');
    if (input.warehouseType && !isWarehouseType(input.warehouseType)) {
      throw new Error('نوع المخزن غير صالح.');
    }
    if (this.db.query<{ id: string }>('SELECT id FROM warehouses WHERE name = ? AND id <> ?', [name, id]).length) {
      throw new Error('يوجد مخزن آخر بهذا الاسم.');
    }

    let branchId = warehouse.branchId;
    let companyId = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM warehouses WHERE id = ?',
      [id]
    )[0]?.companyId ?? null;
    if (input.branchId && input.branchId !== branchId) {
    if (this.warehouseHasStockHistory(id)) {
      throw new Error('لا يمكن تغيير فرع/شركة مستودع يملك تاريخاً مخزنياً (أرصدة أو حركات أو فواتير أو طبقات تكلفة).');
    }
      this.branchAccess.requireBranchAccess(input.branchId, actor);
      const branch = this.db.query<{ companyId: string | null; isActive: number }>(
        'SELECT company_id AS companyId, is_active AS isActive FROM branches WHERE id = ?',
        [input.branchId]
      )[0];
      if (!branch || Number(branch.isActive) !== 1) throw new Error('الفرع المحدد غير موجود أو غير نشط.');
      branchId = input.branchId;
      companyId = branch.companyId;
    }

    this.db.run(
      `UPDATE warehouses SET name = ?, location = ?, warehouse_type = COALESCE(?, warehouse_type),
        branch_id = ?, company_id = ? WHERE id = ?`,
      [name, input.location?.trim() || null, input.warehouseType ?? null, branchId, companyId, id]
    );
    return this.getWarehouses().find((warehouseRow) => warehouseRow.id === id)!;
  }

  public setWarehouseActive(id: string, active: boolean): void {
    ModuleRegistryService.assertModuleEnabled('operations');
    const actor = AuthService.requireAuth();
    this.requireManage('warehouses.manage');
    const warehouse = this.getManageableWarehouse(id, actor);
    this.db.executeTransaction((db) => {
      const current = db.query<{ isActive: number; isDefault: number }>(
        'SELECT is_active AS isActive, is_default AS isDefault FROM warehouses WHERE id = ?',
        [id]
      )[0];
      if (!current) throw new Error('المخزن غير موجود.');
      if (active) {
        db.run('UPDATE warehouses SET is_active = 1 WHERE id = ?', [id]);
        return;
      }

      const hasStock = db.query<{ id: string }>(
        `SELECT id FROM warehouse_stock
         WHERE warehouse_id = ? AND (
           ABS(COALESCE(quantity_m2, 0)) > 0.000001 OR ABS(COALESCE(reserved_m2, 0)) > 0.000001
         )
         LIMIT 1`,
        [id]
      ).length > 0;
      if (hasStock) throw new Error('لا يمكن تعطيل المخزن قبل نقل جميع الأرصدة وإلغاء الحجوزات المرتبطة به.');

      if (Number(current.isDefault)) {
        const replacement = db.query<{ id: string }>(
          `SELECT id FROM warehouses
           WHERE branch_id IS ? AND is_active = 1 AND id <> ?
           ORDER BY name, id LIMIT 1`,
          [warehouse.branchId ?? null, id]
        )[0];
        if (!replacement) throw new Error('لا يمكن تعطيل المخزن الافتراضي قبل تفعيل مخزن آخر وتعيينه افتراضياً.');
        db.run('UPDATE warehouses SET is_default = 0 WHERE branch_id IS ?', [warehouse.branchId ?? null]);
        db.run('UPDATE warehouses SET is_default = 1 WHERE id = ?', [replacement.id]);
      }
      db.run('UPDATE warehouses SET is_active = 0, is_default = 0 WHERE id = ?', [id]);
    });
  }

  public setDefaultWarehouse(id: string): void {
    ModuleRegistryService.assertModuleEnabled('operations');
    const actor = AuthService.requireAuth();
    this.requireManage('warehouses.manage');
    const warehouse = this.getManageableWarehouse(id, actor);
    this.db.executeTransaction((db) => {
      const current = db.query<{ isActive: number }>(
        'SELECT is_active AS isActive FROM warehouses WHERE id = ?',
        [id]
      )[0];
      if (!current || Number(current.isActive) !== 1) throw new Error('يجب تفعيل المخزن قبل تعيينه افتراضياً.');
      db.run('UPDATE warehouses SET is_default = 0 WHERE branch_id IS ?', [warehouse.branchId ?? null]);
      db.run('UPDATE warehouses SET is_default = 1 WHERE id = ?', [id]);
    });
  }

  private getManageableWarehouse(id: string, actor: ReturnType<typeof AuthService.requireAuth>): { branchId: string | null } {
    const warehouse = this.db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM warehouses WHERE id = ?',
      [id]
    )[0];
    if (!warehouse) throw new Error('المخزن غير موجود.');

    const branchIds = warehouse.branchId
      ? [warehouse.branchId]
      : this.db.query<{ branchId: string }>(
        'SELECT branch_id AS branchId FROM branch_warehouses WHERE warehouse_id = ?',
        [id]
      ).map((row) => row.branchId);
    const currentBranchId = this.branchAccess.getCurrentBranchId(actor);
    if (!branchIds.includes(currentBranchId)) throw new Error('المخزن لا يتبع الفرع النشط الحالي.');
    this.branchAccess.requireBranchAuthorization(currentBranchId, actor);
    return warehouse;
  }

  // ── Drivers ────────────────────────────────────────────────────────────────
  public getDrivers(search = ''): Driver[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.drivers.drivers.view');
    PermissionService.require(actor, 'operations.view');
    let sql = `
      SELECT d.*, (SELECT COUNT(*) FROM deliveries dl WHERE dl.driver_id = d.id) AS trips_count
      FROM drivers d WHERE 1 = 1`;
    const params: any[] = [];
    if (search.trim()) {
      sql += ` AND (d.full_name LIKE ? OR d.phone LIKE ? OR d.license_number LIKE ? OR d.code LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    sql += ` ORDER BY d.full_name`;
    return this.db.query<Driver>(sql, params).map((d) => ({ ...d, isActive: Boolean(d.isActive) }));
  }

  public createDriver(input: {
    fullName: string; phone: string; licenseNumber?: string; licenseExpiresAt?: string; notes?: string;
  }): Driver {
    ModuleRegistryService.assertModuleEnabled('operations');
    this.requireManage('drivers.manage');
    if (!input.fullName.trim() || !input.phone.trim()) throw new Error('اسم السائق والهاتف مطلوبان.');
    const id = `drv_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('DRV');
      db.run(
        `INSERT INTO drivers (id, code, full_name, phone, license_number, license_expires_at, notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, code, input.fullName.trim(), input.phone.trim(), input.licenseNumber || null, input.licenseExpiresAt || null, input.notes || null]
      );
      return this.getDrivers().find((d) => d.id === id)!;
    });
  }

  public toggleDriver(id: string, active: boolean): void {
    ModuleRegistryService.assertModuleEnabled('operations');
    this.requireManage('drivers.manage');
    this.db.run(`UPDATE drivers SET is_active = ? WHERE id = ?`, [active ? 1 : 0, id]);
  }

  // ── Vehicles ───────────────────────────────────────────────────────────────
  public getVehicles(search = ''): Vehicle[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.vehicles.vehicles.view');
    PermissionService.require(actor, 'operations.view');
    let sql = `
      SELECT v.*, d.full_name AS assigned_driver_name
      FROM vehicles v LEFT JOIN drivers d ON d.id = v.assigned_driver_id WHERE 1 = 1`;
    const params: any[] = [];
    if (search.trim()) {
      sql += ` AND (v.plate_number LIKE ? OR v.model LIKE ? OR v.make LIKE ? OR v.code LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    sql += ` ORDER BY v.plate_number`;
    return this.db.query<Vehicle>(sql, params).map((v) => ({ ...v, isActive: Boolean(v.isActive) }));
  }

  public createVehicle(input: {
    plateNumber: string; vehicleType?: string; make?: string; model?: string; year?: number;
    capacityKg?: number; assignedDriverId?: string; licenseExpiresAt?: string; insuranceExpiresAt?: string;
  }): Vehicle {
    ModuleRegistryService.assertModuleEnabled('operations');
    this.requireManage('vehicles.manage');
    if (!input.plateNumber.trim()) throw new Error('رقم اللوحة مطلوب.');
    const dup = this.db.query(`SELECT id FROM vehicles WHERE plate_number = ?`, [input.plateNumber.trim()])[0];
    if (dup) throw new Error('رقم اللوحة مسجل بالفعل.');

    const id = `veh_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('VEH');
      db.run(
        `INSERT INTO vehicles (id, code, plate_number, vehicle_type, make, model, year, capacity_kg,
          assigned_driver_id, license_expires_at, insurance_expires_at, status, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', 1)`,
        [
          id, code, input.plateNumber.trim(), input.vehicleType || 'TRUCK', input.make || null,
          input.model || null, input.year || null, input.capacityKg || 0, input.assignedDriverId || null,
          input.licenseExpiresAt || null, input.insuranceExpiresAt || null,
        ]
      );
      return this.getVehicles().find((v) => v.id === id)!;
    });
  }

  public updateVehicleStatus(id: string, status: Vehicle['status']): void {
    ModuleRegistryService.assertModuleEnabled('operations');
    this.requireManage('vehicles.manage');
    this.db.run(`UPDATE vehicles SET status = ? WHERE id = ?`, [status, id]);
  }

  public getCustomersForSelect(): Array<{ id: string; name: string; phone?: string | null; address?: string | null; city?: string | null }> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.view');
    const scope = this.branchAccess.companyScope('company_id', actor);
    return this.db.query(
      `SELECT id, name, phone, address, city FROM customers WHERE ${scope.clause} ORDER BY name`,
      scope.params
    );
  }

  // ── Deliveries ─────────────────────────────────────────────────────────────
  public getDeliveries(search = '', status = 'ALL'): Delivery[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.deliveries.deliveries.view');
    PermissionService.require(actor, 'operations.view');
    let sql = `
      SELECT dl.*, c.name AS customer_name, c.phone AS customer_phone,
        d.full_name AS driver_name, v.plate_number
      FROM deliveries dl
      JOIN customers c ON c.id = dl.customer_id
      LEFT JOIN drivers d ON d.id = dl.driver_id
      LEFT JOIN vehicles v ON v.id = dl.vehicle_id
      WHERE 1 = 1`;
    const params: any[] = [];
    if (status !== 'ALL') { sql += ` AND dl.status = ?`; params.push(status); }
    if (search.trim()) {
      sql += ` AND (dl.delivery_number LIKE ? OR c.name LIKE ? OR dl.address LIKE ? OR d.full_name LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    sql += ` ORDER BY dl.date DESC, dl.created_at DESC`;
    return this.db.query<Delivery>(sql, params);
  }

  public createDelivery(input: {
    customerId: string; address: string; city?: string; date?: string;
    driverId?: string; vehicleId?: string; scheduledAt?: string; deliveryFee?: number; notes?: string;
  }): Delivery {
    ModuleRegistryService.assertModuleEnabled('operations');
    this.requireManage('deliveries.manage');
    if (!input.customerId) throw new Error('يجب اختيار العميل.');
    if (!input.address.trim()) throw new Error('عنوان التسليم مطلوب.');

    const warehouse = this.db.query<{ id: string }>(`SELECT id FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC LIMIT 1`)[0];
    if (!warehouse) throw new Error('لا يوجد مخزن نشط لتسجيل الشحنة.');

    const actor = AuthService.requireAuth();
    const id = `dlv_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const deliveryNumber = db.nextNumber('DLV');
      db.run(
        `INSERT INTO deliveries (id, delivery_number, date, customer_id, warehouse_id, driver_id, vehicle_id,
          address, city, scheduled_at, delivery_fee, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        [
          id, deliveryNumber, input.date || localDateString(), input.customerId,
          warehouse.id, input.driverId || null, input.vehicleId || null, input.address.trim(),
          input.city || null, input.scheduledAt || null, input.deliveryFee || 0, input.notes || null, actor.id,
        ]
      );
      return this.getDeliveries().find((d) => d.id === id)!;
    });
  }

  public updateDeliveryStatus(id: string, status: Delivery['status'], failureReason?: string): void {
    ModuleRegistryService.assertModuleEnabled('operations');
    this.requireManage('deliveries.manage');
    this.db.run(
      `UPDATE deliveries SET status = ?, failure_reason = ?, delivered_at = ?, updated_at = ? WHERE id = ?`,
      [
        status, failureReason || null,
        status === 'DELIVERED' ? new Date().toISOString() : null,
        new Date().toISOString(), id,
      ]
    );
    if (status === 'DELIVERED' || status === 'IN_TRANSIT') {
      const vehicle = this.db.query<{ vehicleId: string | null }>(`SELECT vehicle_id FROM deliveries WHERE id = ?`, [id])[0];
      if (vehicle?.vehicleId) {
        this.db.run(`UPDATE vehicles SET status = ? WHERE id = ?`, [status === 'DELIVERED' ? 'AVAILABLE' : 'ON_DELIVERY', vehicle.vehicleId]);
      }
    }
  }
}
