import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../domains/auth/AuthService';
import { PermissionService } from '../../domains/auth/PermissionService';
import { parseSpreadsheetBuffer } from './SpreadsheetImportService';
import type { ParsedSpreadsheetSheet } from './SpreadsheetImportService';

export type DynamicFieldType = 'text' | 'number' | 'boolean' | 'date' | 'json';
export interface DynamicField { key: string; label: string; type: DynamicFieldType; required: boolean; originalHeader?: string; relationCandidate?: string }
export interface DynamicEntity { id: string; name: string; nameKey: string; description: string; fields: DynamicField[]; relations: Array<Record<string, unknown>>; createdAt: string; updatedAt: string; recordCount?: number }
export interface DynamicRecord { id: string; entityTypeId: string; values: Record<string, unknown>; searchText: string; sourceBatchId?: string; createdAt: string; updatedAt: string }
export interface DynamicImportResult { entity: DynamicEntity; entities?: DynamicEntity[]; batchId: string; imported: number; skipped: number; errors: Array<{ row: number; message: string }> }

const clean = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_-]+/g, ' ');
const fieldKey = (s: string) => clean(s).replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'field';
const id = (prefix: string) => `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
const contentHash = (buffer: ArrayBuffer): string => { const bytes=new Uint8Array(buffer);let h=2166136261;for(const b of bytes){h^=b;h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0'); };
const asJSON = <T,>(v: unknown, fallback: T): T => { try { return JSON.parse(String(v ?? '')) as T; } catch { return fallback; } };
const normalizedNumber = (value: string) => value
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
  .replace(/[٬,]/g, '')
  .replace(/[٫]/g, '.');
const fieldType = (values: unknown[]): DynamicFieldType => {
  const rawValues = values.filter(v => v !== null && v !== undefined && String(v).trim());
  const present = rawValues.map(v => String(v).trim());
  if (!present.length) return 'text';
  if (present.every(v => /^(true|false|yes|no|نعم|لا)$/i.test(v))) return 'boolean';
  if (present.every(v => /^-?\d+(?:\.\d+)?$/.test(normalizedNumber(v)))) return 'number';
  const datePattern = /^(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})$/;
  if (rawValues.every(value => value instanceof Date
    ? !Number.isNaN(value.getTime())
    : typeof value === 'string' && datePattern.test(value.trim()) && !Number.isNaN(Date.parse(value)))) return 'date';
  if (present.every(v => /^[{[]/.test(v) && (() => { try { JSON.parse(v); return true; } catch { return false; } })())) return 'json';
  return 'text';
};
const normalizedValue = (value: unknown, type: DynamicFieldType) => {
  if (value === null || value === undefined || value === '') return value ?? '';
  const raw = String(value).trim();
  if (type === 'number') { const n = Number(normalizedNumber(raw)); return Number.isFinite(n) ? n : value; }
  if (type === 'boolean') { if (/^(true|yes|نعم|1)$/i.test(raw)) return true; if (/^(false|no|لا|0)$/i.test(raw)) return false; }
  if (type === 'json') { try { return JSON.parse(raw); } catch { return value; } }
  return value;
};

export class DynamicDataService {
  private db = DatabaseManager.getInstance();
  private actor() { return AuthService.requireAuth(); }
  private requireView() {
    const actor = this.actor();
    if (!PermissionService.can(actor, 'admin.data')
      && !PermissionService.can(actor, 'settings.dynamic_data.view')
      && !PermissionService.can(actor, 'settings.dynamic_data.manage')) {
      PermissionService.require(actor, 'settings.dynamic_data.view');
    }
    return actor;
  }
  private requireManage() {
    const actor = this.actor();
    if (!PermissionService.can(actor, 'admin.data') && !PermissionService.can(actor, 'settings.dynamic_data.manage')) {
      PermissionService.require(actor, 'settings.dynamic_data.manage');
    }
    return actor;
  }

  listEntities(search = ''): DynamicEntity[] {
    this.requireView();
    const rows = this.db.query<any>(`SELECT e.*, (SELECT COUNT(*) FROM dynamic_records r WHERE r.entity_type_id=e.id) AS record_count FROM dynamic_entity_types e WHERE (? = '' OR e.name LIKE ? OR e.description LIKE ?) ORDER BY e.name COLLATE NOCASE`, [search.trim(), `%${search.trim()}%`, `%${search.trim()}%`]);
    return rows.map(r => ({ id:r.id,name:r.name,nameKey:r.nameKey,description:r.description||'',fields:asJSON(r.fieldsJson,[]),relations:asJSON(r.relationsJson,[]),createdAt:r.createdAt,updatedAt:r.updatedAt,recordCount:r.recordCount }));
  }

  private mergeImportedFields(fields: DynamicField[], headers: string[], rows: Record<string, unknown>[]): void {
    for (const header of headers) {
      const existing = fields.find(f => clean(f.originalHeader || f.label) === clean(header) || clean(f.label) === clean(header));
      const samples = rows.slice(0, 50).map(r => r[header]);
      const inferred = fieldType(samples);
      const relationCandidate = /(?:_id| id| code| reference| ref)$/i.test(header.trim()) ? header.replace(/(?:_id| id| code| reference| ref)$/i, '').trim() : undefined;
      if (existing) {
        // Preserve the original type if a later file has sparse or mixed values; add newly observed headers only.
        if (existing.type === 'text' && inferred !== 'text') existing.type = inferred;
      } else { const base=fieldKey(header);let key=base;let suffix=2;while(fields.some(f=>f.key===key))key=`${base}_${suffix++}`;fields.push({ key, label: header.trim(), type: inferred, required: false, originalHeader: header, relationCandidate }); }
    }
  }

  private saveEntity(name: string, headers: string[], rows: Record<string, unknown>[], actorId: string): DynamicEntity {
    const displayName = name.trim() || 'بيانات مستوردة'; const nameKey = clean(displayName);
    const found = this.db.query<any>('SELECT * FROM dynamic_entity_types WHERE name_key=?',[nameKey])[0];
    const oldFields: DynamicField[] = found ? asJSON(found.fieldsJson,[]) : [];
    const fields: DynamicField[] = [...oldFields];
    this.mergeImportedFields(fields, headers, rows);
    const relations = found ? asJSON<Array<Record<string, unknown>>>(found.relationsJson,[]) : [];
    if (found) this.db.run('UPDATE dynamic_entity_types SET fields_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify(fields),found.id]);
    else this.db.run('INSERT INTO dynamic_entity_types (id,name,name_key,description,fields_json,relations_json,created_by) VALUES (?,?,?,?,?,?,?)',[id('det'),displayName,nameKey,'',JSON.stringify(fields),JSON.stringify(relations),actorId]);
    return this.getEntityByKey(nameKey)!;
  }

  getEntityByKey(nameKey: string): DynamicEntity | null {
    this.requireView();
    const r=this.db.query<any>('SELECT e.*, (SELECT COUNT(*) FROM dynamic_records x WHERE x.entity_type_id=e.id) AS record_count FROM dynamic_entity_types e WHERE name_key=?',[nameKey])[0];
    return r?{id:r.id,name:r.name,nameKey:r.nameKey,description:r.description||'',fields:asJSON(r.fieldsJson,[]),relations:asJSON(r.relationsJson,[]),createdAt:r.createdAt,updatedAt:r.updatedAt,recordCount:r.recordCount}:null;
  }

  importWorkbook(buffer: ArrayBuffer, fileName: string, requestedType?: string): DynamicImportResult {
    const parsed = parseSpreadsheetBuffer(buffer, fileName);
    return this.importSheets(buffer, fileName, parsed.sheets, requestedType);
  }

  importSheets(buffer: ArrayBuffer, fileName: string, sheets: ParsedSpreadsheetSheet[], requestedType?: string): DynamicImportResult {
    const actor=this.requireManage();
    const allRows = sheets.map(sheet => ({ sheet: sheet.name, headers: sheet.headers, rows: sheet.rows }));
    if(!allRows.length) throw new Error('الملف لا يحتوي على صفوف بيانات.');
    if(allRows.length>1){
      const outcomes=allRows.map(tab=>this.importSheets(buffer,fileName,[{name:tab.sheet,headers:tab.headers,rows:tab.rows}],undefined));
      return {...outcomes[0],entities:outcomes.map(x=>x.entity),imported:outcomes.reduce((n,x)=>n+x.imported,0),skipped:outcomes.reduce((n,x)=>n+x.skipped,0),errors:outcomes.flatMap(x=>x.errors)};
    }
    const parsed=allRows[0]; const typeName=(requestedType||parsed.sheet||fileName.replace(/\.[^.]+$/,'')).trim();
    if(!typeName) throw new Error('اكتب اسمًا لهذا النوع الجديد من البيانات.');
    const sourceHash=contentHash(buffer);const existingType=this.db.query<any>('SELECT id FROM dynamic_entity_types WHERE name_key=?',[clean(typeName)])[0];
    if(existingType&&this.db.query('SELECT id FROM dynamic_import_batches WHERE entity_type_id=? AND source_hash=? AND status<>\'ROLLED_BACK\'',[existingType.id,sourceHash]).length)throw new Error('تم استيراد هذا الملف إلى هذا النوع من قبل. غيّر الملف أو تراجع عن الدفعة السابقة لإعادة استيراده.');
    const entity=this.saveEntity(typeName,parsed.headers,parsed.rows,actor.id);
    const batchId=id('dib'); const errors:Array<{row:number;message:string}>=[]; let imported=0;
    this.db.executeTransaction(()=>{
      this.db.run('INSERT INTO dynamic_import_batches (id,entity_type_id,source_name,source_hash,status,imported_count,raw_rows_json,created_by) VALUES (?,?,?,?,?,?,?,?)',[batchId,entity.id,fileName,sourceHash, 'COMPLETED',0,JSON.stringify({sheet:parsed.sheet,headers:parsed.headers,rows:parsed.rows}),actor.id]);
      parsed.rows.forEach((raw,index)=>{
        try {
          const values:Record<string,unknown>={};
          for(const header of parsed.headers){const field=entity.fields.find(f=>clean(f.originalHeader||f.label)===clean(header)||clean(f.label)===clean(header));if(field)values[field.key]=raw[header];}
          const validatedValues = this.validateRecordValues(entity.id, entity.fields, entity.relations, values);
          // Retain every source value even when a header collides or its inferred type is uncertain.
          validatedValues.__source = raw;
          const searchText=Object.values(validatedValues).map(v=>typeof v==='object'?JSON.stringify(v):String(v??'')).join(' ').toLocaleLowerCase();
          this.db.run('INSERT INTO dynamic_records (id,entity_type_id,values_json,search_text,source_batch_id,created_by) VALUES (?,?,?,?,?,?)',[id('drec'),entity.id,JSON.stringify(validatedValues),searchText,batchId,actor.id]); imported++;
        } catch(e:any){errors.push({row:index+2,message:e?.message||'تعذر حفظ الصف'});}
      });
      this.db.run('UPDATE dynamic_import_batches SET imported_count=?,status=? WHERE id=?',[imported,errors.length?'PARTIAL':'COMPLETED',batchId]);
      this.audit(actor.id,'استيراد بيانات ديناميكية',entity.id,{batchId,source:fileName,imported,errors:errors.length});
    });
    return {entity,batchId,imported,skipped:errors.length,errors};
  }

  listRecords(entityId: string, search = '', page = 1, pageSize = 50): { rows: DynamicRecord[]; total: number } {
    this.requireView(); const safeSize=Math.max(1,Math.min(200,pageSize)); const offset=(Math.max(1,page)-1)*safeSize; const term=`%${search.trim().toLocaleLowerCase()}%`;
    const rawSearch=search.trim().toLocaleLowerCase();
    const rows=this.db.query<any>("SELECT * FROM dynamic_records WHERE entity_type_id=? AND (? = '' OR search_text LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?",[entityId,rawSearch,term,safeSize,offset]);
    const total=this.db.query<any>("SELECT COUNT(*) AS count FROM dynamic_records WHERE entity_type_id=? AND (? = '' OR search_text LIKE ?)",[entityId,rawSearch,term])[0]?.count||0;
    return {rows:rows.map(r=>({id:r.id,entityTypeId:r.entityTypeId,values:asJSON(r.valuesJson,{}),searchText:r.searchText,sourceBatchId:r.sourceBatchId,createdAt:r.createdAt,updatedAt:r.updatedAt})),total};
  }

  updateRecord(recordId: string, values: Record<string, unknown>): void {
    const actor=this.requireManage(); const existing=this.db.query<any>('SELECT * FROM dynamic_records WHERE id=?',[recordId])[0]; if(!existing)throw new Error('السجل غير موجود.');
    const entity=this.db.query<any>('SELECT * FROM dynamic_entity_types WHERE id=?',[existing.entityTypeId])[0]; if(!entity)throw new Error('نوع البيانات غير موجود.');
    const fields=asJSON<DynamicField[]>(entity.fieldsJson,[]); const relations=asJSON<Array<Record<string,unknown>>>(entity.relationsJson,[]);
    const merged={...asJSON<Record<string,unknown>>(existing.valuesJson,{}),...values};
    const validated=this.validateRecordValues(entity.id,fields,relations,merged);
    const text=Object.entries(validated).filter(([k])=>k!=='__source').map(([,v])=>typeof v==='object'?JSON.stringify(v):String(v??'')).join(' ').toLocaleLowerCase();
    this.db.executeTransaction(()=>{this.db.run('UPDATE dynamic_records SET values_json=?,search_text=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify(validated),text,recordId]);this.audit(actor.id,'تعديل سجل ديناميكي',recordId,validated);});
  }

  createRecord(entityId: string, values: Record<string, unknown>): DynamicRecord {
    const actor=this.requireManage(); const entity=this.db.query<any>('SELECT * FROM dynamic_entity_types WHERE id=?',[entityId])[0];if(!entity)throw new Error('نوع البيانات غير موجود.');
    const fields=asJSON<DynamicField[]>(entity.fieldsJson,[]);const relations=asJSON<Array<Record<string,unknown>>>(entity.relationsJson,[]);
    const validated=this.validateRecordValues(entityId,fields,relations,values);
    const searchText=Object.entries(validated).map(([,v])=>typeof v==='object'?JSON.stringify(v):String(v??'')).join(' ').toLocaleLowerCase();const recordId=id('drec');
    this.db.executeTransaction(()=>{this.db.run('INSERT INTO dynamic_records (id,entity_type_id,values_json,search_text,created_by) VALUES (?,?,?,?,?)',[recordId,entityId,JSON.stringify(validated),searchText,actor.id]);this.audit(actor.id,'إضافة سجل ديناميكي',recordId,{entity:entity.name,values:validated});});
    return this.db.query<any>('SELECT * FROM dynamic_records WHERE id=?',[recordId]).map(r=>({id:r.id,entityTypeId:r.entityTypeId,values:asJSON(r.valuesJson,{}),searchText:r.searchText,sourceBatchId:r.sourceBatchId,createdAt:r.createdAt,updatedAt:r.updatedAt}))[0];
  }

  deleteRecord(recordId: string): void { const actor=this.requireManage(); this.db.executeTransaction(()=>{this.db.run('DELETE FROM dynamic_records WHERE id=?',[recordId]);this.audit(actor.id,'حذف سجل ديناميكي',recordId,{});}); }

  addField(entityId: string, field: Omit<DynamicField,'key'> & {key?:string}): DynamicEntity {
    const actor=this.requireManage(); const row=this.db.query<any>('SELECT * FROM dynamic_entity_types WHERE id=?',[entityId])[0];if(!row)throw new Error('نوع البيانات غير موجود.');
    if(!field.label.trim()||!['text','number','boolean','date','json'].includes(field.type)||typeof field.required!=='boolean')throw new Error('تعريف الحقل غير صالح.');
    const fields=asJSON<DynamicField[]>(row.fieldsJson,[]); const key=field.key||fieldKey(field.label);if(fields.some(f=>f.key===key))throw new Error('هذا الحقل موجود بالفعل.');
    fields.push({ ...field,key }); this.db.executeTransaction(()=>{this.db.run('UPDATE dynamic_entity_types SET fields_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify(fields),entityId]);this.audit(actor.id,'إضافة حقل لنوع ديناميكي',entityId,field);});return this.getEntityByKey(row.nameKey)!;
  }

  updateEntityRelations(entityId: string, relations: Array<Record<string, unknown>>): void {
    const actor=this.requireManage();
    const row=this.db.query<any>('SELECT fields_json FROM dynamic_entity_types WHERE id=?',[entityId])[0];
    if(!row)throw new Error('نوع البيانات غير موجود.');
    const sourceFields=asJSON<DynamicField[]>(row.fieldsJson,[]);
    const validated=relations.map(relation=>{
      const name=String(relation.name||'').trim();
      const sourceField=String(relation.sourceField||'');
      const targetEntityId=String(relation.targetEntityId||'');
      const targetField=String(relation.targetField||'id');
      const target=this.db.query<any>('SELECT fields_json FROM dynamic_entity_types WHERE id=?',[targetEntityId])[0];
      if(!name||!sourceFields.some(field=>field.key===sourceField)||!target)throw new Error('تعريف العلاقة يشير إلى حقل أو نوع غير موجود.');
      const targetFields=asJSON<DynamicField[]>(target.fieldsJson,[]);
      if(targetField!=='id'&&!targetFields.some(field=>field.key===targetField))throw new Error('حقل الهدف في العلاقة غير موجود.');
      return {name,sourceField,targetEntityId,targetField};
    });
    this.db.executeTransaction(()=>{this.db.run('UPDATE dynamic_entity_types SET relations_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify(validated),entityId]);this.audit(actor.id,'تحديث علاقات نوع ديناميكي',entityId,validated);});
  }

  getBatches(entityId: string): Array<{id:string;sourceName:string;status:string;importedCount:number;createdAt:string}> {this.requireView();return this.db.query<any>('SELECT id,source_name,status,imported_count,created_at FROM dynamic_import_batches WHERE entity_type_id=? ORDER BY created_at DESC',[entityId]);}

  rollbackBatch(batchId: string): number {const actor=this.requireManage();const batch=this.db.query<any>('SELECT * FROM dynamic_import_batches WHERE id=?',[batchId])[0];if(!batch)throw new Error('دفعة الاستيراد غير موجودة.');if(batch.status==='ROLLED_BACK')return 0;let removed=0;this.db.executeTransaction(()=>{removed=this.db.query<any>('SELECT COUNT(*) AS count FROM dynamic_records WHERE source_batch_id=?',[batchId])[0]?.count||0;this.db.run('DELETE FROM dynamic_records WHERE source_batch_id=?',[batchId]);this.db.run("UPDATE dynamic_import_batches SET status='ROLLED_BACK',imported_count=0 WHERE id=?",[batchId]);this.audit(actor.id,'تراجع عن استيراد بيانات ديناميكية',batchId,{removed});});return removed;}

  deleteEntity(entityId: string): void {const actor=this.requireManage();const row=this.db.query<any>('SELECT name FROM dynamic_entity_types WHERE id=?',[entityId])[0];if(!row)throw new Error('نوع البيانات غير موجود.');this.db.executeTransaction(()=>{this.db.run('DELETE FROM dynamic_entity_types WHERE id=?',[entityId]);this.audit(actor.id,'حذف نوع بيانات ديناميكي',entityId,{name:row.name});});}

  private validateRecordValues(
    entityId: string,
    fields: DynamicField[],
    relations: Array<Record<string, unknown>>,
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const normalized = { ...values };
    for (const field of fields) {
      const value = values[field.key];
      const isEmpty = value === undefined || value === null || value === '';
      if (field.required && isEmpty) throw new Error(`الحقل «${field.label}» مطلوب.`);
      if (isEmpty) continue;

      switch (field.type) {
        case 'text':
          normalized[field.key] = String(value);
          break;
        case 'number': {
          const raw = normalizedNumber(String(value).trim());
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) throw new Error(`الحقل «${field.label}» يجب أن يكون رقمًا صالحًا.`);
          normalized[field.key] = parsed;
          break;
        }
        case 'boolean': {
          const parsed = normalizedValue(value, 'boolean');
          if (typeof parsed !== 'boolean') throw new Error(`الحقل «${field.label}» يجب أن يكون نعم أو لا.`);
          normalized[field.key] = parsed;
          break;
        }
        case 'date': {
          const parsed = value instanceof Date ? value : new Date(String(value));
          if (Number.isNaN(parsed.getTime())) throw new Error(`الحقل «${field.label}» يجب أن يكون تاريخًا صالحًا.`);
          normalized[field.key] = parsed.toISOString().slice(0, 10);
          break;
        }
        case 'json': {
          if (typeof value !== 'string') break;
          try { normalized[field.key] = JSON.parse(value); }
          catch { throw new Error(`الحقل «${field.label}» يجب أن يحتوي على JSON صالح.`); }
          break;
        }
      }
    }

    for (const relation of relations) {
      const sourceField = String(relation.sourceField || '');
      const value = normalized[sourceField];
      if (value === undefined || value === null || value === '') continue;
      const targetEntityId = String(relation.targetEntityId || '');
      const targetField = String(relation.targetField || 'id');
      const targets = this.db.query<any>('SELECT id, values_json FROM dynamic_records WHERE entity_type_id=?', [targetEntityId]);
      const matches = targets.some(target => targetField === 'id'
        ? String(target.id) === String(value)
        : String(asJSON<Record<string, unknown>>(target.valuesJson, {})[targetField] ?? '') === String(value));
      if (!matches) {
        const field = fields.find(candidate => candidate.key === sourceField);
        throw new Error(`قيمة الحقل «${field?.label || sourceField}» لا تطابق سجلًا في العلاقة المعرفة.`);
      }
    }

    return normalized;
  }

  private audit(userId:string,action:string,recordId:string,details:unknown):void {this.db.run('INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',[id('aud'),userId,this.actor().fullName,action,'DYNAMIC_DATA',recordId,JSON.stringify(details)]);}
}
