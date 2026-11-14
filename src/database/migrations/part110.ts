import type { Migration } from './support';
import { addColumn, columnExists, tableExists } from './support';

export const MIGRATION_PART_110: Migration = {
  id: '160_platform_support_enhancements',
  description: 'Add support ticket SLA, internal notes, canned replies, and remote session logs.',
  up: (db) => {
    // 1. Add columns to platform_support_tickets
    if (tableExists(db, 'platform_support_tickets')) {
      if (!columnExists(db, 'platform_support_tickets', 'sla_due_at')) {
        addColumn(db, 'platform_support_tickets', 'sla_due_at', 'TEXT');
      }
      if (!columnExists(db, 'platform_support_tickets', 'first_responded_at')) {
        addColumn(db, 'platform_support_tickets', 'first_responded_at', 'TEXT');
      }
      if (!columnExists(db, 'platform_support_tickets', 'rating')) {
        addColumn(db, 'platform_support_tickets', 'rating', 'INTEGER CHECK(rating >= 1 AND rating <= 5)');
      }
      if (!columnExists(db, 'platform_support_tickets', 'feedback')) {
        addColumn(db, 'platform_support_tickets', 'feedback', 'TEXT');
      }
      if (!columnExists(db, 'platform_support_tickets', 'remote_access_duration_minutes')) {
        addColumn(db, 'platform_support_tickets', 'remote_access_duration_minutes', 'INTEGER DEFAULT 60');
      }
      if (!columnExists(db, 'platform_support_tickets', 'remote_access_expires_at')) {
        addColumn(db, 'platform_support_tickets', 'remote_access_expires_at', 'TEXT');
      }
    }

    // 2. Add columns to platform_support_messages
    if (tableExists(db, 'platform_support_messages')) {
      if (!columnExists(db, 'platform_support_messages', 'is_internal')) {
        addColumn(db, 'platform_support_messages', 'is_internal', 'INTEGER NOT NULL DEFAULT 0 CHECK(is_internal IN (0,1))');
      }
      if (!columnExists(db, 'platform_support_messages', 'attachment_name')) {
        addColumn(db, 'platform_support_messages', 'attachment_name', 'TEXT');
      }
      if (!columnExists(db, 'platform_support_messages', 'attachment_size')) {
        addColumn(db, 'platform_support_messages', 'attachment_size', 'TEXT');
      }
    }

    // 3. Create Canned Replies Table
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_support_canned_replies (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'GENERAL',
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed useful canned replies if empty
    const countReplies = Number(db.exec('SELECT COUNT(*) FROM platform_support_canned_replies')[0]?.values[0]?.[0] || 0);
    if (countReplies === 0) {
      db.run(`
        INSERT INTO platform_support_canned_replies (id, title, category, body)
        VALUES 
          ('cr_01', 'طلب تفاصيل إضافية عن المشكلة', 'DIAGNOSIS', 'أهلاً بك، نرجو تزويدنا بلقطة شاشة للخطأ الظاهر، مع ذكر رقم الفاتورة أو شاشة العملية التي واجهت فيها هذا العطل لمساعدتك بشكل أسرع.'),
          ('cr_02', 'تعليمات إعادة مزامنة الفروع', 'SYNC', 'يرجى التوجه إلى قائمة الإعدادات -> مركز المزامنة، ثم الضغط على "إعادة محاولة المزامنة الآن". إذا استمر التوقف يرجى إفادتنا برسالة الخطأ.'),
          ('cr_03', 'طلب جلسة وصول عن بعد', 'REMOTE', 'لإصلاح هذا الخلل بأسرع وقت، نرجو الموافقة على طلب الدعم والوصول عن بعد الظاهر في شاشتك لمدة ساعة لمساعدتك مباشرة.'),
          ('cr_04', 'تأكيد حل المشكلة والإغلاق', 'RESOLUTION', 'تم التحقق من المشكلة ومعالجتها بنجاح على الخادم. نرجو اختبار العملية وتأكيد الاستقرار لنتمكن من إغلاق التذكرة. نسعد دائماً بخدمتكم.')
      `);
    }

    // 4. Create Remote Access Sessions Log Table
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_remote_sessions (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        technician_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        actions_summary TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'TERMINATED')),
        FOREIGN KEY (ticket_id) REFERENCES platform_support_tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_remote_sessions_ticket ON platform_remote_sessions(ticket_id)`);
  },
};
