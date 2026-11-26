import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import {
  getQuickActionCatalog,
  PULSE_WIDGETS_META,
  type DashboardPrefsLike,
  type PulseWidgetId,
} from '../../../config/activityDashboardLayout';
import type { SectionId } from '../../../types/dashboard/components';

export type { DashboardPrefsLike };
export type DashboardUserPrefs = DashboardPrefsLike;

const SECTION_IDS = new Set<SectionId>([
  'all', 'pulse', 'activity', 'executive', 'sales', 'purchases', 'debts', 'crm', 'fleet', 'hr',
]);
const WIDGET_IDS = new Set<PulseWidgetId>(PULSE_WIDGETS_META.map((w) => w.id));
const ACTION_PATHS = new Set(getQuickActionCatalog().map((a) => a.to));

function sanitizePrefs(raw: unknown): DashboardUserPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const prefs: DashboardUserPrefs = {};

  const pickIds = <T extends string>(value: unknown, allowed: Set<T>): T[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const ids = value.filter((item): item is T => typeof item === 'string' && allowed.has(item as T));
    return [...new Set(ids)];
  };

  const hiddenSections = pickIds<SectionId>(source.hiddenSections, SECTION_IDS);
  if (hiddenSections) prefs.hiddenSections = hiddenSections;
  const sectionOrder = pickIds<SectionId>(source.sectionOrder, SECTION_IDS);
  if (sectionOrder) prefs.sectionOrder = sectionOrder;
  const pulseWidgets = pickIds<PulseWidgetId>(source.pulseWidgets, WIDGET_IDS);
  if (pulseWidgets) prefs.pulseWidgets = pulseWidgets;
  if (Array.isArray(source.kpis)) {
    prefs.kpis = [...new Set(source.kpis.filter((k): k is string => typeof k === 'string' && k.trim().length > 0 && k.length <= 80))];
  }
  const quickActions = pickIds<string>(source.quickActions, ACTION_PATHS);
  if (quickActions) prefs.quickActions = quickActions;
  return prefs;
}

/**
 * Per-user dashboard customization, persisted in `dashboard_user_preferences`.
 * Preferences only narrow/reorder what the activity layout already allows;
 * activity-hidden sections and permission checks still apply on top.
 */
export class DashboardPreferencesService {
  private static listeners = new Set<() => void>();

  private static db() {
    return DatabaseManager.getInstance();
  }

  private static currentUserId(): string | null {
    try {
      return AuthService.getCurrentUser()?.id ?? null;
    } catch {
      return null;
    }
  }

  public static getPreferences(): DashboardUserPrefs {
    const userId = DashboardPreferencesService.currentUserId();
    if (!userId) return {};
    try {
      const row = DashboardPreferencesService.db().query<{ prefs_json: string }>(
        'SELECT prefs_json FROM dashboard_user_preferences WHERE user_id = ?',
        [userId],
      )[0];
      if (!row) return {};
      return sanitizePrefs(JSON.parse(row.prefs_json));
    } catch {
      return {};
    }
  }

  public static savePreferences(prefs: DashboardUserPrefs): void {
    const userId = AuthService.requireAuth().id;
    DashboardPreferencesService.db().run(`
      INSERT INTO dashboard_user_preferences (user_id, prefs_json, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        prefs_json = excluded.prefs_json,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, JSON.stringify(sanitizePrefs(prefs))]);
    DashboardPreferencesService.emit();
  }

  public static resetPreferences(): void {
    const userId = DashboardPreferencesService.currentUserId();
    if (!userId) return;
    try {
      DashboardPreferencesService.db().run(
        'DELETE FROM dashboard_user_preferences WHERE user_id = ?',
        [userId],
      );
    } catch {
      // Table may not exist yet on a fresh install — treat as already reset.
    }
    DashboardPreferencesService.emit();
  }

  public static subscribe(listener: () => void): () => void {
    DashboardPreferencesService.listeners.add(listener);
    return () => DashboardPreferencesService.listeners.delete(listener);
  }

  private static emit(): void {
    for (const listener of DashboardPreferencesService.listeners) {
      try {
        listener();
      } catch {
        // A failing listener must not break the others.
      }
    }
  }
}
