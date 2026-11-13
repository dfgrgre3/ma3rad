import type {
  ColumnInfo,
  DataImportConflictPolicy,
  DataImportPreview,
  DataImportResult,
  DataImportSheet,
  DeleteResult,
  StorageStats,
  TableCount,
  TableInfo,
} from '../../../types/admin/dataAdmin';
import { DataAdminBrowseService } from './DataAdminBrowseService';
import { DataAdminDeletionService } from './DataAdminDeletionService';
import { DataAdminExportService } from './DataAdminExportService';
import { DataAdminTransferService } from './DataAdminTransferService';
export * from '../../../types/admin/dataAdmin';
export * from './dataAdminConstants';

export class DataAdminService {
  private readonly browse = new DataAdminBrowseService();
  private readonly deletion = new DataAdminDeletionService();
  private readonly exportService = new DataAdminExportService();
  private readonly transfer = new DataAdminTransferService();

  listTables(): TableInfo[] {
    return this.browse.listTables();
  }

  getColumns(table: string): ColumnInfo[] {
    return this.browse.getColumns(table);
  }

  getRows(table: string, options: { limit?: number; offset?: number; search?: string } = {}): any[] {
    return this.browse.getRows(table, options);
  }

  getStorageStats(): StorageStats {
    return this.browse.getStorageStats();
  }

  integrityCheck(): string[] {
    return this.browse.integrityCheck();
  }

  vacuum(): void {
    this.browse.vacuum();
  }

  exportTableData(table: string) {
    return this.exportService.exportTableData(table);
  }

  exportAllData() {
    return this.exportService.exportAllData();
  }

  previewDataImport(sheets: DataImportSheet[], conflictPolicy: DataImportConflictPolicy = 'overwrite'): DataImportPreview {
    return this.transfer.previewDataImport(sheets, conflictPolicy);
  }

  importData(sheets: DataImportSheet[], conflictPolicy: DataImportConflictPolicy = 'overwrite'): Promise<DataImportResult> {
    return this.transfer.importData(sheets, conflictPolicy);
  }

  deleteTableData(tables: string[], reason: string): Promise<DeleteResult> {
    return this.deletion.deleteTableData(tables, reason);
  }

  deleteRows(table: string, keys: Array<Record<string, unknown>>, reason: string): Promise<DeleteResult> {
    return this.deletion.deleteRows(table, keys, reason);
  }

  countByDateRange(table: string, column: string, from: string, to: string): number {
    return this.deletion.countByDateRange(table, column, from, to);
  }

  deleteByDateRange(
    table: string,
    column: string,
    from: string,
    to: string,
    reason: string,
  ): Promise<DeleteResult> {
    return this.deletion.deleteByDateRange(table, column, from, to, reason);
  }

  getPrimaryKeyColumns(table: string): string[] {
    return this.browse.getPrimaryKeyColumns(table);
  }

  listDeletableTables(): TableInfo[] {
    return this.browse.listDeletableTables();
  }

  countTableRows(tables: string[]): TableCount[] {
    return this.browse.countTableRows(tables);
  }
}
