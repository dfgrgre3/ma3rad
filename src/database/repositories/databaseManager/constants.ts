import type { DatabaseManager } from '../databaseManager';

export const DB_STORAGE_KEY = 'ceramics_erp_sqlite_db';
export const LEGACY_X86_BUILD = typeof __CERAMISYS_LEGACY_BUILD__ !== 'undefined'
  && __CERAMISYS_LEGACY_BUILD__;
export type DatabaseFileApi = NonNullable<NonNullable<Window['ceramisys']>['db']>;
export type IdleCallbackHost = typeof globalThis & {
  requestIdleCallback?: (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};
export type DatabaseManagerState = {
  instance: DatabaseManager | null;
  numberFormatter: ((prefix: string, seq: number, date: Date) => string) | null;
};
export const DATABASE_MANAGER_STATE_KEY = '__ceramisysDatabaseManagerState__';

export function getDatabaseManagerState(): DatabaseManagerState {
  const runtime = globalThis as typeof globalThis & {
    __ceramisysDatabaseManagerState__?: DatabaseManagerState;
  };
  if (!runtime[DATABASE_MANAGER_STATE_KEY]) {
    runtime[DATABASE_MANAGER_STATE_KEY] = { instance: null, numberFormatter: null };
  }
  return runtime[DATABASE_MANAGER_STATE_KEY]!;
}
