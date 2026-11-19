import { useEffect, useRef } from 'react';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { SETUP_DRAFT_KEY } from './setupConstants';
import type { BusinessConfiguration } from '../../../config/businessProfiles';
import type { SetupForm, SetupOptions } from './setupTypes';

interface UseSetupDraftSaverArgs {
  saving: boolean;
  step: number;
  form: SetupForm;
  businessConfig: BusinessConfiguration;
  options: SetupOptions;
  setDraftSaveError: (error: string | null) => void;
}

export function useSetupDraftSaver({
  saving,
  step,
  form,
  businessConfig,
  options,
  setDraftSaveError,
}: UseSetupDraftSaverArgs) {
  const draftSaveVersion = useRef(0);

  useEffect(() => {
    if (saving) return;
    const version = ++draftSaveVersion.current;
    const timer = setTimeout(() => {
      try {
        const db = DatabaseManager.getInstance();
        db.run(
          'INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)',
          [SETUP_DRAFT_KEY, JSON.stringify({ version: 1, step, form, businessConfig, options })],
        );
        void db.flush().then(() => {
          if (draftSaveVersion.current === version) setDraftSaveError(null);
        }).catch((error) => {
          console.error('Could not persist the setup draft:', error);
          if (draftSaveVersion.current === version) {
            setDraftSaveError(error instanceof Error ? error.message : String(error));
          }
        });
      } catch (error) {
        console.error('Could not save the setup draft:', error);
        if (draftSaveVersion.current === version) {
          setDraftSaveError(error instanceof Error ? error.message : String(error));
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [step, form, businessConfig, options, saving, setDraftSaveError]);
}
