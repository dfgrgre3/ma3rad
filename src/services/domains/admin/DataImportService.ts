import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { OperationsService } from '../operations/OperationsService';
import { DATA_IMPORT_ACCESS_PERMISSIONS } from '../../../config/routePermissions';
import type { ParsedSpreadsheetSheet } from '../../infrastructure/data/SpreadsheetImportService';
import { DataImportBatchService } from './DataImportBatchService';
import { DataImportEntityWriter } from './DataImportEntityWriter';
import { ENTITY_META } from './dataImportMetadata';
import { createImportRowValues, parseImportRows, validateImport } from './dataImportValidation';
import type {
  ImportEntity,
  ImportIssue,
  ImportOptions,
  ImportRowValues,
  ParsedImport,
} from './dataImportTypes';

export { ENTITY_META } from './dataImportMetadata';
export type { ImportEntity, ImportField, ImportIssue, ParsedImport } from './dataImportTypes';
export type { ImportOptions } from './dataImportTypes';

export class DataImportService {
  private readonly batches = new DataImportBatchService();
  private readonly writer = new DataImportEntityWriter();

  parseSheets(sheets: ParsedSpreadsheetSheet[]): Array<{ sheet: ParsedSpreadsheetSheet; data: ParsedImport }> {
    if (!sheets.length) throw new Error('الملف لا يحتوي على أوراق بيانات.');
    return sheets.map((sheet) => ({
      sheet,
      data: this.parseRows(sheet.headers, sheet.rows),
    }));
  }

  parseRows(
    headers: string[],
    rows: Record<string, unknown>[],
    preferred?: ImportEntity,
  ): ParsedImport {
    return parseImportRows(headers, rows, preferred);
  }

  canOpen(user: ReturnType<typeof AuthService.getCurrentUser>): boolean {
    return PermissionService.canAny(user, DATA_IMPORT_ACCESS_PERMISSIONS);
  }

  getOpeningStockWarehouses() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'operations.view');
    return new OperationsService().getWarehouses().filter((warehouse) => warehouse.isActive);
  }

  validate(data: ParsedImport): ImportIssue[] {
    return validateImport(data);
  }

  import(
    data: ParsedImport,
    options: ImportOptions,
  ): { created: number; skipped: number; errors: ImportIssue[]; batchId?: string } {
    if (data.entity === 'dynamic') throw new Error('استخدم مسار استيراد البيانات المرنة لهذا الملف.');
    const entity = data.entity;
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, ENTITY_META[entity].permission);

    const issueMap = new Map(this.validate(data).map((issue) => [issue.row, issue.messages]));
    const result = { created: 0, skipped: 0, errors: [] as ImportIssue[] };
    const isTrackedEntity = entity === 'customers' || entity === 'products';
    const batchId = isTrackedEntity
      ? this.batches.createBatch(entity, options.sourceName, actor.id)
      : undefined;
    const context = this.writer.createContext(options);

    data.rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const rowIssues = issueMap.get(rowNumber);
      if (rowIssues?.length) {
        result.skipped++;
        result.errors.push({ row: rowNumber, messages: rowIssues });
        return;
      }

      try {
        const values = this.createRowValues(row, data.mapping);
        const createdId = this.writer.importRow(entity, values, context);
        if (batchId && createdId) this.batches.recordImportedEntity(batchId, createdId);
        result.created++;
      } catch (error) {
        result.skipped++;
        result.errors.push({ row: rowNumber, messages: [this.writer.getErrorMessage(error)] });
      }
    });

    if (batchId) this.batches.completeBatch(batchId, result.created, result.skipped);
    return { ...result, batchId };
  }

  getImportBatches(entity: 'customers' | 'products') {
    return this.batches.getImportBatches(entity);
  }

  rollbackImportBatch(batchId: string): number {
    return this.batches.rollbackImportBatch(batchId);
  }

  private createRowValues(row: Record<string, unknown>, mapping: Record<string, string>): ImportRowValues {
    return createImportRowValues(row, mapping);
  }
}
