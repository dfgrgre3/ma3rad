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
      app?: {
        info?: () => Promise<{ version: string; packaged: boolean; dataDir: string; backupDir: string }>;
        openFolder?: (target?: 'data' | 'backups') => Promise<{ ok: boolean; path?: string; error?: string }>;
      };
    };
  }
}
