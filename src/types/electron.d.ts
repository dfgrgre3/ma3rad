export {};

declare global {
  interface Window {
    ceramisys?: {
      savePdf?: (html: string, fileName: string, landscape?: boolean) => Promise<string | null>;
      db?: {
        load?: () => Promise<Uint8Array | null>;
        save?: (bytes: Uint8Array) => Promise<{ ok: boolean; path?: string; bytes?: number; error?: string }>;
        backup?: (label?: string) => Promise<{ ok: boolean; path?: string; bytes?: number; error?: string }>;
        info?: () => Promise<{ path: string; exists: boolean; bytes: number; backupDir: string; error?: string }>;
      };
      credentials?: {
        get?: () => Promise<{ username: string; password: string } | null>;
        set?: (username: string, password: string) => Promise<{ ok: boolean }>;
      };
      app?: {
        info?: () => Promise<{ version: string; packaged: boolean; dataDir: string; backupDir: string }>;
        openFolder?: (target?: 'data' | 'backups') => Promise<{ ok: boolean; path?: string; error?: string }>;
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
    };
  }
}
