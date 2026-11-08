import { v4 as uuidv4 } from 'uuid';
import { postLedgerEntry } from '../../../database/ledger';
import { BusinessRecordSyncService } from '../../../sync/BusinessRecordSyncService';
import { defaultEffectRegistry } from '../EffectRegistry';
import type { EffectContext } from '../EffectTypes';

// Side-effect registration: importing this module wires the handlers onto the
// default registry. Services emit effects; the engine dispatches them.

defaultEffectRegistry.register('ledger.post', (ctx: EffectContext, effect) => {
  const data = effect.payload.data as any;
  postLedgerEntry(ctx.db.getDatabase(), {
    date: data.date,
    description: data.description,
    referenceType: data.referenceType,
    referenceId: data.referenceId,
    createdBy: data.createdBy,
    lines: data.lines,
  });
});

defaultEffectRegistry.register('audit.log', (ctx: EffectContext, effect) => {
  const data = effect.payload.data as any;
  const action = data.action || 'إنشاء فاتورة مبيعات';
  const module = data.module || 'SALES';
  const oldValues = data.oldValues != null ? JSON.stringify(data.oldValues) : null;
  const newValues = data.newValues != null ? JSON.stringify(data.newValues) : null;
  const recordId = data.recordId || effect.payload.aggregateId;
  ctx.db.run(
    `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [`aud_${uuidv4().substring(0, 8)}`, ctx.actorId, ctx.actorName, action, module, recordId, oldValues, newValues]
  );
});

defaultEffectRegistry.register('sync.capture', (ctx: EffectContext, effect) => {
  const data = effect.payload.data as any;
  const operation = data?.operation === 'UPDATE' ? 'UPDATE' : 'CREATE';
  new BusinessRecordSyncService(ctx.db).capture(ctx.db, 'sales_invoice', effect.payload.aggregateId, operation);
});
