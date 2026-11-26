import type { Migration } from './support';

// Per-user dashboard customization: which sections/widgets/KPIs/quick actions
// each user sees on the main dashboard, stored as a JSON blob per user.
export const MIGRATION_274_DASHBOARD_USER_PREFERENCES: Migration = {
  id: '274_dashboard_user_preferences',
  description: 'Per-user dashboard layout preferences (sections, widgets, KPIs, quick actions)',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dashboard_user_preferences (
        user_id TEXT PRIMARY KEY,
        prefs_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  },
};
