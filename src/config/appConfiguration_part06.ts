import { APP_CONFIG_SCHEMA_VERSION } from './appConfiguration_part01';
import type { AppConfigDomain, AppConfigEntry } from './appConfiguration_part01';
import type { AppConfigRule, AppConfigSnapshot } from './appConfiguration_part02';
import { asRecord, entryId } from './appConfiguration_part04';
import { validateAppConfigEntry, validateAppConfigRule } from './appConfiguration_part05';

export function validateAppConfigSnapshot(input: unknown): AppConfigSnapshot {
  const record = asRecord(input);
  if (record.schemaVersion !== APP_CONFIG_SCHEMA_VERSION) {
    throw new Error('إصدار مخطط التكوين غير مدعوم.');
  }
  if (!Array.isArray(record.entries)) throw new Error('ملف التكوين يفتقد قائمة الأهداف.');
  if (!Array.isArray(record.rules)) throw new Error('ملف التكوين يفتقد قائمة القواعد.');
  if (record.entries.length > 3000) throw new Error('عدد أهداف التكوين يتجاوز الحد المسموح.');
  if (record.rules.length > 800) throw new Error('عدد قواعد التكوين يتجاوز الحد المسموح.');

  const entryMap = new Map<string, AppConfigEntry>();
  for (const raw of record.entries) {
    const entry = validateAppConfigEntry(raw);
    entryMap.set(entryId(entry.domain, entry.key), entry);
  }
  const ruleMap = new Map<string, AppConfigRule>();
  for (const raw of record.rules) {
    const rule = validateAppConfigRule(raw);
    ruleMap.set(rule.id, rule);
  }

  return {
    schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    entries: [...entryMap.values()],
    rules: [...ruleMap.values()],
  };
}

export function parseAppConfigSnapshot(raw: unknown): AppConfigSnapshot {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return { schemaVersion: APP_CONFIG_SCHEMA_VERSION, entries: [], rules: [] };
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`تعذر قراءة ملف التكوين: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return validateAppConfigSnapshot(value);
}

export function serializeAppConfigSnapshot(snapshot: AppConfigSnapshot): string {
  return JSON.stringify({
    schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    entries: snapshot.entries,
    rules: snapshot.rules,
  });
}

/**
 * Keys that encode a security or licensing decision. These may only be
 * distributed from the platform/tenant layer and must never be weakened by a
 * branch, device or user override.
 */
export function isSecuritySensitiveConfigKey(domain: AppConfigDomain, key: string): boolean {
  if (domain === 'policy') return key.startsWith('security.') || key.startsWith('license.');
  if (domain === 'feature') return true;
  if (domain === 'module') return true;
  if (domain === 'action') {
    const normalized = key.toLowerCase();
    return normalized.includes('permission') || normalized.includes('role');
  }
  return false;
}
