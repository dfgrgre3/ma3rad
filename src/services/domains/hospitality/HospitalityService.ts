import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { localDateString } from '../../../utils/shared/date';
import { round2 } from '../finance/financials';

export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
export type HousekeepingStatus = 'CLEAN' | 'DIRTY' | 'INSPECTED';
export type ReservationStatus = 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';

export interface HotelRoomType {
  id: string; branchId: string | null; name: string; description: string | null;
  capacity: number; baseRate: number; isActive: number;
}

export interface HotelRoom {
  id: string; branchId: string; roomTypeId: string | null; roomTypeName: string | null;
  roomNumber: string; floor: number; status: RoomStatus; housekeepingStatus: HousekeepingStatus;
  notes: string | null; currentGuest: string | null;
}

export interface HotelReservation {
  id: string; branchId: string; reservationNumber: string; customerId: string | null;
  customerName: string | null; roomId: string | null; roomNumber: string | null;
  checkIn: string; checkOut: string; status: ReservationStatus; guestsCount: number;
  totalAmount: number; nights: number; notes: string | null; createdAt: string;
}

export interface HotelFolioEntry {
  id: string; reservationId: string; roomId: string | null; entryDate: string;
  description: string; amount: number; entryType: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';
  createdAt: string;
}

export interface HousekeepingTask {
  id: string; branchId: string; roomId: string; roomNumber: string; taskType: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'; assignedTo: string | null;
  scheduledDate: string | null; notes: string | null; completedAt: string | null;
}

const PERM_VIEW = 'orders.view';
const PERM_MANAGE = 'orders.update';

export class HospitalityService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private currentBranchId(): string {
    try { return this.branchAccess.getCurrentBranchId(); } catch { return ''; }
  }

  private requireView() {
    ModuleRegistryService.assertModuleEnabled('sales');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, PERM_VIEW);
    return actor;
  }

  private requireManage() {
    ModuleRegistryService.assertModuleEnabled('sales');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, PERM_MANAGE);
    return actor;
  }

  // ── Room types ──────────────────────────────────────────────────────────

  public getRoomTypes(branchId?: string): HotelRoomType[] {
    this.requireView();
    const rows = this.db.query<any>(
      `SELECT id, branch_id AS branchId, name, description, capacity, base_rate AS baseRate, is_active AS isActive
       FROM hotel_room_types ${branchId ? 'WHERE branch_id = ?' : ''} ORDER BY name`,
      branchId ? [branchId] : []
    );
    return rows;
  }

  public saveRoomType(input: { id?: string; branchId?: string; name: string; description?: string; capacity?: number; baseRate?: number; isActive?: number }): HotelRoomType {
    this.requireManage();
    const id = input.id || uuidv4();
    if (input.id) {
      this.db.run(
        `UPDATE hotel_room_types SET name=?, description=?, capacity=?, base_rate=?, is_active=? WHERE id=?`,
        [input.name, input.description || null, input.capacity ?? 2, input.baseRate ?? 0, input.isActive ?? 1, id]
      );
    } else {
      this.db.run(
        `INSERT INTO hotel_room_types (id, branch_id, name, description, capacity, base_rate, is_active)
         VALUES (?,?,?,?,?,?,?)`,
        [id, input.branchId || null, input.name, input.description || null, input.capacity ?? 2, input.baseRate ?? 0, input.isActive ?? 1]
      );
    }
    return this.getRoomTypes().find((t) => t.id === id)!;
  }

  // ── Rooms / floor map ───────────────────────────────────────────────────

  public getRooms(branchId?: string): HotelRoom[] {
    this.requireView();
    return this.db.query<any>(
      `SELECT r.id, r.branch_id AS branchId, r.room_type_id AS roomTypeId, rt.name AS roomTypeName,
              r.room_number AS roomNumber, r.floor, r.status, r.housekeeping_status AS housekeepingStatus,
              r.notes,
              (SELECT c.name FROM hotel_reservations hr JOIN customers c ON c.id = hr.customer_id
               WHERE hr.room_id = r.id AND hr.status = 'CHECKED_IN' LIMIT 1) AS currentGuest
       FROM hotel_rooms r LEFT JOIN hotel_room_types rt ON rt.id = r.room_type_id
       ${branchId ? 'WHERE r.branch_id = ?' : ''}
       ORDER BY r.floor, CAST(r.room_number AS INTEGER), r.room_number`,
      branchId ? [branchId] : []
    );
  }

  public getRoomsByFloor(branchId?: string): Array<{ floor: number; rooms: HotelRoom[] }> {
    const rooms = this.getRooms(branchId);
    const map = new Map<number, HotelRoom[]>();
    for (const room of rooms) {
      const list = map.get(room.floor) ?? [];
      list.push(room);
      map.set(room.floor, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([floor, rs]) => ({ floor, rooms: rs }));
  }

  public saveRoom(input: { id?: string; branchId: string; roomTypeId?: string; roomNumber: string; floor?: number; notes?: string }): HotelRoom {
    this.requireManage();
    const id = input.id || uuidv4();
    if (input.id) {
      this.db.run(
        `UPDATE hotel_rooms SET room_type_id=?, room_number=?, floor=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [input.roomTypeId || null, input.roomNumber, input.floor ?? 0, input.notes || null, id]
      );
    } else {
      this.db.run(
        `INSERT INTO hotel_rooms (id, branch_id, room_type_id, room_number, floor, notes) VALUES (?,?,?,?,?,?)`,
        [id, input.branchId || this.currentBranchId(), input.roomTypeId || null, input.roomNumber, input.floor ?? 0, input.notes || null]
      );
    }
    return this.getRooms().find((r) => r.id === id)!;
  }

  public setRoomStatus(roomId: string, status: RoomStatus, housekeepingStatus?: HousekeepingStatus): void {
    this.requireManage();
    this.db.run(
      `UPDATE hotel_rooms SET status=?, housekeeping_status=COALESCE(?, housekeeping_status), updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [status, housekeepingStatus ?? null, roomId]
    );
  }

  public setHousekeepingStatus(roomId: string, status: HousekeepingStatus): void {
    this.requireManage();
    this.db.run(`UPDATE hotel_rooms SET housekeeping_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [status, roomId]);
  }

  // ── Reservations ────────────────────────────────────────────────────────

  private nightsBetween(checkIn: string, checkOut: string): number {
    const a = new Date(`${checkIn}T00:00:00`).getTime();
    const b = new Date(`${checkOut}T00:00:00`).getTime();
    return Math.max(1, Math.round((b - a) / 86400000));
  }

  public getReservations(filters?: { status?: ReservationStatus; from?: string; to?: string; branchId?: string }): HotelReservation[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters?.status) { where.push('hr.status = ?'); params.push(filters.status); }
    if (filters?.from) { where.push('hr.check_out >= ?'); params.push(filters.from); }
    if (filters?.to) { where.push('hr.check_in <= ?'); params.push(filters.to); }
    if (filters?.branchId) { where.push('hr.branch_id = ?'); params.push(filters.branchId); }
    const sql = `
      SELECT hr.id, hr.branch_id AS branchId, hr.reservation_number AS reservationNumber,
             hr.customer_id AS customerId, c.name AS customerName,
             hr.room_id AS roomId, r.room_number AS roomNumber,
             hr.check_in AS checkIn, hr.check_out AS checkOut, hr.status,
             hr.guests_count AS guestsCount, hr.total_amount AS totalAmount,
             hr.notes, hr.created_at AS createdAt
      FROM hotel_reservations hr
      LEFT JOIN customers c ON c.id = hr.customer_id
      LEFT JOIN hotel_rooms r ON r.id = hr.room_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY hr.check_in DESC`;
    return this.db.query<any>(sql, params).map((row) => ({
      ...row,
      totalAmount: round2(Number(row.totalAmount)),
      nights: this.nightsBetween(row.checkIn, row.checkOut),
    }));
  }

  public getReservationById(id: string): HotelReservation | null {
    return this.getReservations().find((r) => r.id === id) ?? null;
  }

  public createReservation(input: {
    branchId: string; customerId?: string; roomId?: string;
    checkIn: string; checkOut: string; guestsCount?: number; notes?: string;
  }): HotelReservation {
    this.requireManage();
    const nights = this.nightsBetween(input.checkIn, input.checkOut);
    let total = 0;
    if (input.roomId) {
      const room = this.db.query<any>(
        `SELECT rt.base_rate AS baseRate FROM hotel_rooms r LEFT JOIN hotel_room_types rt ON rt.id = r.room_type_id WHERE r.id = ?`,
        [input.roomId]
      )[0];
      total = round2(Number(room?.baseRate ?? 0) * nights);
    }
    const number = `RES-${localDateString().replace(/-/g, '')}-${uuidv4().slice(0, 6).toUpperCase()}`;
    const id = uuidv4();
    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO hotel_reservations (id, branch_id, reservation_number, customer_id, room_id, check_in, check_out, guests_count, total_amount, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, input.branchId || this.currentBranchId(), number, input.customerId || null, input.roomId || null,
         input.checkIn, input.checkOut, input.guestsCount ?? 1, total, input.notes ?? null,
         AuthService.requireAuth().id]
      );
      if (input.roomId) {
        this.db.run(`UPDATE hotel_rooms SET status='RESERVED', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [input.roomId]);
      }
    });
    return this.getReservationById(id)!;
  }

  public updateReservationStatus(id: string, status: ReservationStatus): void {
    this.requireManage();
    this.db.executeTransaction(() => {
      const res = this.db.query<any>(`SELECT room_id AS roomId, status AS oldStatus FROM hotel_reservations WHERE id=?`, [id])[0];
      if (!res) throw new Error('الحجز غير موجود.');
      this.db.run(`UPDATE hotel_reservations SET status=? WHERE id=?`, [status, id]);
      if (res.roomId) {
        if (status === 'CHECKED_IN') {
          this.db.run(`UPDATE hotel_rooms SET status='OCCUPIED', housekeeping_status='DIRTY', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [res.roomId]);
        } else if (status === 'CHECKED_OUT' || status === 'CANCELLED' || status === 'NO_SHOW') {
          this.db.run(`UPDATE hotel_rooms SET status='CLEANING', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [res.roomId]);
        }
      }
    });
  }

  // ── Folio / nightly billing ─────────────────────────────────────────────

  public getFolio(reservationId: string): HotelFolioEntry[] {
    this.requireView();
    return this.db.query<any>(
      `SELECT id, reservation_id AS reservationId, room_id AS roomId, entry_date AS entryDate,
              description, amount, entry_type AS entryType, created_at AS createdAt
       FROM hotel_folio_entries WHERE reservation_id=? ORDER BY entry_date, created_at`,
      [reservationId]
    );
  }

  public getFolioBalance(reservationId: string): number {
    const entries = this.getFolio(reservationId);
    return round2(entries.reduce((sum, e) => sum + (e.entryType === 'PAYMENT' ? -Math.abs(e.amount) : e.amount), 0));
  }

  /** Post the nightly room charge for every checked-in reservation covering today. */
  public postNightlyCharges(date: string = localDateString()): number {
    this.requireManage();
    const actor = AuthService.requireAuth();
    const checkedIn = this.db.query<any>(
      `SELECT hr.id, hr.room_id AS roomId, rt.base_rate AS baseRate, hr.branch_id AS branchId
       FROM hotel_reservations hr
       LEFT JOIN hotel_rooms r ON r.id = hr.room_id
       LEFT JOIN hotel_room_types rt ON rt.id = r.room_type_id
       WHERE hr.status = 'CHECKED_IN'`
    );
    let posted = 0;
    this.db.executeTransaction(() => {
      for (const res of checkedIn) {
        const exists = this.db.query<any>(
          `SELECT 1 AS x FROM hotel_folio_entries WHERE reservation_id=? AND entry_date=? AND description='إقامة ليلة'`,
          [res.id, date]
        )[0];
        if (exists || !res.roomId) continue;
        const rate = Number(res.baseRate ?? 0);
        if (rate <= 0) continue;
        this.db.run(
          `INSERT INTO hotel_folio_entries (id, reservation_id, room_id, entry_date, description, amount, entry_type, created_by)
           VALUES (?,?,?,?,?,?,?,?)`,
          [uuidv4(), res.id, res.roomId, date, 'إقامة ليلة', round2(rate), 'CHARGE', actor.id]
        );
        posted += 1;
      }
    });
    return posted;
  }

  public addFolioEntry(reservationId: string, input: { description: string; amount: number; entryType?: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT'; entryDate?: string }): HotelFolioEntry {
    this.requireManage();
    const id = uuidv4();
    this.db.run(
      `INSERT INTO hotel_folio_entries (id, reservation_id, entry_date, description, amount, entry_type, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [id, reservationId, input.entryDate ?? localDateString(), input.description, round2(input.amount), input.entryType ?? 'CHARGE', AuthService.requireAuth().id]
    );
    return this.getFolio(reservationId).find((e) => e.id === id)!;
  }

  // ── Housekeeping ────────────────────────────────────────────────────────

  public getHousekeepingTasks(status?: string, date?: string): HousekeepingTask[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (status) { where.push('t.status = ?'); params.push(status); }
    if (date) { where.push('(t.scheduled_date = ? OR t.scheduled_date IS NULL)'); params.push(date); }
    return this.db.query<any>(
      `SELECT t.id, t.branch_id AS branchId, t.room_id AS roomId, r.room_number AS roomNumber,
              t.task_type AS taskType, t.status, t.assigned_to AS assignedTo,
              t.scheduled_date AS scheduledDate, t.notes, t.completed_at AS completedAt
       FROM hotel_housekeeping_tasks t JOIN hotel_rooms r ON r.id = t.room_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY t.scheduled_date DESC, r.room_number`,
      params
    );
  }

  public createHousekeepingTask(input: { branchId: string; roomId: string; taskType?: string; assignedTo?: string; scheduledDate?: string; notes?: string }): HousekeepingTask {
    this.requireManage();
    const id = uuidv4();
    this.db.run(
      `INSERT INTO hotel_housekeeping_tasks (id, branch_id, room_id, task_type, assigned_to, scheduled_date, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [id, input.branchId || this.currentBranchId(), input.roomId, input.taskType ?? 'CLEANING', input.assignedTo ?? null, input.scheduledDate ?? null, input.notes ?? null]
    );
    if (input.taskType === 'MAINTENANCE') {
      this.db.run(`UPDATE hotel_rooms SET status='MAINTENANCE', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [input.roomId]);
    }
    return this.getHousekeepingTasks().find((t) => t.id === id)!;
  }

  public updateHousekeepingTask(id: string, status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'): void {
    this.requireManage();
    this.db.executeTransaction(() => {
      const task = this.db.query<any>(`SELECT room_id AS roomId, task_type AS taskType FROM hotel_housekeeping_tasks WHERE id=?`, [id])[0];
      this.db.run(
        `UPDATE hotel_housekeeping_tasks SET status=?, completed_at=CASE WHEN ?='DONE' THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE id=?`,
        [status, status, id]
      );
      if (task && status === 'DONE') {
        const room = this.db.query<any>(`SELECT housekeeping_status AS hk FROM hotel_rooms WHERE id=?`, [task.roomId])[0];
        if (task.taskType === 'CLEANING') {
          this.db.run(`UPDATE hotel_rooms SET housekeeping_status='CLEAN', status=CASE WHEN status='CLEANING' THEN 'AVAILABLE' ELSE status END, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [task.roomId]);
        } else if (task.taskType === 'INSPECTION' && room?.hk === 'DIRTY') {
          this.db.run(`UPDATE hotel_rooms SET housekeeping_status='INSPECTED', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [task.roomId]);
        } else if (task.taskType === 'MAINTENANCE') {
          this.db.run(`UPDATE hotel_rooms SET status='AVAILABLE', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [task.roomId]);
        }
      }
    });
  }

  // ── Dashboard stats ─────────────────────────────────────────────────────

  public getDashboardStats(branchId?: string): {
    totalRooms: number; occupied: number; available: number; reserved: number;
    cleaning: number; maintenance: number; arrivalsToday: number; departuresToday: number;
    occupancyRate: number; pendingTasks: number; folioBalance: number;
  } {
    this.requireView();
    const today = localDateString();
    const rooms = this.db.query<any>(
      `SELECT status, COUNT(*) AS c FROM hotel_rooms ${branchId ? 'WHERE branch_id=?' : ''} GROUP BY status`,
      branchId ? [branchId] : []
    );
    const count = (s: string) => Number(rooms.find((r) => r.status === s)?.c ?? 0);
    const totalRooms = rooms.reduce((s, r) => s + Number(r.c), 0);
    const arrivals = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM hotel_reservations WHERE check_in=? AND status IN ('CONFIRMED','CHECKED_IN') ${branchId ? 'AND branch_id=?' : ''}`,
      branchId ? [today, branchId] : [today]
    )[0];
    const departures = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM hotel_reservations WHERE check_out=? AND status='CHECKED_IN' ${branchId ? 'AND branch_id=?' : ''}`,
      branchId ? [today, branchId] : [today]
    )[0];
    const pending = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM hotel_housekeeping_tasks WHERE status IN ('PENDING','IN_PROGRESS')`
    )[0];
    const folio = this.db.query<any>(
      `SELECT COALESCE(SUM(CASE WHEN fe.entry_type='PAYMENT' THEN -ABS(fe.amount) ELSE fe.amount END),0) AS bal
       FROM hotel_folio_entries fe JOIN hotel_reservations hr ON hr.id=fe.reservation_id
       WHERE hr.status='CHECKED_IN'`
    )[0];
    const occupied = count('OCCUPIED');
    return {
      totalRooms, occupied, available: count('AVAILABLE'), reserved: count('RESERVED'),
      cleaning: count('CLEANING'), maintenance: count('MAINTENANCE') + count('OUT_OF_SERVICE'),
      arrivalsToday: Number(arrivals?.c ?? 0), departuresToday: Number(departures?.c ?? 0),
      occupancyRate: totalRooms ? round2((occupied / totalRooms) * 100) : 0,
      pendingTasks: Number(pending?.c ?? 0),
      folioBalance: round2(Number(folio?.bal ?? 0)),
    };
  }
}
