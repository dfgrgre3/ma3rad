import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';

export class BackupService {
  private db = DatabaseManager.getInstance();

  public exportBackupFile(): void {
    const binary = this.db.exportDatabaseBinary();
    const blob = new Blob([binary as any], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = `ceramics_erp_backup_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.sqlite`;
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    // Record in history
    this.db.run(`
      INSERT INTO backup_history (id, file_name, file_path, file_size_bytes, backup_type, status)
      VALUES (?, ?, ?, ?, 'MANUAL_DOWNLOAD', 'SUCCESS')
    `, [`bak_${uuidv4().substring(0, 8)}`, fileName, 'Browser / User Download', binary.length]);
  }

  public async restoreBackupFromFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    this.db.importDatabaseBinary(bytes);

    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module)
      VALUES (?, 'usr_admin', 'المدير', 'استعادة قاعدة البيانات من ملف خارجي', 'SYSTEM')
    `, [`aud_${uuidv4().substring(0, 8)}`]);
  }

  public getBackupHistory(): any[] {
    return this.db.query(`SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 50`);
  }
}
