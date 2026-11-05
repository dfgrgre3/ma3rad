export {};

declare global {
  interface Window {
    ceramisys?: {
      savePdf?: (html: string, fileName: string, landscape?: boolean) => Promise<string | null>;
      db?: {
        load?: () => Promise<Uint8Array | null>;
        save?: (bytes: Uint8Array) => Promise<{ ok: boolean; code?: string; retryable?: boolean; path?: string; bytes?: number; error?: string }>;
        saveSync?: (bytes: Uint8Array) => { ok: boolean; code?: string; retryable?: boolean; path?: string; bytes?: number; error?: string };
        decryptLocalBackup?: (bytes: Uint8Array) => Promise<Uint8Array>;
        encryptXlsxBackup?: (bytes: Uint8Array, password: string) => Promise<Uint8Array>;
        decryptXlsxBackup?: (bytes: Uint8Array, password: string) => Promise<Uint8Array>;
        backup?: (label?: string) => Promise<{
          ok: boolean;
          path?: string;
          bytes?: number;
          error?: string;
          strategy?: {
            actions: Array<{ type: string; target: string | null; status: string; description: string }>;
            recommendations: Array<{ type: string; action: string }>;
          };
        }>;
        getOffsiteBackupDir?: () => Promise<{ ok: boolean; path: string | null }>;
        setOffsiteBackupDir?: (directory: string) => Promise<{ ok: boolean; path: string | null }>;
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
      central?: {
        request?: (request: {
          serverUrl: string;
          path: string;
          method?: 'GET' | 'POST';
          headers?: Record<string, string>;
          body?: string;
        }) => Promise<{ ok: boolean; status: number; body: unknown }>;
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
          clientConfig: {
            url: string;
            tenantId: string;
            branchId: string;
            deviceId: string;
            canManagePolicies: boolean;
            tokenConfigured: boolean;
          } | null;
          clientConfigSource: 'secure-storage' | 'environment' | 'none';
          error: string | null;
        }>;
        getClientConfig?: () => Promise<{
          url: string;
          tenantId: string;
          branchId: string;
          deviceId: string;
          canManagePolicies: boolean;
          tokenConfigured: boolean;
        } | null>;
        saveClientConfig?: (config: {
          url: string;
          token: string;
          tenantId: string;
          branchId: string;
          deviceId: string;
          canManagePolicies: boolean;
        }) => Promise<{
          url: string;
          tenantId: string;
          branchId: string;
          deviceId: string;
          canManagePolicies: boolean;
          tokenConfigured: boolean;
        }>;
        clearClientConfig?: () => Promise<{ ok: boolean }>;
        runSyncNow?: () => Promise<void>;
        pushEvents?: (events: import('../sync/types').SyncEvent[]) => Promise<import('../sync/types').SyncPushResult>;
        pullEvents?: (
          scope: string,
          cursor: string | null,
          limit: number
        ) => Promise<import('../sync/types').SyncPullResult>;
      };
      tailscale?: {
        status?: () => Promise<{
          installed: boolean;
          running: boolean;
          ip: string | null;
          nodeName?: string;
          error?: string;
          peers?: Array<{ name: string; ip: string | null; online: boolean; os?: string }>;
        }>;
        connect?: (authKey?: string) => Promise<{ ok: boolean; stdout?: string; error?: string }>;
        disconnect?: () => Promise<{ ok: boolean; stdout?: string; error?: string }>;
      };
      tailscale?: {
        status?: () => Promise<{
          installed: boolean;
          running: boolean;
          ip: string | null;
          nodeName?: string;
          error?: string;
          peers?: Array<{ name: string; ip: string | null; online: boolean; os?: string }>;
        }>;
        connect?: (authKey?: string) => Promise<{ ok: boolean; stdout?: string; error?: string }>;
        disconnect?: () => Promise<{ ok: boolean; stdout?: string; error?: string }>;
      };
      app?: {
        info?: () => Promise<{ version: string; packaged: boolean; dataDir: string; backupDir: string }>;
        openFolder?: (target?: 'data' | 'backups') => Promise<{ ok: boolean; path?: string; error?: string }>;
        relaunch?: () => Promise<{ ok: boolean }>;
        onBeforeClose?: (callback: (requestId: number) => void | Promise<void>) => () => void;
        notifyCloseReady?: (requestId: number, result: { ok: boolean; error?: string }) => void;
      };
      diagnostics?: {
        reportError?: (report: { kind: string; message: string; stack?: string }) => Promise<{ ok: boolean }>;
      };
      updater?: {
        getStatus?: () => Promise<{
          status: 'idle' | 'checking' | 'not-available' | 'downloading' | 'downloaded' | 'error';
          currentVersion: string;
          version?: string;
          releaseName?: string;
          releaseNotes?: string;
          mandatory?: boolean;
          progress?: number;
          error?: string;
        }>;
        check?: () => Promise<{
          status: 'idle' | 'checking' | 'not-available' | 'downloading' | 'downloaded' | 'error';
          currentVersion: string;
          version?: string;
          releaseName?: string;
          releaseNotes?: string;
          mandatory?: boolean;
          progress?: number;
          error?: string;
        }>;
        install?: () => Promise<{ ok: boolean }>;
        onStatus?: (callback: (status: {
          status: 'idle' | 'checking' | 'not-available' | 'downloading' | 'downloaded' | 'error';
          currentVersion: string;
          version?: string;
          releaseName?: string;
          releaseNotes?: string;
          mandatory?: boolean;
          progress?: number;
          error?: string;
        }) => void) => () => void;
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
      license?: {
        getHwid?: () => Promise<string>;
        load?: () => Promise<{ active: boolean; reason?: string; license?: any; hwid: string; currentHwid?: string; boundHwid?: string }>;
        save?: (payload: any) => Promise<{ ok: boolean; hwid?: string; error?: string; message?: string }>;
        clear?: () => Promise<{ ok: boolean }>;
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
        recognizePage?: (imageData: Uint8Array) => Promise<{ ok: boolean; text?: string; error?: string }>;
        finishOcr?: () => Promise<{ ok: boolean; error?: string }>;
        info?: () => Promise<{ ok: boolean; directory?: string; maxBytes?: number }>;
      };
    };
  }
}
