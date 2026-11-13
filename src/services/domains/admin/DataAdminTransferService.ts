import type {
  DataImportConflictPolicy,
  DataImportPreview,
  DataImportResult,
  DataImportSheet,
  DataImportTablePreview,
} from '../../../types/admin/dataAdmin';
import { AuditService } from '../security/AuditService';
import { DataAdminBaseService } from './DataAdminBaseService';
import { IMPORT_PROTECTED_TABLES, IDENTIFIER } from './dataAdminConstants';

function queryColumnName(column: string): string {
  return column.replace(/_([a-z0-9])/g, (_match, character: string) => character.toUpperCase());
}

type PreparedSheet = {
  sheet: DataImportSheet;
  columns: Array<{ name: string; pk: number }>;
  primaryKeys: Array<{ name: string; pk: number }>;
};

export class DataAdminTransferService extends DataAdminBaseService {
  previewDataImport(
    sheets: DataImportSheet[],
    conflictPolicy: DataImportConflictPolicy = 'overwrite',
  ): DataImportPreview {
    this.require('admin.data.import');
    const prepared = this.validateImportSheets(sheets);
    const tables: DataImportTablePreview[] = prepared.map(({ sheet, columns, primaryKeys }) => {
      if (IMPORT_PROTECTED_TABLES.has(sheet.name)) {
        return {
          table: sheet.name,
          incomingRows: sheet.rows.length,
          existingRows: Number(
            this.db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM "${sheet.name}"`)[0]?.count ?? 0,
          ),
          newRows: 0,
          conflictRows: 0,
          skippedRows: sheet.rows.length,
          protected: true,
          sampleConflicts: [],
        };
      }

      const currentRows = this.db.query<Record<string, unknown>>(`SELECT * FROM "${sheet.name}"`);
      const existingByKey = new Map<string, Record<string, unknown>>();
      const existingRowsWithoutKey = new Set<string>();
      if (primaryKeys.length > 0) {
        for (const row of currentRows) {
          const key = JSON.stringify(primaryKeys.map((column) => row[queryColumnName(column.name)]));
          existingByKey.set(key, row);
        }
      } else {
        for (const row of currentRows) {
          existingRowsWithoutKey.add(
            JSON.stringify(columns.map((column) => row[queryColumnName(column.name)] ?? null)),
          );
        }
      }

      let newRows = 0;
      let conflictRows = 0;
      let skippedRows = 0;
      const sampleConflicts: DataImportTablePreview['sampleConflicts'] = [];
      for (const row of sheet.rows) {
        if (primaryKeys.length === 0) {
          const rowKey = JSON.stringify(columns.map((column) => row[column.name] ?? null));
          if (existingRowsWithoutKey.has(rowKey)) {
            skippedRows++;
          } else {
            newRows++;
            existingRowsWithoutKey.add(rowKey);
          }
          continue;
        }

        const keyValues = primaryKeys.map((column) => row[column.name]);
        const existing = existingByKey.get(JSON.stringify(keyValues));
        if (!existing) {
          newRows++;
          continue;
        }

        conflictRows++;
        if (conflictPolicy === 'skip') skippedRows++;
        if (sampleConflicts.length < 5) {
          const changes = columns
            .filter((column) => !primaryKeys.some((keyColumn) => keyColumn.name === column.name))
            .filter((column) => !this.importValuesEqual(
              existing[queryColumnName(column.name)],
              row[column.name],
            ))
            .slice(0, 5)
            .map((column) => ({
              column: column.name,
              existing: existing[queryColumnName(column.name)],
              imported: row[column.name],
            }));
          sampleConflicts.push({ key: JSON.stringify(keyValues), changes });
        }
      }

      return {
        table: sheet.name,
        incomingRows: sheet.rows.length,
        existingRows: currentRows.length,
        newRows,
        conflictRows,
        skippedRows,
        protected: false,
        sampleConflicts,
      };
    });

    return {
      tables,
      incomingRows: tables.reduce((sum, table) => sum + table.incomingRows, 0),
      newRows: tables.reduce((sum, table) => sum + table.newRows, 0),
      conflictRows: tables.reduce((sum, table) => sum + table.conflictRows, 0),
      skippedRows: tables.reduce((sum, table) => sum + table.skippedRows, 0),
    };
  }

  async importData(
    sheets: DataImportSheet[],
    conflictPolicy: DataImportConflictPolicy = 'overwrite',
  ): Promise<DataImportResult> {
    const user = this.require('admin.data.import');
    const prepared = this.validateImportSheets(sheets);
    const tables = this.db.executeTransaction((manager) => {
      manager.run('PRAGMA defer_foreign_keys = ON');
      const results: DataImportResult['tables'] = [];

      for (const { sheet, columns, primaryKeys } of prepared) {
        let insertedRows = 0;
        let updatedRows = 0;
        let skippedRows = 0;
        if (IMPORT_PROTECTED_TABLES.has(sheet.name)) {
          results.push({ table: sheet.name, insertedRows, updatedRows, skippedRows: sheet.rows.length });
          continue;
        }

        const columnNames = columns.map((column) => `"${column.name}"`).join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const updateColumns = columns.filter((column) => !primaryKeys.some((key) => key.name === column.name));
        const conflictClause = primaryKeys.length > 0
          ? ` ON CONFLICT (${primaryKeys.map((column) => `"${column.name}"`).join(', ')}) DO ${
            updateColumns.length > 0
              ? `UPDATE SET ${updateColumns.map((column) => `"${column.name}" = excluded."${column.name}"`).join(', ')}`
              : 'NOTHING'
          }`
          : '';

        for (const row of sheet.rows) {
          const values = columns.map((column) => {
            const value = row[column.name];
            return value instanceof ArrayBuffer ? new Uint8Array(value) : value ?? null;
          });
          if (primaryKeys.length === 0) {
            const exactMatch = columns.map((column) => `"${column.name}" IS ?`).join(' AND ');
            const existing = manager.query<{ found: number }>(
              `SELECT 1 AS found FROM "${sheet.name}" WHERE ${exactMatch} LIMIT 1`,
              values,
            ).length > 0;
            if (existing) {
              skippedRows++;
              continue;
            }
            insertedRows++;
          } else {
            const where = primaryKeys.map((column) => `"${column.name}" = ?`).join(' AND ');
            const exists = manager.query<{ found: number }>(
              `SELECT 1 AS found FROM "${sheet.name}" WHERE ${where} LIMIT 1`,
              primaryKeys.map((column) => row[column.name]),
            ).length > 0;
            if (exists) {
              if (conflictPolicy === 'skip') {
                skippedRows++;
                continue;
              }
              updatedRows++;
            } else {
              insertedRows++;
            }
          }
          manager.run(
            `INSERT INTO "${sheet.name}" (${columnNames}) VALUES (${placeholders})${conflictClause}`,
            values,
          );
        }

        results.push({ table: sheet.name, insertedRows, updatedRows, skippedRows });
      }
      return results;
    });

    const result: DataImportResult = {
      tables,
      insertedRows: tables.reduce((sum, table) => sum + table.insertedRows, 0),
      updatedRows: tables.reduce((sum, table) => sum + table.updatedRows, 0),
      skippedRows: tables.reduce((sum, table) => sum + table.skippedRows, 0),
    };
    new AuditService().log({
      userId: user.id,
      userName: user.fullName,
      action: 'استيراد بيانات من ملف Excel',
      module: 'ADMIN',
      newValues: JSON.stringify({ ...result, conflictPolicy, importedAt: new Date().toISOString() }),
    });
    await this.db.flush();
    return result;
  }

  private validateImportSheets(sheets: DataImportSheet[]): PreparedSheet[] {
    if (!Array.isArray(sheets) || sheets.length === 0) throw new Error('ملف Excel لا يحتوي على أوراق بيانات.');
    const tableNames = this.db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    const knownTables = new Set(tableNames.map((table) => table.name));
    const usedTables = new Set<string>();

    return sheets.map((sheet) => {
      if (!sheet || !IDENTIFIER.test(sheet.name) || !knownTables.has(sheet.name)) {
        throw new Error(`الورقة «${sheet?.name ?? ''}» لا تطابق جدولًا موجودًا في قاعدة البيانات.`);
      }
      if (usedTables.has(sheet.name)) throw new Error(`الورقة «${sheet.name}» مكررة.`);
      usedTables.add(sheet.name);

      const columns = this.db.query<{ name: string; pk: number }>(`PRAGMA table_info("${sheet.name}")`);
      if (columns.length === 0 || !Array.isArray(sheet.columns) ||
        sheet.columns.length !== columns.length ||
        sheet.columns.some((column, index) => column !== columns[index].name)) {
        throw new Error(`أعمدة الورقة «${sheet.name}» لا تطابق أعمدة الجدول الحالي.`);
      }
      if (!Array.isArray(sheet.rows)) throw new Error(`بيانات الورقة «${sheet.name}» غير صالحة.`);

      const primaryKeys = columns
        .filter((column) => Number(column.pk) > 0)
        .sort((left, right) => Number(left.pk) - Number(right.pk));
      const seenKeys = new Set<string>();
      for (const row of sheet.rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          throw new Error(`يوجد سجل غير صالح في الورقة «${sheet.name}».`);
        }
        for (const column of columns) {
          const value = row[column.name];
          const isBinary = value instanceof Uint8Array || value instanceof ArrayBuffer;
          if (value !== null && value !== undefined && !isBinary &&
            typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            throw new Error(`القيمة في «${sheet.name}.${column.name}» غير مدعومة.`);
          }
          if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new Error(`القيمة الرقمية في «${sheet.name}.${column.name}» غير صالحة.`);
          }
        }
        if (primaryKeys.length > 0) {
          const keyValues = primaryKeys.map((column) => row[column.name]);
          if (keyValues.some((value) => value === null || value === undefined || value === '')) {
            throw new Error(`المفتاح الأساسي مفقود في أحد سجلات الورقة «${sheet.name}».`);
          }
          const key = JSON.stringify(keyValues);
          if (seenKeys.has(key)) throw new Error(`يوجد مفتاح أساسي مكرر في الورقة «${sheet.name}».`);
          seenKeys.add(key);
        }
      }
      return { sheet, columns, primaryKeys };
    });
  }

  private importValuesEqual(left: unknown, right: unknown): boolean {
    if (left === null || left === undefined) return right === null || right === undefined || right === '';
    if (right === null || right === undefined) return left === '';
    const leftBytes = left instanceof Uint8Array ? left : left instanceof ArrayBuffer ? new Uint8Array(left) : null;
    const rightBytes = right instanceof Uint8Array ? right : right instanceof ArrayBuffer ? new Uint8Array(right) : null;
    if (leftBytes || rightBytes) {
      return Boolean(leftBytes && rightBytes && leftBytes.length === rightBytes.length &&
        leftBytes.every((value, index) => value === rightBytes[index]));
    }
    return left === right;
  }
}
