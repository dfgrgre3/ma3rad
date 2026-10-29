import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { parseBusinessConfiguration } from '../config/businessProfiles';
import { SettingsService } from './SettingsService';

/**
 * Turns the attribute names declared by a business profile into real
 * `attributes` rows, so a freshly selected profile produces a usable product
 * form instead of an empty "no attributes defined" panel.
 *
 * The sync is idempotent: an attribute is matched by name first, then by its
 * generated code, so re-applying a profile (or switching back to it) never
 * duplicates fields and never deletes attributes the user created manually.
 */
export class BusinessProfileService {
  /** Deterministic short code, so the same Arabic name always maps to the same code. */
  private static codeFor(name: string): string {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
      hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
    }
    return `attr_auto_${hash.toString(36)}`;
  }

  /**
   * Ensure every name exists as an attribute.
   * Returns the names that were created and the ones that already existed.
   */
  public static ensureProfileAttributes(names: string[]): { created: string[]; existing: string[] } {
    const db = DatabaseManager.getInstance();
    const created: string[] = [];
    const existing: string[] = [];
    const seen = new Set<string>();

    for (const raw of names || []) {
      const name = (raw || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const byName = db.query<{ id: string }>(
        `SELECT id FROM attributes WHERE lower(trim(name)) = ?`,
        [key]
      )[0];
      if (byName) {
        existing.push(name);
        continue;
      }

      let code = BusinessProfileService.codeFor(name);
      const codeOwner = db.query<{ name: string }>(`SELECT name FROM attributes WHERE code = ?`, [code])[0];
      if (codeOwner) {
        // Practically unreachable, but never let a hash collision block the
        // profile from being applied.
        if (codeOwner.name.trim().toLowerCase() === key) {
          existing.push(name);
          continue;
        }
        code = `${code}_${uuidv4().substring(0, 6)}`;
      }

      db.run(
        `INSERT INTO attributes (id, code, name, data_type, unit, is_filterable, sort_order)
         VALUES (?, ?, ?, 'TEXT', NULL, 1,
           (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM attributes))`,
        [`attr_${uuidv4().substring(0, 8)}`, code, name]
      );
      created.push(name);
    }

    return { created, existing };
  }

  /** Apply the attributes declared by the currently saved business profile. */
  public static applyFromSettings(): { created: string[]; existing: string[] } {
    const businessType = SettingsService.getValue('businessType') || 'general';
    const config = parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), businessType);
    return BusinessProfileService.ensureProfileAttributes(config.productAttributes);
  }
}
