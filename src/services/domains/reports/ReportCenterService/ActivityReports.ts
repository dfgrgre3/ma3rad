import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num } from './helpers';
import { round2 } from '../../finance/financials';
import { localDateString } from '../../../../utils/shared/date';

type Constructor<T = object> = new (...args: any[]) => T;

const DAY_MS = 86400000;

/**
 * Industry-specific reports for activities that have their own operational
 * tables: hospitality (hotel rooms/reservations/folio), restaurant (tables,
 * orders, kitchen), education (classes/attendance/fees), automotive workshop
 * (work orders) and professional services (time billing).
 * All queries are branch scoped like every other report.
 */
export function ActivityReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class ActivityReports extends Base {
    /** Hotel: current room status KPIs + reservations arriving in the period. */
    public async hotelOccupancy({ from, to }: ReportParams): Promise<ReportResult> {
      this.actor();
      const roomScope = this.tableScope('r.branch_id');
      const resScope = this.tableScope('hr.branch_id');
      const today = localDateString();

      const roomRows = await this.db.queryAsync<any>(`
        SELECT r.status, COUNT(*) AS c FROM hotel_rooms r
        WHERE ${roomScope.clause} GROUP BY r.status`, roomScope.params);
      const roomCount = (s: string) => Number(roomRows.find((r) => r.status === s)?.c ?? 0);
      const totalRooms = roomRows.reduce((s, r) => s + num(r.c), 0);
      const occupied = roomCount('OCCUPIED');

      const arrivals = await this.db.queryAsync<any>(`
        SELECT COUNT(*) AS c FROM hotel_reservations hr
        WHERE hr.check_in >= ? AND hr.check_in <= ? AND hr.status != 'CANCELLED' AND ${resScope.clause}`,
        [from, to, ...resScope.params]);
      const departuresPeriod = await this.db.queryAsync<any>(`
        SELECT COUNT(*) AS c FROM hotel_reservations hr
        WHERE hr.check_out >= ? AND hr.check_out <= ? AND hr.status != 'CANCELLED' AND ${resScope.clause}`,
        [from, to, ...resScope.params]);
      const todayArrivals = await this.db.queryAsync<any>(`
        SELECT COUNT(*) AS c FROM hotel_reservations hr
        WHERE hr.check_in = ? AND hr.status IN ('CONFIRMED','CHECKED_IN') AND ${resScope.clause}`,
        [today, ...resScope.params]);
      const todayDepartures = await this.db.queryAsync<any>(`
        SELECT COUNT(*) AS c FROM hotel_reservations hr
        WHERE hr.check_out = ? AND hr.status = 'CHECKED_IN' AND ${resScope.clause}`,
        [today, ...resScope.params]);
      const pendingTasks = await this.db.queryAsync<any>(`
        SELECT COUNT(*) AS c FROM hotel_housekeeping_tasks t
        JOIN hotel_rooms r ON r.id = t.room_id
        WHERE t.status IN ('PENDING','IN_PROGRESS') AND ${roomScope.clause}`, roomScope.params);
      const folio = await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(CASE WHEN fe.entry_type='PAYMENT' THEN -ABS(fe.amount) ELSE fe.amount END),0) AS bal
        FROM hotel_folio_entries fe
        JOIN hotel_reservations hr ON hr.id = fe.reservation_id
        JOIN hotel_rooms r ON r.id = hr.room_id
        WHERE hr.status='CHECKED_IN' AND ${roomScope.clause}`, roomScope.params);

      const reservations = await this.db.queryAsync<any>(`
        SELECT hr.reservation_number AS reservationNumber, c.name AS customer,
               r.room_number AS room, rt.name AS roomType,
               hr.check_in AS checkIn, hr.check_out AS checkOut,
               hr.guests_count AS guests, hr.status, hr.total_amount / 1.0 AS total
        FROM hotel_reservations hr
        LEFT JOIN customers c ON c.id = hr.customer_id
        LEFT JOIN hotel_rooms r ON r.id = hr.room_id
        LEFT JOIN hotel_room_types rt ON rt.id = r.room_type_id
        WHERE hr.check_in >= ? AND hr.check_in <= ? AND hr.status != 'CANCELLED' AND ${resScope.clause}
        ORDER BY hr.check_in DESC`, [from, to, ...resScope.params]);

      return {
        kpis: [
          { label: 'نسبة الإشغال', value: totalRooms ? round2((occupied / totalRooms) * 100) : 0, tone: 'info' },
          { label: 'غرف مشغولة / متاحة', value: `${occupied} / ${roomCount('AVAILABLE')}`, tone: occupied ? 'warning' : 'success' },
          { label: 'وصول اليوم', value: num(todayArrivals[0]?.c), tone: 'neutral' },
          { label: 'مغادرة اليوم', value: num(todayDepartures[0]?.c), tone: 'neutral' },
          { label: 'وصول الفترة', value: num(arrivals[0]?.c), tone: 'info' },
          { label: 'مغادرة الفترة', value: num(departuresPeriod[0]?.c), tone: 'info' },
          { label: 'مهام نظافة معلقة', value: num(pendingTasks[0]?.c), tone: num(pendingTasks[0]?.c) ? 'warning' : 'success' },
          { label: 'أرصدة الفوليو المفتوحة', value: num(folio[0]?.bal), tone: 'info' },
        ],
        columns: [
          { key: 'reservationNumber', label: 'رقم الحجز' },
          { key: 'customer', label: 'النزيل' },
          { key: 'room', label: 'الغرفة' },
          { key: 'roomType', label: 'نوع الغرفة' },
          { key: 'checkIn', label: 'الدخول', type: 'date' },
          { key: 'checkOut', label: 'الخروج', type: 'date' },
          { key: 'guests', label: 'النزلاء', type: 'number' },
          { key: 'status', label: 'الحالة', type: 'badge' },
          { key: 'total', label: 'القيمة', type: 'currency' },
        ],
        rows: reservations,
        notes: [`إجمالي الغرف: ${totalRooms} — مشغولة: ${occupied} — محجوزة: ${roomCount('RESERVED')} — تنظيف: ${roomCount('CLEANING')} — صيانة/خارج الخدمة: ${roomCount('MAINTENANCE') + roomCount('OUT_OF_SERVICE')}`],
      };
    }

    /** Restaurant: orders in the period with table/mode/kitchen breakdown. */
    public async restaurantOperations({ from, to }: ReportParams): Promise<ReportResult> {
      this.actor();
      const scope = this.tableScope('o.branch_id');

      const openNow = await this.db.queryAsync<any>(`
        SELECT COUNT(*) AS c FROM restaurant_orders o WHERE o.status='OPEN' AND ${scope.clause}`, scope.params);
      const kitchen = await this.db.queryAsync<any>(`
        SELECT i.kitchen_status AS status, COUNT(*) AS c
        FROM restaurant_order_items i
        JOIN restaurant_orders o ON o.id = i.order_id
        WHERE o.status='OPEN' AND ${scope.clause} GROUP BY i.kitchen_status`, scope.params);
      const kCount = (s: string) => Number(kitchen.find((r) => r.status === s)?.c ?? 0);

      const orders = await this.db.queryAsync<any>(`
        SELECT o.order_number AS orderNumber, t.table_number AS tableNumber,
               o.service_mode AS serviceMode, c.name AS customer, o.status,
               (SELECT COUNT(*) FROM restaurant_order_items i WHERE i.order_id = o.id) AS itemsCount,
               (SELECT COALESCE(SUM(i.quantity * i.unit_price),0) FROM restaurant_order_items i WHERE i.order_id = o.id) / 1.0 AS total,
               (SELECT COUNT(*) FROM restaurant_order_items i WHERE i.order_id = o.id AND i.kitchen_status IN ('NEW','PREPARING')) AS kitchenPending,
               o.created_at AS createdAt
        FROM restaurant_orders o
        LEFT JOIN restaurant_tables t ON t.id = o.table_id
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.created_at >= ? AND o.created_at <= ? AND ${scope.clause}
        ORDER BY o.created_at DESC`, [from, to, ...scope.params]);

      const revenue = orders.filter((o) => o.status === 'BILLED').reduce((s, o) => s + num(o.total), 0);
      const dineIn = orders.filter((o) => o.serviceMode === 'DINE_IN').length;
      const takeaway = orders.filter((o) => o.serviceMode === 'TAKEAWAY').length;
      const delivery = orders.filter((o) => o.serviceMode === 'DELIVERY').length;

      return {
        kpis: [
          { label: 'طلبات مفتوحة الآن', value: num(openNow[0]?.c), tone: num(openNow[0]?.c) ? 'warning' : 'success' },
          { label: 'طلبات الفترة', value: orders.length, tone: 'neutral' },
          { label: 'إيراد المفوتر', value: round2(revenue), tone: 'success' },
          { label: 'أصناف في المطبخ', value: kCount('NEW') + kCount('PREPARING'), tone: kCount('NEW') + kCount('PREPARING') ? 'info' : 'neutral' },
          { label: 'جاهزة للتقديم', value: kCount('READY'), tone: kCount('READY') ? 'success' : 'neutral' },
        ],
        columns: [
          { key: 'orderNumber', label: 'رقم الطلب' },
          { key: 'tableNumber', label: 'الطاولة', type: 'number' },
          { key: 'serviceMode', label: 'القناة', type: 'badge' },
          { key: 'customer', label: 'العميل' },
          { key: 'itemsCount', label: 'الأصناف', type: 'number' },
          { key: 'kitchenPending', label: 'في المطبخ', type: 'number' },
          { key: 'total', label: 'الإجمالي', type: 'currency' },
          { key: 'status', label: 'الحالة', type: 'badge' },
          { key: 'createdAt', label: 'التاريخ', type: 'date' },
        ],
        rows: orders,
        notes: [`توزيع الطلبات: صالة ${dineIn} — سفري ${takeaway} — توصيل ${delivery}`],
      };
    }

    /** Education: per-class attendance aggregates for the period. */
    public async educationAttendance({ from, to }: ReportParams): Promise<ReportResult> {
      this.actor();
      const scope = this.tableScope('cl.branch_id');

      const activeClasses = await this.db.queryAsync<any>(`
        SELECT COUNT(*) AS c FROM edu_classes cl WHERE cl.is_active = 1 AND ${scope.clause}`, scope.params);
      const enrolled = await this.db.queryAsync<any>(`
        SELECT COUNT(*) AS c FROM edu_enrollments en JOIN edu_classes cl ON cl.id = en.class_id
        WHERE en.status IN ('ENROLLED','ACTIVE') AND ${scope.clause}`, scope.params);

      const rows = await this.db.queryAsync<any>(`
        SELECT cl.name AS className, cl.subject, cl.academic_year AS academicYear,
               e.full_name AS teacher,
               (SELECT COUNT(*) FROM edu_enrollments en WHERE en.class_id = cl.id AND en.status IN ('ENROLLED','ACTIVE')) AS enrolledCount,
               COUNT(a.id) AS records,
               COALESCE(SUM(CASE WHEN a.status='PRESENT' THEN 1 ELSE 0 END),0) AS present,
               COALESCE(SUM(CASE WHEN a.status='ABSENT' THEN 1 ELSE 0 END),0) AS absent,
               COALESCE(SUM(CASE WHEN a.status='LATE' THEN 1 ELSE 0 END),0) AS late,
               COALESCE(SUM(CASE WHEN a.status='EXCUSED' THEN 1 ELSE 0 END),0) AS excused
        FROM edu_classes cl
        LEFT JOIN edu_attendance a ON a.class_id = cl.id AND a.session_date >= ? AND a.session_date <= ?
        LEFT JOIN employees e ON e.id = cl.teacher_id
        WHERE cl.is_active = 1 AND ${scope.clause}
        GROUP BY cl.id ORDER BY cl.name`, [from, to, ...scope.params]);

      const totalRecords = rows.reduce((s, r) => s + num(r.records), 0);
      const totalPresent = rows.reduce((s, r) => s + num(r.present), 0);
      const rate = totalRecords ? round2((totalPresent / totalRecords) * 100) : 0;

      return {
        kpis: [
          { label: 'فصول نشطة', value: num(activeClasses[0]?.c), tone: 'neutral' },
          { label: 'طلاب مسجلون', value: num(enrolled[0]?.c), tone: 'info' },
          { label: 'سجلات حضور', value: totalRecords, tone: 'neutral' },
          { label: 'معدل الحضور %', value: rate, tone: rate >= 80 ? 'success' : rate >= 60 ? 'warning' : 'danger' },
        ],
        columns: [
          { key: 'className', label: 'الفصل' },
          { key: 'subject', label: 'المادة' },
          { key: 'academicYear', label: 'العام' },
          { key: 'teacher', label: 'المدرس' },
          { key: 'enrolledCount', label: 'المسجلون', type: 'number' },
          { key: 'records', label: 'السجلات', type: 'number' },
          { key: 'present', label: 'حاضر', type: 'number' },
          { key: 'absent', label: 'غائب', type: 'number' },
          { key: 'late', label: 'متأخر', type: 'number' },
          { key: 'rate', label: 'النسبة %', type: 'percent' },
        ],
        rows: rows.map((r) => ({
          ...r,
          rate: num(r.records) ? round2((num(r.present) / num(r.records)) * 100) : 0,
        })),
      };
    }

    /** Education: fee installments per student with collection status. */
    public async educationFees({ status }: ReportParams): Promise<ReportResult> {
      this.actor();
      const scope = this.tableScope('cl.branch_id');
      const today = localDateString();
      const clauses = [scope.clause];
      const params: unknown[] = [...scope.params];
      if (status && status !== 'ALL') { clauses.push('f.status = ?'); params.push(status); }

      const rows = await this.db.queryAsync<any>(`
        SELECT f.title, c.name AS student, cl.name AS className,
               f.amount / 1.0 AS amount, f.paid_amount / 1.0 AS paid,
               (f.amount - f.paid_amount) / 1.0 AS outstanding,
               f.due_date AS dueDate, f.status, f.invoice_id AS invoiceId
        FROM edu_fee_installments f
        JOIN edu_enrollments en ON en.id = f.enrollment_id
        JOIN edu_classes cl ON cl.id = en.class_id
        JOIN customers c ON c.id = en.customer_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY f.due_date IS NULL, f.due_date`, params);

      const billed = rows.reduce((s, r) => s + num(r.amount), 0);
      const collected = rows.reduce((s, r) => s + num(r.paid), 0);
      const overdue = rows.filter((r) => r.status === 'OVERDUE' || (r.status === 'PENDING' && r.dueDate && r.dueDate < today));
      const overdueAmount = overdue.reduce((s, r) => s + num(r.outstanding), 0);

      return {
        kpis: [
          { label: 'إجمالي المستحق', value: round2(billed), tone: 'info' },
          { label: 'المحصل', value: round2(collected), tone: 'success' },
          { label: 'المتبقي', value: round2(billed - collected), tone: 'warning' },
          { label: 'أقساط متأخرة', value: overdue.length, tone: overdue.length ? 'danger' : 'success' },
          { label: 'قيمة المتأخر', value: round2(overdueAmount), tone: overdueAmount ? 'danger' : 'neutral' },
        ],
        columns: [
          { key: 'student', label: 'الطالب' },
          { key: 'className', label: 'الفصل' },
          { key: 'title', label: 'القسط' },
          { key: 'amount', label: 'المبلغ', type: 'currency' },
          { key: 'paid', label: 'المدفوع', type: 'currency' },
          { key: 'outstanding', label: 'المتبقي', type: 'currency' },
          { key: 'dueDate', label: 'الاستحقاق', type: 'date' },
          { key: 'status', label: 'الحالة', type: 'badge' },
        ],
        rows,
      };
    }

    /** Workshop: work orders in the period with status and turnaround. */
    public async workshopOrders({ from, to, status }: ReportParams): Promise<ReportResult> {
      this.actor();
      const scope = this.tableScope('wo.branch_id');
      const clauses = [`wo.created_at >= ?`, `wo.created_at <= ?`, scope.clause];
      const params: unknown[] = [from, to, ...scope.params];
      if (status && status !== 'ALL') { clauses.push('wo.status = ?'); params.push(status); }

      const rows = await this.db.queryAsync<any>(`
        SELECT wo.order_number AS orderNumber, c.name AS customer,
               wo.vehicle_plate AS plate, wo.vehicle_make AS make, wo.vehicle_model AS model,
               wo.complaint, wo.diagnosis, e.full_name AS technician,
               wo.promised_date AS promisedDate, wo.status,
               wo.labor_total / 1.0 AS labor, wo.parts_total / 1.0 AS parts,
               wo.grand_total / 1.0 AS grandTotal,
               wo.created_at AS createdAt, wo.updated_at AS updatedAt
        FROM workshop_work_orders wo
        LEFT JOIN customers c ON c.id = wo.customer_id
        LEFT JOIN employees e ON e.id = wo.technician_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY wo.created_at DESC`, params);

      const byStatus = (s: string) => rows.filter((r) => r.status === s).length;
      const delivered = rows.filter((r) => r.status === 'DELIVERED');
      const revenue = delivered.reduce((s, r) => s + num(r.grandTotal), 0);
      const turnaround = delivered
        .map((r) => (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / DAY_MS)
        .filter((d) => Number.isFinite(d) && d >= 0);
      const avgDays = turnaround.length ? round2(turnaround.reduce((s, d) => s + d, 0) / turnaround.length) : 0;

      return {
        kpis: [
          { label: 'أوامر الفترة', value: rows.length, tone: 'neutral' },
          { label: 'مفتوحة الآن (بالفترة)', value: byStatus('RECEIVED') + byStatus('INSPECTION') + byStatus('WAITING_APPROVAL') + byStatus('APPROVED') + byStatus('IN_PROGRESS') + byStatus('READY'), tone: 'warning' },
          { label: 'بانتظار موافقة العميل', value: byStatus('WAITING_APPROVAL'), tone: byStatus('WAITING_APPROVAL') ? 'warning' : 'neutral' },
          { label: 'جاهزة للتسليم', value: byStatus('READY'), tone: byStatus('READY') ? 'success' : 'neutral' },
          { label: 'مسلمة', value: delivered.length, tone: 'success' },
          { label: 'إيراد المسلّم', value: round2(revenue), tone: 'success' },
          { label: 'متوسط زمن الإنجاز (يوم)', value: avgDays, tone: 'info' },
        ],
        columns: [
          { key: 'orderNumber', label: 'رقم الأمر' },
          { key: 'customer', label: 'العميل' },
          { key: 'plate', label: 'اللوحة' },
          { key: 'vehicle', label: 'المركبة' },
          { key: 'complaint', label: 'العطل' },
          { key: 'technician', label: 'الفني' },
          { key: 'promisedDate', label: 'الوعد', type: 'date' },
          { key: 'grandTotal', label: 'الإجمالي', type: 'currency' },
          { key: 'status', label: 'الحالة', type: 'badge' },
          { key: 'createdAt', label: 'الاستلام', type: 'date' },
        ],
        rows: rows.map((r) => ({ ...r, vehicle: [r.make, r.model].filter(Boolean).join(' ') || '—' })),
      };
    }

    /** Professional services: time entries grouped by customer. */
    public async timeBillingReport({ from, to, status }: ReportParams): Promise<ReportResult> {
      this.actor();
      const scope = this.tableScope('t.branch_id');
      const clauses = [`t.entry_date >= ?`, `t.entry_date <= ?`, scope.clause];
      const params: unknown[] = [from, to, ...scope.params];
      if (status && status !== 'ALL') { clauses.push('t.status = ?'); params.push(status); }

      const rows = await this.db.queryAsync<any>(`
        SELECT COALESCE(c.name, 'بدون عميل') AS customer,
               COUNT(*) AS entries,
               ROUND(SUM(t.minutes) / 60.0, 2) AS hours,
               ROUND(SUM(CASE WHEN t.billable = 1 THEN t.minutes / 60.0 * t.hourly_rate ELSE 0 END), 2) AS billableAmount,
               ROUND(SUM(CASE WHEN t.billable = 1 AND t.status IN ('DRAFT','SUBMITTED','APPROVED') THEN t.minutes / 60.0 * t.hourly_rate ELSE 0 END), 2) AS unbilledAmount,
               SUM(CASE WHEN t.status = 'INVOICED' THEN 1 ELSE 0 END) AS invoiced,
               SUM(CASE WHEN t.status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected
        FROM time_entries t
        LEFT JOIN customers c ON c.id = t.customer_id
        WHERE ${clauses.join(' AND ')}
        GROUP BY t.customer_id
        ORDER BY billableAmount DESC`, params);

      const hours = rows.reduce((s, r) => s + num(r.hours), 0);
      const amount = rows.reduce((s, r) => s + num(r.billableAmount), 0);
      const unbilled = rows.reduce((s, r) => s + num(r.unbilledAmount), 0);

      return {
        kpis: [
          { label: 'إجمالي الساعات', value: round2(hours), tone: 'info' },
          { label: 'قيمة القابل للفوترة', value: round2(amount), tone: 'success' },
          { label: 'غير مفوتر بعد', value: round2(unbilled), tone: unbilled ? 'warning' : 'neutral' },
          { label: 'قيود الفترة', value: rows.reduce((s, r) => s + num(r.entries), 0), tone: 'neutral' },
        ],
        columns: [
          { key: 'customer', label: 'العميل' },
          { key: 'entries', label: 'القيود', type: 'number' },
          { key: 'hours', label: 'الساعات', type: 'qty' },
          { key: 'billableAmount', label: 'قابل للفوترة', type: 'currency' },
          { key: 'unbilledAmount', label: 'غير مفوتر', type: 'currency' },
          { key: 'invoiced', label: 'مفوتر', type: 'number' },
          { key: 'rejected', label: 'مرفوض', type: 'number' },
        ],
        rows,
      };
    }
  };
}
