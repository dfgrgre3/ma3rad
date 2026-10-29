export {};

declare global {
  interface Window {
    ceramisys?: {
      savePdf?: (html: string, fileName: string, landscape?: boolean) => Promise<string | null>;
      db?: {
        load?: () => Promise<Uint8Array | null>;
        save?: (bytes: Uint8Array) => Promise<{ ok: boolean; code?: string; retryable?: boolean; path?: string; bytes?: number; error?: string }>;
        decryptLocalBackup?: (bytes: Uint8Array) => Promise<Uint8Array>;
        encryptXlsxBackup?: (bytes: Uint8Array, password: string) => Promise<Uint8Array>;
        decryptXlsxBackup?: (bytes: Uint8Array, password: string) => Promise<Uint8Array>;
        backup?: (label?: string) => Promise<{ ok: boolean; path?: string; bytes?: number; error?: string }>;
        removeBackup?: (fileName: string) => Promise<{ ok: boolean; deleted: boolean; error?: string }>;
        preserveCorrupt?: () => Promise<{ path: string; bytes: number }>;
        createFreshAfterRecovery?: () => Promise<{ ok: boolean; path?: string }>;
        info?: () => Promise<{ path: string; exists: boolean; bytes: number; backupDir: string; error?: string }>;
      };
      credentials?: {
        get?: () => Promise<{ username: string; password: string; consented: true } | null>;
        set?: (username: string, password: string) => Promise<{ ok: boolean }>;
        clear?: () => Promise<{ ok: boolean }>;
      };
      sync?: {
        status?: () => Promise<{
          clientConfigured: boolean;
          clientIdentity: { tenantId: string; branchId: string; deviceId: string; canManagePolicies?: boolean } | null;
          server: {
            serverEnabled: boolean;
            serverListening: boolean;
            host?: string | null;
            port?: number | null;
            journalEvents?: number;
          };
          error: string | null;
        }>;
        runSyncNow?: () => Promise<void>;
        pushEvents?: (events: import('../sync/types').SyncEvent[]) => Promise<import('../sync/types').SyncPushResult>;
        pullEvents?: (
          scope: string,
          cursor: string | null,
          limit: number
        ) => Promise<import('../sync/types').SyncPullResult>;
      };
      app?: {
        info?: () => Promise<{ version: string; packaged: boolean; dataDir: string; backupDir: string }>;
        openFolder?: (target?: 'data' | 'backups') => Promise<{ ok: boolean; path?: string; error?: string }>;
        relaunch?: () => Promise<{ ok: boolean }>;
        onBeforeClose?: (callback: (requestId: number) => void | Promise<void>) => () => void;
        notifyCloseReady?: (requestId: number, result: { ok: boolean; error?: string }) => void;
      };
      printing?: {
        listPrinters?: () => Promise<{ ok: boolean; printers: string[]; error?: string }>;
        raw?: (
          bytes: Uint8Array,
          printerName: string,
          options?: { transport?: 'system' | 'network'; host?: string; port?: number }
        ) => Promise<{ ok: boolean; error?: string }>;
        rawCups?: (bytes: Uint8Array, printerName: string) => Promise<{ ok: boolean; error?: string }>;
      };
      documents?: {
        importFile?: () => Promise<{
          ok: boolean;
          canceled?: boolean;
          storageName?: string;
          fileName?: string;
          mimeType?: string;
          fileSize?: number;
          checksum?: string;
          error?: string;
        }>;
        openFile?: (storageName: string) => Promise<{ ok: boolean; error?: string }>;
        info?: () => Promise<{ ok: boolean; directory?: string; maxBytes?: number }>;
      };
    };
  }
}
