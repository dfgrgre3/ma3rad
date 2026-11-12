import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { AttendanceTimeService } from './AttendanceTimeService';
import { localDateString } from '../../../utils/shared/date';

export type AttendanceDeviceType = 'FINGERPRINT' | 'FACE_RECOGNITION' | 'CARD' | 'QR_CODE' | 'MOBILE_APP' | 'OTHER';
export type DeviceEventType = 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END' | 'UNKNOWN';
export type ProcessingStatus = 'PENDING' | 'PROCESSED' | 'SKIPPED' | 'ERROR';
export type SyncStatus = 'IDLE' | 'SYNCING' | 'ERROR';

export interface AttendanceDevice {
  id: string;
  companyId: string;
  branchId: string;
  branchName: string;
  deviceName: string;
  deviceType: AttendanceDeviceType;
  deviceCode: string;
  ipAddress: string | null;
  port: number | null;
  locationLat: string | null;
  locationLng: string | null;
  geoFenceRadiusMeters: number;
  isActive: boolean;
  lastSyncAt: string | null;
  syncStatus: SyncStatus;
  lastError: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceDeviceInput {
  branchId: string;
  deviceName: string;
  deviceType: AttendanceDeviceType;
  deviceCode: string;
  ipAddress?: string | null;
  port?: number | null;
  locationLat?: string | null;
  locationLng?: string | null;
  geoFenceRadiusMeters?: number;
  isActive?: boolean;
}

export interface AttendanceDeviceRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeCode: string | null;
  deviceTimestamp: string;
  deviceEventType: DeviceEventType;
  rawData: string | null;
  latitude: string | null;
  longitude: string | null;
  accuracyMeters: number | null;
  processed: boolean;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  importedAt: string;
  processedAt: string | null;
  processedBy: string | null;
}

export interface ImportDeviceRecordsInput {
  deviceId: string;
  records: Array<{
    employeeCode?: string | null;
    deviceTimestamp: string;
    deviceEventType: DeviceEventType;
    rawData?: string | null;
    latitude?: string | null;
    longitude?: string | null;
    accuracyMeters?: number | null;
  }>;
}

export interface ImportResult {
  recordsFound: number;
  recordsNew: number;
  recordsDuplicate: number;
  recordsProcessed: number;
  recordsSkipped: number;
  recordsError: number;
  errors: Array<{ recordIndex: number; employeeCode: string | null; message: string }>;
}

export interface MobileAttendanceSession {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  sessionType: 'CHECK_IN' | 'CHECK_OUT';
  recordedAt: string;
  latitude: string;
  longitude: string;
  accuracyMeters: number | null;
  deviceInfo: string | null;
  ipAddress: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface CreateMobileSessionInput {
  employeeId: string;
  branchId: string;
  sessionType: 'CHECK_IN' | 'CHECK_OUT';
  recordedAt: string;
  latitude: string;
  longitude: string;
  accuracyMeters?: number | null;
  deviceInfo?: string | null;
  ipAddress?: string | null;
}

export interface DeviceStats {
  totalDevices: number;
  activeDevices: number;
  devicesByType: Array<{ type: string; count: number }>;
  pendingRecords: number;
  processedToday: number;
  lastSync: string | null;
}

function isValidDateTime(value: string): boolean {
  if (!value) return false;
  // Accept ISO datetime or date
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime());
}

export class AttendanceDeviceService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'employees.attendance.view', 'employees.manage', 'hr.recruitment.view',
    ]);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'employees.attendance.manage', 'employees.manage',
    ]);
    return actor;
  }

  private static currentCompanyId(actor = AuthService.requireAuth()): string {
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const row = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!row?.companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة.');
    return row.companyId;
  }

  /* ========== Devices ========== */

  static getAttendanceDevices(): AttendanceDevice[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT d.id, d.company_id AS companyId, d.branch_id AS branchId,
              b.name AS branchName, d.device_name AS deviceName,
              d.device_type AS deviceType, d.device_code AS deviceCode,
              d.ip_address AS ipAddress, d.port, d.location_lat AS locationLat,
              d.location_lng AS locationLng, d.geo_fence_radius_meters AS geoFenceRadiusMeters,
              d.is_active AS isActive, d.last_sync_at AS lastSyncAt,
              d.sync_status AS syncStatus, d.last_error AS lastError,
              d.created_by AS createdBy, u.full_name AS createdByName,
              d.created_at AS createdAt, d.updated_at AS updatedAt
       FROM hr_attendance_devices d
       JOIN branches b ON b.id = d.branch_id
       LEFT JOIN users u ON u.id = d.created_by
       WHERE d.company_id = ? AND ${scope.clause}
       ORDER BY d.device_name`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      isActive: Boolean(row.isActive),
    }));
  }

  static getAttendanceDevice(deviceId: string): AttendanceDevice | null {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const row = this.db.query<any>(
      `SELECT d.id, d.company_id AS companyId, d.branch_id AS branchId,
              b.name AS branchName, d.device_name AS deviceName,
              d.device_type AS deviceType, d.device_code AS deviceCode,
              d.ip_address AS ipAddress, d.port, d.location_lat AS locationLat,
              d.location_lng AS locationLng, d.geo_fence_radius_meters AS geoFenceRadiusMeters,
              d.is_active AS isActive, d.last_sync_at AS lastSyncAt,
              d.sync_status AS syncStatus, d.last_error AS lastError,
              d.created_by AS createdBy, u.full_name AS createdByName,
              d.created_at AS createdAt, d.updated_at AS updatedAt
       FROM hr_attendance_devices d
       JOIN branches b ON b.id = d.branch_id
       LEFT JOIN users u ON u.id = d.created_by
       WHERE d.id = ? AND d.company_id = ? AND ${scope.clause}`,
      [deviceId, companyId, ...scope.params]
    )[0];
    return row ? { ...row, isActive: Boolean(row.isActive) } : null;
  }

  static createAttendanceDevice(input: AttendanceDeviceInput): AttendanceDevice {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const branch = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM branches WHERE id = ? AND company_id = ?',
      [input.branchId, companyId]
    )[0];
    if (!branch) throw new Error('الفرع غير موجود.');
    if (!input.deviceName?.trim()) throw new Error('اسم الجهاز مطلوب.');
    if (!input.deviceCode?.trim()) throw new Error('رمز الجهاز مطلوب.');
    // Check duplicate device code within company
    const existing = this.db.query<{ id: string }>(
      'SELECT id FROM hr_attendance_devices WHERE device_code = ? AND company_id = ?',
      [input.deviceCode.trim(), companyId]
    )[0];
    if (existing) throw new Error('رمز الجهاز مسجل مسبقاً لهذه الشركة.');

    const id = `ad_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO hr_attendance_devices
         (id, company_id, branch_id, device_name, device_type, device_code,
          ip_address, port, location_lat, location_lng, geo_fence_radius_meters,
          is_active, sync_status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IDLE', ?, ?, ?)`,
      [id, companyId, input.branchId, input.deviceName.trim(), input.deviceType,
        input.deviceCode.trim(), input.ipAddress || null, input.port || null,
        input.locationLat || null, input.locationLng || null,
        input.geoFenceRadiusMeters ?? 0, input.isActive !== false ? 1 : 0,
        actor.id, now, now]
    );
    this.auditActor(actor, 'إضافة جهاز حضور وانصراف', id, {
      deviceName: input.deviceName, deviceType: input.deviceType, deviceCode: input.deviceCode,
    });
    return this.getAttendanceDevice(id)!;
  }

  static updateAttendanceDevice(deviceId: string, input: Partial<AttendanceDeviceInput>): AttendanceDevice {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const device = this.db.query<{ id: string; deviceCode: string }>(
      'SELECT id, device_code AS deviceCode FROM hr_attendance_devices WHERE id = ? AND company_id = ?',
      [deviceId, companyId]
    )[0];
    if (!device) throw new Error('الجهاز غير موجود.');
    if (input.deviceCode && input.deviceCode.trim() !== device.deviceCode) {
      const dup = this.db.query<{ id: string }>(
        'SELECT id FROM hr_attendance_devices WHERE device_code = ? AND company_id = ? AND id <> ?',
        [input.deviceCode.trim(), companyId, deviceId]
      )[0];
      if (dup) throw new Error('رمز الجهاز مسجل مسبقاً لجهاز آخر.');
    }
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('device_name', input.deviceName?.trim() || null);
    setField('device_type', input.deviceType || null);
    setField('device_code', input.deviceCode?.trim() || null);
    setField('ip_address', input.ipAddress || null);
    setField('port', input.port || null);
    setField('location_lat', input.locationLat || null);
    setField('location_lng', input.locationLng || null);
    setField('geo_fence_radius_meters', input.geoFenceRadiusMeters !== undefined ? input.geoFenceRadiusMeters : undefined);
    setField('is_active', input.isActive !== undefined ? (input.isActive ? 1 : 0) : undefined);
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(deviceId);
    this.db.run(`UPDATE hr_attendance_devices SET ${updates.join(', ')} WHERE id = ?`, params);
    this.auditActor(actor, 'تعديل جهاز حضور وانصراف', deviceId, input);
    return this.getAttendanceDevice(deviceId)!;
  }

  static deleteAttendanceDevice(deviceId: string): void {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const device = this.db.query<{ id: string }>(
      'SELECT id FROM hr_attendance_devices WHERE id = ? AND company_id = ?',
      [deviceId, companyId]
    )[0];
    if (!device) throw new Error('الجهاز غير موجود.');
    this.db.run('DELETE FROM hr_attendance_devices WHERE id = ? AND company_id = ?', [deviceId, companyId]);
    this.auditActor(actor, 'حذف جهاز حضور وانصراف', deviceId, {});
  }

  static toggleDeviceSyncStatus(deviceId: string, status: SyncStatus, error?: string | null): AttendanceDevice {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const device = this.db.query<{ id: string }>(
      'SELECT id FROM hr_attendance_devices WHERE id = ? AND company_id = ?',
      [deviceId, companyId]
    )[0];
    if (!device) throw new Error('الجهاز غير موجود.');
    const now = localDateString();
    this.db.run(
      `UPDATE hr_attendance_devices SET sync_status = ?, last_sync_at = ?,
         last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, status === 'IDLE' ? now : null, error || null, deviceId]
    );
    return this.getAttendanceDevice(deviceId)!;
  }

  /* ========== Device Records ========== */

  static getDeviceRecords(options: {
    deviceId?: string;
    employeeId?: string;
    from?: string;
    to?: string;
    processingStatus?: ProcessingStatus;
    limit?: number;
  }): AttendanceDeviceRecord[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['d.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (options.deviceId) {
      conditions.push('r.device_id = ?');
      params.push(options.deviceId);
    }
    if (options.employeeId) {
      conditions.push('r.employee_id = ?');
      params.push(options.employeeId);
    }
    if (options.from) {
      conditions.push('r.device_timestamp >= ?');
      params.push(options.from);
    }
    if (options.to) {
      conditions.push('r.device_timestamp <= ?');
      params.push(options.to);
    }
    if (options.processingStatus) {
      conditions.push('r.processing_status = ?');
      params.push(options.processingStatus);
    }
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);
    const limit = options.limit ? `LIMIT ${Math.min(options.limit, 1000)}` : '';

    const rows = this.db.query<any>(
      `SELECT r.id, r.device_id AS deviceId, dev.device_name AS deviceName,
              r.employee_id AS employeeId, e.name AS employeeName,
              r.employee_code AS employeeCode, r.device_timestamp AS deviceTimestamp,
              r.device_event_type AS deviceEventType, r.raw_data AS rawData,
              r.latitude, r.longitude, r.accuracy_meters AS accuracyMeters,
              r.processed, r.processing_status AS processingStatus,
              r.processing_error AS processingError, r.imported_at AS importedAt,
              r.processed_at AS processedAt, r.processed_by AS processedBy
       FROM hr_attendance_device_records r
       JOIN hr_attendance_devices dev ON dev.id = r.device_id
       LEFT JOIN employees e ON e.id = r.employee_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.device_timestamp DESC, r.imported_at DESC ${limit}`,
      params
    );
    return rows.map((row) => ({
      ...row,
      processed: Boolean(row.processed),
    }));
  }

  /* ========== Import Records from Device ========== */

  static importDeviceRecords(input: ImportDeviceRecordsInput): ImportResult {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const device = this.db.query<{ id: string; branchId: string }>(
      `SELECT d.id, d.branch_id AS branchId FROM hr_attendance_devices d
       WHERE d.id = ? AND d.company_id = ? AND d.is_active = 1`,
      [input.deviceId, companyId]
    )[0];
    if (!device) throw new Error('الجهاز غير موجود أو غير نشط.');
    if (!input.records || !input.records.length) {
      throw new Error('لا توجد سجلات للاستيراد.');
    }

    const importId = `ail_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const importStartedAt = new Date().toISOString();
    let recordsNew = 0;
    let recordsDuplicate = 0;
    let recordsProcessed = 0;
    let recordsSkipped = 0;
    let recordsError = 0;
    const errors: Array<{ recordIndex: number; employeeCode: string | null; message: string }> = [];

    this.db.executeTransaction((db) => {
      // Create import log
      db.run(
        `INSERT INTO hr_attendance_import_logs
           (id, device_id, import_started_at, records_found, status, imported_by)
         VALUES (?, ?, ?, ?, 'RUNNING', ?)`,
        [importId, input.deviceId, input.records.length, actor.id]
      );

      for (let i = 0; i < input.records.length; i++) {
        const rec = input.records[i];
        if (!isValidDateTime(rec.deviceTimestamp)) {
          recordsError += 1;
          errors.push({ recordIndex: i, employeeCode: rec.employeeCode || null, message: 'تاريخ ووقت الجهاز غير صالح.' });
          continue;
        }
        // Check duplicate (same device + same timestamp + same event type)
        const existing = db.query<{ id: string }>(
          `SELECT id FROM hr_attendance_device_records
           WHERE device_id = ? AND device_timestamp = ? AND device_event_type = ? LIMIT 1`,
          [input.deviceId, rec.deviceTimestamp, rec.deviceEventType]
        )[0];
        if (existing) {
          recordsDuplicate += 1;
          continue;
        }
        // Resolve employee by code or by device mapping
        let employeeId: string | null = null;
        if (rec.employeeCode) {
          const emp = db.query<{ id: string; name: string }>(
            `SELECT e.id, e.name FROM employees e
             WHERE e.code = ? AND e.branch_id = ? AND e.status != 'SUSPENDED' LIMIT 1`,
            [rec.employeeCode, device.branchId]
          )[0];
          if (emp) {
            employeeId = emp.id;
          } else {
            recordsSkipped += 1;
            errors.push({ recordIndex: i, employeeCode: rec.employeeCode, message: 'الموظف غير موجود أو غير نشط في هذا الفرع.' });
            continue;
          }
        }
        const recordId = `adr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
        db.run(
          `INSERT INTO hr_attendance_device_records
             (id, device_id, employee_id, employee_code, device_timestamp,
              device_event_type, raw_data, latitude, longitude, accuracy_meters,
              processing_status, imported_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
          [recordId, input.deviceId, employeeId, rec.employeeCode || null,
            rec.deviceTimestamp, rec.deviceEventType, rec.rawData || null,
            rec.latitude || null, rec.longitude || null,
            rec.accuracyMeters || null, importStartedAt]
        );
        recordsNew += 1;
      }

      recordsProcessed = recordsNew;
      const status = recordsError > 0 && recordsNew === 0 ? 'ERROR' : 'COMPLETED';
      db.run(
        `UPDATE hr_attendance_import_logs
           SET import_completed_at = ?, records_new = ?, records_duplicate = ?,
               records_processed = ?, records_skipped = ?, records_error = ?,
               status = ?
         WHERE id = ?`,
        [new Date().toISOString(), recordsNew, recordsDuplicate, recordsProcessed,
          recordsSkipped, recordsError, status, importId]
      );
    });

    // Update device sync status
    this.toggleDeviceSyncStatus(input.deviceId, 'IDLE', recordsError > 0 ? 'some records had errors' : null);

    return {
      recordsFound: input.records.length,
      recordsNew,
      recordsDuplicate,
      recordsProcessed,
      recordsSkipped,
      recordsError,
      errors,
    };
  }

  /* ========== Process Records -> Attendance Periods ========== */

  static processPendingRecords(options: {
    deviceId?: string;
    employeeId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): { processed: number; skipped: number; errors: number } {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['r.processing_status = ?', 'r.company_id = ?'];
    const params: (string | number)[] = ['PENDING', companyId];
    if (options.deviceId) {
      conditions.push('r.device_id = ?');
      params.push(options.deviceId);
    }
    if (options.employeeId) {
      conditions.push('r.employee_id = ?');
      params.push(options.employeeId);
    }
    if (options.from) {
      conditions.push('r.device_timestamp >= ?');
      params.push(options.from);
    }
    if (options.to) {
      conditions.push('r.device_timestamp <= ?');
      params.push(options.to);
    }
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);
    const limit = options.limit ? `LIMIT ${Math.min(options.limit, 500)}` : '';

    const pending = this.db.query<any>(
      `SELECT r.id, r.device_id AS deviceId, r.employee_id AS employeeId,
              r.device_timestamp AS deviceTimestamp, r.device_event_type AS deviceEventType,
              r.latitude, r.longitude, r.accuracy_meters AS accuracyMeters
       FROM hr_attendance_device_records r
       JOIN hr_attendance_devices d ON d.id = r.device_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.device_timestamp ASC, r.imported_at ASC ${limit}`,
      params
    );

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const rec of pending) {
      try {
        if (!rec.employeeId) {
          this.markRecordError(rec.id, 'الموظف غير مرتبط بالسجل.');
          errors += 1;
          continue;
        }
        const date = rec.deviceTimestamp.slice(0, 10);
        const time = rec.deviceTimestamp.slice(11, 16);

        // Check if an open period exists for this employee on this date
        const existingOpen = this.db.query<{ id: string; checkInAt: string | null; checkOutAt: string | null }>(
          `SELECT id, check_in_at AS checkInAt, check_out_at AS checkOutAt
           FROM employee_attendance_periods
           WHERE employee_id = ? AND attendance_date = ? AND check_out_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          [rec.employeeId, date]
        )[0];

        if (rec.deviceEventType === 'CHECK_IN') {
          if (existingOpen) {
            // Already checked in, skip (duplicate)
            this.markRecordSkipped(rec.id, 'توجد فترة حضور مفتوحة بالفعل.');
            skipped += 1;
            continue;
          }
          // Create new period
          const periodId = `eap_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
          this.db.run(
            `INSERT INTO employee_attendance_periods
               (id, employee_id, operation_shift_id, attendance_date, check_in_at,
                status, source, recorded_by, latitude, longitude, accuracy_meters)
             VALUES (?, ?, NULL, ?, ?, 'OPEN', 'DEVICE', ?, ?, ?, ?)`,
            [periodId, rec.employeeId, date, `${date}T${time}:00`, actor.id,
              rec.latitude || null, rec.longitude || null, rec.accuracyMeters || null]
          );
          this.markRecordProcessed(rec.id, actor.id);
          processed += 1;
        } else if (rec.deviceEventType === 'CHECK_OUT') {
          if (!existingOpen) {
            // No open period, create a synthetic check-in then check-out
            // Use start of day as check-in if we don't know it
            const periodId = `eap_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
            this.db.run(
              `INSERT INTO employee_attendance_periods
                 (id, employee_id, operation_shift_id, attendance_date, check_in_at,
                  check_out_at, status, source, recorded_by, latitude, longitude, accuracy_meters)
               VALUES (?, ?, NULL, ?, ?, ?, 'CLOSED', 'DEVICE', ?, ?, ?, ?)`,
              [periodId, rec.employeeId, date, `${date}T08:00:00`, `${date}T${time}:00`,
                actor.id, rec.latitude || null, rec.longitude || null, rec.accuracyMeters || null]
            );
            this.markRecordProcessed(rec.id, actor.id);
            processed += 1;
          } else {
            // Close the open period
            this.db.run(
              `UPDATE employee_attendance_periods
               SET check_out_at = ?, status = 'CLOSED', updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [`${date}T${time}:00`, existingOpen.id]
            );
            this.markRecordProcessed(rec.id, actor.id);
            processed += 1;
          }
        } else if (rec.deviceEventType === 'BREAK_START' || rec.deviceEventType === 'BREAK_END') {
          // Breaks are informational; mark as processed without creating attendance rows
          this.markRecordProcessed(rec.id, actor.id);
          processed += 1;
        } else {
          // UNKNOWN event type - skip
          this.markRecordSkipped(rec.id, 'نوع حدث غير معروف.');
          skipped += 1;
        }
      } catch (err) {
        this.markRecordError(rec.id, err instanceof Error ? err.message : 'خطأ غير معروف.');
        errors += 1;
      }
    }

    // After processing, sync daily summaries for affected employees/dates
    if (processed > 0) {
      const affectedDates = new Set<string>();
      const affectedEmployees = new Set<string>();
      for (const rec of pending) {
        affectedEmployees.add(rec.employeeId);
        affectedDates.add(rec.deviceTimestamp.slice(0, 10));
      }
      for (const empId of affectedEmployees) {
        for (const d of affectedDates) {
          try {
            AttendanceTimeService.syncDailySummary(empId, d, actor.id);
          } catch {
            // ignore summary sync errors for individual records
          }
        }
      }
    }

    return { processed, skipped, errors };
  }

  private static markRecordProcessed(recordId: string, processedBy: string): void {
    this.db.run(
      `UPDATE hr_attendance_device_records
       SET processing_status = 'PROCESSED', processed = 1, processed_at = ?,
         processed_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [new Date().toISOString(), processedBy, recordId]
    );
  }

  private static markRecordSkipped(recordId: string, reason: string): void {
    this.db.run(
      `UPDATE hr_attendance_device_records
       SET processing_status = 'SKIPPED', processing_error = ?,
         processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, recordId]
    );
  }

  private static markRecordError(recordId: string, reason: string): void {
    this.db.run(
      `UPDATE hr_attendance_device_records
       SET processing_status = 'ERROR', processing_error = ?,
         processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, recordId]
    );
  }

  /* ========== Mobile App Attendance (Geo-location) ========== */

  static createMobileAttendanceSession(input: CreateMobileSessionInput): MobileAttendanceSession {
    const actor = this.requireManage();
    const employee = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM employees WHERE id = ? AND status != ?',
      [input.employeeId, 'SUSPENDED']
    )[0];
    if (!employee) throw new Error('الموظف غير موجود أو موقوف.');
    if (employee.branch_id !== input.branchId) throw new Error('الموظف لا يتبع الفرع المحدد.');
    const branch = this.db.query<{ id: string }>('SELECT id FROM branches WHERE id = ?', [input.branchId])[0];
    if (!branch) throw new Error('الفرع غير موجود.');
    if (!isValidDateTime(input.recordedAt)) throw new Error('تاريخ التسجيل غير صالح.');

    const id = `mas_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_mobile_attendance_sessions
         (id, employee_id, branch_id, session_type, recorded_at,
          latitude, longitude, accuracy_meters, device_info, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.branchId, input.sessionType, input.recordedAt,
        input.latitude, input.longitude, input.accuracyMeters || null,
        input.deviceInfo || null, input.ipAddress || null]
    );
    this.auditActor(actor, 'إنشاء جلسة حضور من تطبيق الجوال', id, {
      employeeId: input.employeeId, sessionType: input.sessionType, recordedAt: input.recordedAt,
    });
    return this.getMobileAttendanceSession(id)!;
  }

  static getMobileAttendanceSession(sessionId: string): MobileAttendanceSession | null {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('s.branch_id', undefined, actor);
    const row = this.db.query<any>(
      `SELECT s.id, s.employee_id AS employeeId, e.name AS employeeName,
              s.branch_id AS branchId, s.session_type AS sessionType,
              s.recorded_at AS recordedAt, s.latitude, s.longitude,
              s.accuracy_meters AS accuracyMeters, s.device_info AS deviceInfo,
              s.ip_address AS ipAddress, s.status,
              s.verified_by AS verifiedBy, u.full_name AS verifiedByName,
              s.verified_at AS verifiedAt, s.rejection_reason AS rejectionReason,
              s.created_at AS createdAt
       FROM hr_mobile_attendance_sessions s
       JOIN employees e ON e.id = s.employee_id
       LEFT JOIN users u ON u.id = s.verified_by
       WHERE s.id = ? AND s.company_id = ? AND ${scope.clause}`,
      [sessionId, companyId, ...scope.params]
    )[0];
    return row ? { ...row } : null;
  }

  static getMobileAttendanceSessions(status?: 'PENDING' | 'VERIFIED' | 'REJECTED'): MobileAttendanceSession[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('s.branch_id', undefined, actor);
    const conditions: string[] = ['s.company_id = ?', scope.clause];
    const params: (string | number)[] = [companyId, ...scope.params];
    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }
    return this.db.query<any>(
      `SELECT s.id, s.employee_id AS employeeId, e.name AS employeeName,
              s.branch_id AS branchId, s.session_type AS sessionType,
              s.recorded_at AS recordedAt, s.latitude, s.longitude,
              s.accuracy_meters AS accuracyMeters, s.device_info AS deviceInfo,
              s.ip_address AS ipAddress, s.status,
              s.verified_by AS verifiedBy, u.full_name AS verifiedByName,
              s.verified_at AS verifiedAt, s.rejection_reason AS rejectionReason,
              s.created_at AS createdAt
       FROM hr_mobile_attendance_sessions s
       JOIN employees e ON e.id = s.employee_id
       LEFT JOIN users u ON u.id = s.verified_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.status = 'PENDING' DESC, s.recorded_at DESC`,
      params
    );
  }

  static verifyMobileSession(sessionId: string, approve: boolean, rejectionReason?: string | null): MobileAttendanceSession {
    const actor = this.requireManage();
    const session = this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM hr_mobile_attendance_sessions WHERE id = ?',
      [sessionId]
    )[0];
    if (!session) throw new Error('جلسة الحضور غير موجودة.');
    if (session.status !== 'PENDING') throw new Error('تم البت في هذه الجلسة مسبقاً.');
    const now = new Date().toISOString();
    const newStatus = approve ? 'VERIFIED' : 'REJECTED';
    this.db.run(
      `UPDATE hr_mobile_attendance_sessions SET status = ?, verified_by = ?,
         verified_at = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newStatus, actor.id, now, approve ? null : (rejectionReason || null), sessionId]
    );
    this.auditActor(actor, approve ? 'اعتماد جلسة حضور جوال' : 'رفض جلسة حضور جوال', sessionId, {
      previousStatus: session.status, newStatus, rejectionReason,
    });
    return this.getMobileAttendanceSession(sessionId)!;
  }

  /* ========== Stats ========== */

  static getDeviceStats(): DeviceStats {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const total = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM hr_attendance_devices d WHERE d.company_id = ? AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const active = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM hr_attendance_devices d
       WHERE d.company_id = ? AND d.is_active = 1 AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const byType = this.db.query<any>(
      `SELECT d.device_type AS type, COUNT(*) AS count
       FROM hr_attendance_devices d
       WHERE d.company_id = ? AND ${scope.clause}
       GROUP BY d.device_type`,
      [companyId, ...scope.params]
    );
    const pending = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM hr_attendance_device_records r
       JOIN hr_attendance_devices d ON d.id = r.device_id
       WHERE d.company_id = ? AND r.processing_status = 'PENDING' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const today = localDateString();
    const processedToday = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM hr_attendance_device_records r
       JOIN hr_attendance_devices d ON d.id = r.device_id
       WHERE d.company_id = ? AND r.processing_status = 'PROCESSED'
         AND substr(r.processed_at, 1, 10) = ? AND ${scope.clause}`,
      [companyId, today, ...scope.params]
    )[0]?.count ?? 0;
    const lastSync = this.db.query<{ lastSync: string | null }>(
      `SELECT MAX(d.last_sync_at) AS lastSync FROM hr_attendance_devices d
       WHERE d.company_id = ? AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.lastSync ?? null;

    return {
      totalDevices: Number(total),
      activeDevices: Number(active),
      devicesByType: byType.map((row) => ({ type: row.type, count: Number(row.count) })),
      pendingRecords: Number(pending),
      processedToday: Number(processedToday),
      lastSync,
    };
  }

  /* ========== Helpers ========== */

  private static auditActor(actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }
}
