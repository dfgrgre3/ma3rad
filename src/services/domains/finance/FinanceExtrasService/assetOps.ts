import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import { unscaleMoneyRow } from '../../../../utils/money';
import { ExtrasDepreciationBase } from './depreciation';
import { FA_MONEY_FIELDS, round2, validDate } from './types';
import type {
  FixedAsset,
  FixedAssetAttachment,
  FixedAssetMaintenance,
  FixedAssetTimelineEvent,
  FixedAssetTransfer,
} from './types';

export abstract class ExtrasAssetOpsBase extends ExtrasDepreciationBase {
  getFixedAssetTransfers(assetId: string): FixedAssetTransfer[] {
    const actor = this.requireView();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetTransfer>(
      `SELECT t.*, u.full_name AS actor_name
       FROM fixed_asset_transfers t JOIN users u ON u.id = t.actor_id
       WHERE t.asset_id = ? ORDER BY t.transfer_date DESC, t.created_at DESC`,
      [assetId]
    );
  }

  getFixedAssetTimeline(assetId: string): FixedAssetTimelineEvent[] {
    const actor = this.requireView();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetTimelineEvent>(
      `SELECT event_date AS eventDate, event_type AS eventType, label, amount,
              actor_name AS actorName, reference_id AS referenceId, details
       FROM (
         SELECT e.date AS event_date, 'ACQUISITION' AS event_type, 'اقتناء الأصل' AS label,
                e.total_debit / 100.0 AS amount, u.full_name AS actor_name, e.id AS reference_id,
                e.description AS details, e.created_at AS sort_time
         FROM journal_entries e
         LEFT JOIN users u ON u.id = e.created_by
         WHERE e.reference_type = 'ASSET_ACQUISITION' AND e.reference_id = ?
         UNION ALL
         SELECT t.transfer_date, 'TRANSFER', 'نقل الأصل', NULL, u.full_name, t.id,
                COALESCE(t.notes, '') ||
                  CASE WHEN t.from_location IS NOT t.to_location
                    THEN ' | الموقع: ' || COALESCE(t.from_location, '—') || ' ← ' || COALESCE(t.to_location, '—')
                    ELSE '' END ||
                  ' | الفرع: ' || COALESCE(t.from_branch_id, '—') || ' ← ' || COALESCE(t.to_branch_id, '—'),
                t.created_at
         FROM fixed_asset_transfers t
         JOIN users u ON u.id = t.actor_id
         WHERE t.asset_id = ?
         UNION ALL
         SELECT m.maintenance_date, 'MAINTENANCE',
                CASE m.cost_treatment WHEN 'CAPITALIZED' THEN 'تحسين رأسمالي' ELSE 'صيانة تشغيلية' END,
                m.cost / 100.0, u.full_name, COALESCE(m.journal_entry_id, m.id),
                m.maintenance_type || ' — ' || m.description ||
                  CASE WHEN m.vendor IS NOT NULL AND TRIM(m.vendor) <> '' THEN ' | المورد: ' || m.vendor ELSE '' END,
                m.created_at
         FROM fixed_asset_maintenance m
         JOIN users u ON u.id = m.actor_id
         WHERE m.asset_id = ?
         UNION ALL
         SELECT d.posting_date, 'DEPRECIATION', 'إهلاك مرحّل', d.amount / 100.0, u.full_name,
                d.journal_entry_id, 'الفترة ' || d.period || ' — الحالة: ' || d.status, d.created_at
         FROM fixed_asset_depreciation_periods d
         JOIN users u ON u.id = d.posted_by
         WHERE d.asset_id = ?
         UNION ALL
         SELECT d.disposal_date, 'DISPOSAL', 'استبعاد معتمد', d.sale_proceeds / 100.0, u.full_name,
                d.journal_entry_id,
                d.reason || ' | القيمة الدفترية: ' || (d.book_value / 100.0) ||
                  ' | مصروفات: ' || (d.expenses / 100.0) || ' | ربح/خسارة: ' || (d.gain_loss / 100.0),
                d.created_at
         FROM fixed_asset_disposals d
         JOIN users u ON u.id = d.approved_by
         WHERE d.asset_id = ?
       )
       ORDER BY event_date DESC, sort_time DESC, reference_id DESC`,
      [assetId, assetId, assetId, assetId, assetId]
    );
  }

  transferFixedAsset(input: {
    assetId: string; transferDate: string; branchId: string; departmentId?: string; location?: string;
    responsibleUserId?: string; notes?: string;
  }): void {
    const actor = this.requireManage();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [input.assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status === 'DISPOSED') throw new Error('لا يمكن نقل أصل مستبعد.');
    if (!validDate(input.transferDate) || input.transferDate < asset.purchaseDate) throw new Error('تاريخ النقل غير صحيح.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (!input.branchId || !this.db.query('SELECT id FROM branches WHERE id = ? AND is_active = 1', [input.branchId]).length ||
        (allowed !== null && !allowed.includes(input.branchId))) throw new Error('الفرع الوجهة غير متاح أو خارج نطاق صلاحيتك.');
    const lastTransfer = this.db.query<{ transferDate: string }>(
      'SELECT transfer_date AS transferDate FROM fixed_asset_transfers WHERE asset_id = ? ORDER BY transfer_date DESC, created_at DESC LIMIT 1',
      [asset.id]
    )[0];
    if (lastTransfer && input.transferDate < lastTransfer.transferDate) throw new Error('تاريخ النقل لا يمكن أن يسبق آخر حركة مسجلة.');
    if (asset.branchId === input.branchId && (asset.departmentId || null) === (input.departmentId || null) &&
        (asset.location || null) === (input.location?.trim() || null) &&
        (asset.responsibleUserId || null) === (input.responsibleUserId || null)) {
      throw new Error('بيانات النقل مطابقة للموقع الحالي للأصل.');
    }
    if (input.departmentId) {
      const department = this.db.query<{ branchId: string | null }>('SELECT branch_id AS branchId FROM departments WHERE id = ?', [input.departmentId])[0];
      if (!department || (department.branchId && department.branchId !== input.branchId)) throw new Error('القسم غير موجود في الفرع الوجهة.');
    }
    if (input.responsibleUserId && !this.db.query(
      `SELECT u.id FROM users u
       WHERE u.id = ? AND u.is_active = 1 AND
         (u.role = 'ADMIN' OR u.branch_scope = 'ALL' OR EXISTS (
           SELECT 1 FROM users_branches ub WHERE ub.user_id = u.id AND ub.branch_id = ?
         ))`,
      [input.responsibleUserId, input.branchId]
    ).length) {
      throw new Error('المستخدم المسؤول غير موجود أو غير نشط.');
    }
    const id = `fat_${uuidv4().substring(0, 8)}`;
    this.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_transfers
         (id, asset_id, transfer_date, from_branch_id, to_branch_id, from_department_id, to_department_id,
          from_location, to_location, from_responsible_user_id, to_responsible_user_id, notes, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, asset.id, input.transferDate, asset.branchId || null, input.branchId, asset.departmentId || null,
          input.departmentId || null, asset.location || null, input.location?.trim() || null,
          asset.responsibleUserId || null, input.responsibleUserId || null, input.notes?.trim() || null, actor.id]
      );
      db.run(
        `UPDATE fixed_assets SET branch_id = ?, department_id = ?, location = ?, responsible_user_id = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [input.branchId, input.departmentId || null, input.location?.trim() || null, input.responsibleUserId || null, asset.id]
      );
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Transfer fixed asset', 'FINANCE', asset.id, JSON.stringify(input)]
      );
    });
  }

  getFixedAssetMaintenance(assetId: string): FixedAssetMaintenance[] {
    const actor = this.requireView();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetMaintenance>(
      `SELECT m.*, u.full_name AS actor_name
       FROM fixed_asset_maintenance m JOIN users u ON u.id = m.actor_id
       WHERE m.asset_id = ? ORDER BY m.maintenance_date DESC, m.created_at DESC`,
      [assetId]
    ).map((row) => unscaleMoneyRow(row, ['cost']));
  }

  recordFixedAssetMaintenance(input: {
    assetId: string; date: string; type: string; description: string; cost: number;
    treatment: 'OPERATIONAL' | 'CAPITALIZED'; vendor?: string; nextDate?: string;
  }): string {
    const actor = this.requireManage();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [input.assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status === 'DISPOSED') throw new Error('لا يمكن تسجيل صيانة لأصل مستبعد.');
    if (!validDate(input.date) || input.date < asset.purchaseDate || input.date > localDateString()) throw new Error('تاريخ الصيانة غير صحيح.');
    this.assertPostingDate(input.date);
    if (input.nextDate && (!validDate(input.nextDate) || input.nextDate < input.date)) throw new Error('تاريخ الصيانة التالية غير صحيح.');
    if (!input.type.trim() || !input.description.trim()) throw new Error('نوع الصيانة والوصف مطلوبان.');
    if (!Number.isFinite(input.cost) || input.cost <= 0) throw new Error('تكلفة الصيانة يجب أن تكون أكبر من صفر.');
    if (!['OPERATIONAL', 'CAPITALIZED'].includes(input.treatment)) throw new Error('معالجة التكلفة غير صحيحة.');
    if (input.treatment === 'CAPITALIZED' && input.cost <= 0) throw new Error('قيمة التحسين الرأسمالي يجب أن تكون أكبر من صفر.');
    const id = `fam_${uuidv4().substring(0, 8)}`;
    this.db.executeFinancialTransaction((db) => {
      let journalEntryId: string | null = null;
      if (input.treatment === 'OPERATIONAL') {
        journalEntryId = postLedgerEntry(db.getDatabase(), {
          date: input.date,
          description: `صيانة تشغيلية للأصل ${asset.code}: ${input.description.trim()}`,
          referenceType: 'ASSET_OPERATIONAL_MAINTENANCE', referenceId: id,
          createdBy: actor.id, branchId: asset.branchId,
          lines: [
            { accountCode: '5201', debit: round2(input.cost), credit: 0 },
            { accountCode: '2201', debit: 0, credit: round2(input.cost) },
          ],
        });
      } else {
        journalEntryId = postLedgerEntry(db.getDatabase(), {
          date: input.date, description: `تحسين رأسمالي للأصل ${asset.code}: ${input.description.trim()}`,
          referenceType: 'ASSET_CAPITALIZED_MAINTENANCE', referenceId: id, createdBy: actor.id, branchId: asset.branchId,
          lines: [
            { accountCode: '1601', debit: round2(input.cost), credit: 0 },
            { accountCode: '2201', debit: 0, credit: round2(input.cost) },
          ],
        });
      }
      db.run(
        `INSERT INTO fixed_asset_maintenance
         (id, asset_id, maintenance_date, maintenance_type, description, cost, cost_treatment, vendor, next_maintenance_date, journal_entry_id, actor_id)
         VALUES (?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?)`,
        [id, asset.id, input.date, input.type.trim(), input.description.trim(), round2(input.cost), input.treatment,
          input.vendor?.trim() || null, input.nextDate || null, journalEntryId, actor.id]
      );
      if (input.treatment === 'CAPITALIZED') {
        db.run('UPDATE fixed_assets SET purchase_cost = purchase_cost + ROUND(?*100), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [round2(input.cost), asset.id]);
      }
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Record fixed asset maintenance', 'FINANCE',
          asset.id, JSON.stringify({ maintenanceId: id, date: input.date, treatment: input.treatment, cost: round2(input.cost), journalEntryId })]
      );
    });
    return id;
  }

  getFixedAssetAttachments(assetId: string): FixedAssetAttachment[] {
    const actor = this.requireView();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetAttachment>(
      `SELECT a.*, u.full_name AS uploaded_by_name
       FROM fixed_asset_attachments a JOIN users u ON u.id = a.uploaded_by
       WHERE a.asset_id = ? ORDER BY a.created_at DESC, a.id DESC`,
      [assetId]
    );
  }

  addFixedAssetAttachment(input: {
    assetId: string; documentType: FixedAssetAttachment['documentType']; fileName: string;
    mimeType?: string | null; fileSize: number; checksum?: string | null; storageName: string;
  }): FixedAssetAttachment {
    const actor = this.requireManage();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [input.assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    const documentTypes = ['INVOICE', 'WARRANTY', 'PURCHASE_CONTRACT', 'OWNERSHIP', 'OTHER'];
    const fileName = String(input.fileName || '').trim();
    const storageName = String(input.storageName || '').trim();
    if (!documentTypes.includes(input.documentType)) throw new Error('نوع مستند الأصل غير صحيح.');
    // eslint-disable-next-line no-control-regex
    if (!fileName || fileName.length > 255 || /[\u0000-\u001f]/.test(fileName)) throw new Error('اسم الملف غير صالح.');
    if (!/^doc_[a-f0-9]{32}\.[a-z0-9]{1,10}$/i.test(storageName)) throw new Error('مرجع التخزين المحلي غير صالح.');
    if (!Number.isInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > 25 * 1024 * 1024) {
      throw new Error('حجم الملف يتجاوز الحد المسموح أو غير صالح.');
    }
    if (input.checksum && !/^[a-f0-9]{64}$/i.test(input.checksum)) throw new Error('بصمة الملف غير صالحة.');
    const id = `faatt_${uuidv4().substring(0, 12)}`;
    this.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_attachments
         (id, asset_id, document_type, file_name, mime_type, file_size, checksum, storage_name, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.assetId, input.documentType, fileName, input.mimeType?.trim() || null,
          input.fileSize, input.checksum?.trim() || null, storageName, actor.id]
      );
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Attach fixed asset document', 'FINANCE',
          input.assetId, JSON.stringify({ attachmentId: id, documentType: input.documentType, fileName, fileSize: input.fileSize })]
      );
    });
    return this.getFixedAssetAttachments(input.assetId).find((row) => row.id === id)!;
  }
}
