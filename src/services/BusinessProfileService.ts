import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import {
  getBusinessProfile,
  parseBusinessConfiguration,
  type BusinessProfileAttributeDefinition,
} from '../config/businessProfiles';
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

  public static ensureProfileAttributeDefinitions(
    definitions: BusinessProfileAttributeDefinition[],
  ): { created: string[]; existing: string[] } {
    const db = DatabaseManager.getInstance();
    const created: string[] = [];
    const existing: string[] = [];
    const seen = new Set<string>();

    db.executeTransaction((tx) => {
      for (const definition of definitions) {
        const name = definition.name.trim();
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);

        const byName = tx.query<{ id: string; code: string; dataType: string }>(
          `SELECT id, code, data_type AS dataType
           FROM attributes WHERE lower(trim(name)) = ?`,
          [key],
        )[0];
        if (byName) {
          const hasValues = tx.query<{ id: string }>(
            `SELECT id FROM product_attribute_values WHERE attribute_id = ? LIMIT 1`,
            [byName.id],
          ).length > 0;
          const hasOptions = tx.query<{ id: string }>(
            `SELECT id FROM attribute_options WHERE attribute_id = ? LIMIT 1`,
            [byName.id],
          ).length > 0;
          const isManagedLegacyTextField = byName.code === BusinessProfileService.codeFor(name)
            && byName.dataType === 'TEXT'
            && !hasValues
            && !hasOptions;
          if (isManagedLegacyTextField) {
            const profileCodeOwner = tx.query<{ id: string }>(
              `SELECT id FROM attributes WHERE code = ?`,
              [definition.code],
            )[0];
            const code = !profileCodeOwner || profileCodeOwner.id === byName.id
              ? definition.code
              : byName.code;
            tx.run(
              `UPDATE attributes
               SET code = ?, data_type = ?, unit = ?, is_required = 0, is_filterable = 1
               WHERE id = ?`,
              [code, definition.dataType, definition.unit || null, byName.id],
            );
            BusinessProfileService.addProfileAttributeOptions(tx, byName.id, definition.options || []);
          } else if (byName.dataType === definition.dataType && !hasOptions) {
            BusinessProfileService.addProfileAttributeOptions(tx, byName.id, definition.options || []);
          }
          existing.push(name);
          continue;
        }

        let code = definition.code;
        const codeOwner = tx.query<{ id: string; name: string }>(
          `SELECT id, name FROM attributes WHERE code = ?`,
          [code],
        )[0];
        if (codeOwner) {
          if (codeOwner.name.trim().toLowerCase() === key) {
            existing.push(name);
            continue;
          }
          code = `${code}_${uuidv4().substring(0, 6)}`;
        }

        const id = `attr_${uuidv4().substring(0, 8)}`;
        tx.run(
          `INSERT INTO attributes
            (id, code, name, data_type, unit, is_required, is_filterable, sort_order)
           VALUES (?, ?, ?, ?, ?, 0, 1,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM attributes))`,
          [id, code, name, definition.dataType, definition.unit || null],
        );
        BusinessProfileService.addProfileAttributeOptions(tx, id, definition.options || []);
        created.push(name);
      }
    });

    return { created, existing };
  }

  private static addProfileAttributeOptions(
    db: DatabaseManager,
    attributeId: string,
    options: string[],
  ): void {
    options.forEach((option, index) => {
      db.run(
        `INSERT INTO attribute_options (id, attribute_id, value, label, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(attribute_id, value) DO NOTHING`,
        [`attr_opt_${uuidv4().substring(0, 8)}`, attributeId, option, option, index],
      );
    });
  }

  /** Apply the attributes declared by the currently saved business profile. */
  public static applyFromSettings(): { created: string[]; existing: string[] } {
    const businessType = SettingsService.getValue('businessType') || 'general';
    const config = parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), businessType);
    const profiles = [businessType, ...config.additionalActivityIds].map(getBusinessProfile);
    const definitionsByCode = new Map<string, BusinessProfileAttributeDefinition>();
    const definitionsByName = new Map<string, BusinessProfileAttributeDefinition>();
    for (const definition of profiles.flatMap((profile) =>
      profile.configuration.productAttributeDefinitions || [])) {
      const byCode = definitionsByCode.get(definition.code);
      const byName = definitionsByName.get(definition.name.trim().toLowerCase());
      const sameDefinition = (existing: BusinessProfileAttributeDefinition | undefined) =>
        !existing || (
          existing.code === definition.code
          && existing.name === definition.name
          && existing.dataType === definition.dataType
          && existing.unit === definition.unit
          && JSON.stringify(existing.options || []) === JSON.stringify(definition.options || [])
        );
      if (!sameDefinition(byCode) || !sameDefinition(byName)) {
        throw new Error(`تعارض تعريف خاصية النشاط «${definition.name}».`);
      }
      definitionsByCode.set(definition.code, definition);
      definitionsByName.set(definition.name.trim().toLowerCase(), definition);
    }
    const definitions = [...definitionsByCode.values()];
    const db = DatabaseManager.getInstance();
    return db.executeTransaction(() => {
      const typed = BusinessProfileService.ensureProfileAttributeDefinitions(definitions);
      const named = BusinessProfileService.ensureProfileAttributes(config.productAttributes);
      return {
        created: [...typed.created, ...named.created],
        existing: [...typed.existing, ...named.existing],
      };
    });
  }
}
