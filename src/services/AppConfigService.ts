import type { Database } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';
import {
  APP_CONFIG_SCHEMA_VERSION,
  APP_CONFIG_POLICY_CATALOG,
  DEFAULT_NUMBER_TEMPLATE,
  entryId,
  formatDocumentNumber,
  normalizePagePath,
  parseAppConfigSnapshot,
  serializeAppConfigSnapshot,
  validateAppConfigEntry,
  validateAppConfigRule,
  validateAppConfigSnapshot,
  type AppConfigEntry,
  type AppConfigNumbering,
  type AppConfigRule,
  type AppConfigSnapshot,
} from '../config/appConfiguration';
import type { User } from '../types';
import {
  canOverrideAtScope,
  describeScope,
  isConfigurationScopeType,
  normalizeScopeContext,
  resolveConfigurationScopeChain,
  serializeScopeContext,
  type ConfigurationScopeContext,
  type ConfigurationScopeRef,
  type ConfigurationScopeType,
} from '../config/configurationScopes';

export interface ScopedAppConfigEntry extends AppConfigEntry {
  scopeType: ConfigurationScopeType;
  scopeId: string;
}

export type AppConfigOrigin = { type: 'base'; scopeId: string } | ConfigurationScopeRef | null;

export interface ResolvedAppConfigEntry {
  entry: AppConfigEntry | null;
  origin: AppConfigOrigin;
  description: string;
}

export interface AppConfigState {
  entries: AppConfigEntry[];
  rules: AppConfigRule[];
  entryIndex: Map<string, AppConfigEntry>;
  /** Raw scope overrides known to the local database (all scopes). */
  scopedEntries: ScopedAppConfigEntry[];
  /** Effective context the state was resolved for. */
  context: ConfigurationScopeContext;
  /** Iteration order of the resolved scope chain, highest authority first. */
  scopeChain: ConfigurationScopeRef[];
  /** Which scope supplied each effective entry. */
  originIndex: Map<string, ResolvedAppConfigEntry>;
}

export interface AppConfigPageState {
  enabled: boolean;
  label: string | null;
  order: number | null;
  entry: AppConfigEntry | null;
}

export interface AppConfigSectionState {
  enabled: boolean;
  label: string | null;
  entry: AppConfigEntry | null;
}

export interface AppConfigFieldState {
  visible: boolean;
  required: boolean;
  label: string | null;
  entry: AppConfigEntry | null;
}

export interface AppConfigVersion {
  id: string;
  version: number;
  snapshot: AppConfigSnapshot;
  createdBy: string;
  createdByName: string;
  reason: string;
  createdAt: string;
}

interface VersionRow {
  id: string;
  version: number;
  snapshotJson: string;
  createdBy: string;
  createdByName: string;
  reason: string;
  createdAt: string;
}

interface EntryRow {
  domain: string;
  key: string;
  enabled: number;
  label: string | null;
  value: string | null;
  sortOrder: number | null;
  required: number | null;
  propsJson: string | null;
}

interface RuleRow {
  id: string;
  kind: string;
  pagePath: string;
  selector: string | null;
  matchText: string | null;
  replacementText: string | null;
  action: string;
  enabled: number;
  note: string | null;
}

export interface AppConfigScopeVersion {
  id: string;
  scopeType: ConfigurationScopeType;
  scopeId: string;
  version: number;
  snapshot: ImportedScopeSnapshot;
  createdBy: string;
  createdByName: string;
  reason: string;
  createdAt: string;
}

export interface ImportedScopeSnapshot {
  schemaVersion: typeof APP_CONFIG_SCHEMA_VERSION;
  scopeType: ConfigurationScopeType;
  scopeId: string;
  entries: AppConfigEntry[];
}

interface ScopeVersionRow {
  id: string;
  scopeType: string;
  scopeId: string;
  version: number;
  snapshotJson: string;
  createdBy: string;
  createdByName: string;
  reason: string;
  createdAt: string;
}

interface ScopeEntryRow extends EntryRow {
  scopeType: string;
  scopeId: string;
}

type Listener = (state: AppConfigState) => void;

const EMPTY_STATE: AppConfigState = {
  entries: [],
  rules: [],
  entryIndex: new Map(),
  scopedEntries: [],
  context: {},
  scopeChain: [],
  originIndex: new Map(),
};

/**
 * Single source of truth for the Dynamic Application Configuration Engine.
 *
 * Reads are intentionally permission-free: every screen resolves its
 * visibility/label/text through this service. Every write is permission-gated,
 * validated, transactional, audited and versioned.
 */
export class AppConfigService {
  private static cache: { db: Database; contextKey: string; state: AppConfigState } | null = null;
  private static listeners = new Set<Listener>();

  private static database(): DatabaseManager {
    return DatabaseManager.getInstance();
  }

  private static buildState(
    baseEntries: AppConfigEntry[],
    rules: AppConfigRule[],
    scopedEntries: ScopedAppConfigEntry[],
    context: ConfigurationScopeContext,
  ): AppConfigState {
    const chain = resolveConfigurationScopeChain(context);
    const resolved = new Map<string, ResolvedAppConfigEntry>();

    // Highest authority first: the first scope that defines a key wins.
    for (const ref of chain) {
      for (const scoped of scopedEntries) {
        if (scoped.scopeType !== ref.type || scoped.scopeId !== ref.id) continue;
        const id = entryId(scoped.domain, scoped.key);
        if (resolved.has(id)) continue;
        if (!canOverrideAtScope(ref.type, scoped.domain, scoped.key).allowed) continue;
        const { scopeType: _scopeType, scopeId: _scopeId, ...entry } = scoped;
        resolved.set(id, { entry, origin: ref, description: describeScope(ref) });
      }
    }

    for (const entry of baseEntries) {
      const id = entryId(entry.domain, entry.key);
      if (resolved.has(id)) continue;
      resolved.set(id, {
        entry,
        origin: { type: 'base', scopeId: 'base' },
        description: describeScope(null),
      });
    }

    const entryIndex = new Map<string, AppConfigEntry>();
    for (const [id, value] of resolved) {
      if (value.entry) entryIndex.set(id, value.entry);
    }

    return {
      entries: [...entryIndex.values()].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key),
      ),
      rules: [...rules],
      entryIndex,
      scopedEntries: [...scopedEntries],
      context,
      scopeChain: chain,
      originIndex: resolved,
    };
  }

  private static toEntry(row: EntryRow): AppConfigEntry {
    let props: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.propsJson || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) props = parsed;
    } catch {
      props = {};
    }
    return {
      domain: row.domain as AppConfigEntry['domain'],
      key: row.key,
      enabled: Number(row.enabled) === 1,
      label: row.label || '',
      value: row.value || '',
      ...(row.sortOrder === null || row.sortOrder === undefined ? {} : { order: Number(row.sortOrder) }),
      ...(row.required === null || row.required === undefined ? {} : { required: Number(row.required) === 1 }),
      props,
    };
  }

  private static toRule(row: RuleRow): AppConfigRule {
    return {
      id: row.id,
      kind: row.kind === 'text' ? 'text' : 'selector',
      pagePath: row.pagePath,
      ...(row.selector ? { selector: row.selector } : {}),
      ...(row.matchText ? { matchText: row.matchText } : {}),
      ...(row.replacementText !== null && row.replacementText !== undefined
        ? { replacementText: row.replacementText }
        : {}),
      action: row.action === 'show' ? 'show' : row.action === 'text' ? 'text' : 'hide',
      enabled: Number(row.enabled) === 1,
      ...(row.note ? { note: row.note } : {}),
    };
  }

  private static toScopedEntry(row: ScopeEntryRow): ScopedAppConfigEntry {
    return {
      ...AppConfigService.toEntry(row),
      scopeType: row.scopeType as ConfigurationScopeType,
      scopeId: row.scopeId,
    };
  }

  public static invalidate(): void {
    AppConfigService.cache = null;
  }

  private static activeContext: ConfigurationScopeContext = {};

  /** Runtime hook: call when the signed-in user, branch or device changes. */
  public static setActiveContext(context: ConfigurationScopeContext | null): void {
    const next = normalizeScopeContext(context);
    if (serializeScopeContext(next) === serializeScopeContext(AppConfigService.activeContext)) return;
    AppConfigService.activeContext = next;
    AppConfigService.invalidate();
    AppConfigService.notify();
  }

  public static getActiveContext(): ConfigurationScopeContext {
    return { ...AppConfigService.activeContext };
  }

  public static getState(): AppConfigState {
    return AppConfigService.getResolvedState(AppConfigService.activeContext);
  }

  /**
   * Resolve configuration for an explicit scope context without mutating the
   * active runtime context. Used by the Configuration Studio preview.
   */
  public static getResolvedState(context: ConfigurationScopeContext | null): AppConfigState {
    const normalized = normalizeScopeContext(context);
    let db: Database;
    let manager: DatabaseManager;
    try {
      manager = AppConfigService.database();
      db = manager.getDatabase();
    } catch {
      return EMPTY_STATE;
    }
    const cacheKey = serializeScopeContext(normalized);
    if (AppConfigService.cache?.db === db && AppConfigService.cache.contextKey === cacheKey) {
      return AppConfigService.cache.state;
    }

    let entries: AppConfigEntry[] = [];
    let rules: AppConfigRule[] = [];
    let scopedEntries: ScopedAppConfigEntry[] = [];
    try {
      entries = manager
        .query<EntryRow>(
          `SELECT domain, key, enabled, label, value, sort_order AS sortOrder,
                  required, props_json AS propsJson
           FROM app_config_entries`,
        )
        .map(AppConfigService.toEntry);
      rules = manager
        .query<RuleRow>(
          `SELECT id, kind, page_path AS pagePath, selector, match_text AS matchText,
                  replacement_text AS replacementText, action, enabled, note
           FROM app_config_rules`,
        )
        .map(AppConfigService.toRule);
    } catch {
      // A database created before migration 101 has no configuration tables.
      entries = [];
      rules = [];
    }
    try {
      scopedEntries = manager
        .query<ScopeEntryRow>(
          `SELECT scope_type AS scopeType, scope_id AS scopeId, domain, key, enabled,
                  label, value, sort_order AS sortOrder, required, props_json AS propsJson
           FROM app_config_scope_entries`,
        )
        .map(AppConfigService.toScopedEntry);
    } catch {
      // A database created before migration 102 has no scoped configuration.
      scopedEntries = [];
    }

    const state = AppConfigService.buildState(entries, rules, scopedEntries, normalized);
    AppConfigService.cache = { db, contextKey: cacheKey, state };
    return state;
  }

  public static subscribe(listener: Listener): () => void {
    AppConfigService.listeners.add(listener);
    return () => AppConfigService.listeners.delete(listener);
  }

  private static notify(): void {
    const state = AppConfigService.getState();
    for (const listener of AppConfigService.listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('App configuration listener failed:', error);
      }
    }
  }

  public static getEntry(domain: AppConfigEntry['domain'], key: string): AppConfigEntry | null {
    return AppConfigService.getState().entryIndex.get(entryId(domain, key)) ?? null;
  }

  public static getOrigin(domain: AppConfigEntry['domain'], key: string, context?: ConfigurationScopeContext | null): AppConfigOrigin {
    const resolved = AppConfigService.resolveEntry(domain, key, context);
    return resolved.origin;
  }

  public static resolveEntry(
    domain: AppConfigEntry['domain'],
    key: string,
    context?: ConfigurationScopeContext | null,
  ): ResolvedAppConfigEntry {
    const state = context ? AppConfigService.getResolvedState(context) : AppConfigService.getState();
    const existing = state.originIndex.get(entryId(domain, key));
    if (existing) return existing;
    return {
      entry: null,
      origin: null,
      description: 'الإعداد العام',
    };
  }

  public static getScopeEntries(scopeType: ConfigurationScopeType, scopeId: string): ScopedAppConfigEntry[] {
    const normalized = String(scopeId || '').trim();
    if (!normalized) return [];
    return AppConfigService.getState().scopedEntries.filter(
      (entry) => entry.scopeType === scopeType && entry.scopeId === normalized,
    );
  }

  public static saveScopeEntry(
    scopeType: ConfigurationScopeType,
    scopeId: string,
    input: AppConfigEntry,
    reason = 'تحديث إعدادات النطاق',
    actor?: User | null,
    context?: ConfigurationScopeContext | null,
  ): AppConfigEntry {
    if (!isConfigurationScopeType(scopeType)) throw new Error('نطاق إعدادات غير مدعوم.');
    const normalizedScopeId = String(scopeId || '').trim();
    if (!normalizedScopeId) throw new Error('معرّف النطاق مطلوب.');
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'settings.update');
    const entry = validateAppConfigEntry(input);
    const decision = canOverrideAtScope(scopeType, entry.domain, entry.key);
    if (!decision.allowed) throw new Error(decision.reason);

    const db = AppConfigService.database();
    const now = new Date().toISOString();
    db.executeTransaction((tx) => {
      tx.run(
        `INSERT INTO app_config_scope_entries
           (scope_type, scope_id, domain, key, enabled, label, value, sort_order, required, props_json, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope_type, scope_id, domain, key) DO UPDATE SET
           enabled = excluded.enabled,
           label = excluded.label,
           value = excluded.value,
           sort_order = excluded.sort_order,
           required = excluded.required,
           props_json = excluded.props_json,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
        [
          scopeType,
          normalizedScopeId,
          entry.domain,
          entry.key,
          entry.enabled ? 1 : 0,
          entry.label,
          entry.value,
          entry.order ?? null,
          entry.required === undefined ? null : entry.required ? 1 : 0,
          JSON.stringify(entry.props || {}),
          now,
          user.id,
        ],
      );

      // Append a version snapshot for this scope.
      const version = Number(tx.query<{ version: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS version
         FROM app_config_scope_versions WHERE scope_type = ? AND scope_id = ?`,
        [scopeType, normalizedScopeId],
      )[0]?.version || 1);
      const snapshotEntries = tx.query<ScopeEntryRow>(
        `SELECT scope_type AS scopeType, scope_id AS scopeId, domain, key, enabled,
                label, value, sort_order AS sortOrder, required, props_json AS propsJson
         FROM app_config_scope_entries
         WHERE scope_type = ? AND scope_id = ?`,
        [scopeType, normalizedScopeId],
      ).map((row) => AppConfigService.toScopedEntry(row));
      tx.run(
        `INSERT INTO app_config_scope_versions
           (id, scope_type, scope_id, version, snapshot_json, created_by, created_by_name, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `ascfg_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
          scopeType,
          normalizedScopeId,
          version,
          JSON.stringify({
            schemaVersion: APP_CONFIG_SCHEMA_VERSION,
            scopeType,
            scopeId: normalizedScopeId,
            entries: snapshotEntries.map(({ scopeType: _a, scopeId: _b, ...rest }) => rest),
          }),
          user.id,
          user.fullName,
          reason.trim() || 'تحديث إعدادات النطاق',
          now,
        ],
      );
    });

    try {
      new AuditService().log({
        userId: user.id,
        userName: user.fullName,
        action: 'تحديث إعدادات النطاق',
        module: 'APP_CONFIG',
        newValues: JSON.stringify({ scopeType, scopeId: normalizedScopeId, domain: entry.domain, key: entry.key }),
      });
    } catch {
      // Audit failure must not roll back a validated configuration change.
    }

    AppConfigService.invalidate();
    AppConfigService.notify();
    return entry;
  }

  public static deleteScopeEntry(
    scopeType: ConfigurationScopeType,
    scopeId: string,
    domain: AppConfigEntry['domain'],
    key: string,
    reason = 'حذف إعداد النطاق',
    actor?: User | null,
  ): void {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'settings.update');
    const normalizedScopeId = String(scopeId || '').trim();
    if (!normalizedScopeId) throw new Error('معرّف النطاق مطلوب.');

    const db = AppConfigService.database();
    db.run(
      `DELETE FROM app_config_scope_entries
       WHERE scope_type = ? AND scope_id = ? AND domain = ? AND key = ?`,
      [scopeType, normalizedScopeId, domain, key],
    );
    AppConfigService.invalidate();
    AppConfigService.notify();
  }

  public static getScopeVersions(
    scopeType: ConfigurationScopeType,
    scopeId: string,
    limit = 50,
    actor?: User | null,
  ): AppConfigScopeVersion[] {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'audit.view');
    const normalizedScopeId = String(scopeId || '').trim();
    const bounded = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    const rows = AppConfigService.database().query<ScopeVersionRow>(
      `SELECT id, scope_type AS scopeType, scope_id AS scopeId, version, snapshot_json AS snapshotJson,
              created_by AS createdBy, created_by_name AS createdByName, reason, created_at AS createdAt
       FROM app_config_scope_versions
       WHERE scope_type = ? AND scope_id = ?
       ORDER BY version DESC LIMIT ?`,
      [scopeType, normalizedScopeId, bounded],
    );
    return rows.map((row) => ({
      id: row.id,
      scopeType: row.scopeType as ConfigurationScopeType,
      scopeId: row.scopeId,
      version: Number(row.version),
      snapshot: JSON.parse(row.snapshotJson) as ImportedScopeSnapshot,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  }

  public static restoreScopeVersion(versionId: string, actor?: User | null): void {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'settings.update');
    const row = AppConfigService.database().query<ScopeVersionRow>(
      `SELECT id, scope_type AS scopeType, scope_id AS scopeId, version, snapshot_json AS snapshotJson,
              created_by AS createdBy, created_by_name AS createdByName, reason, created_at AS createdAt
       FROM app_config_scope_versions WHERE id = ?`,
      [versionId],
    )[0];
    if (!row) throw new Error('إصدار النطاق غير موجود.');
    const snapshot = JSON.parse(row.snapshotJson) as ImportedScopeSnapshot;
    const db = AppConfigService.database();
    const now = new Date().toISOString();
    db.executeTransaction((tx) => {
      tx.run(
        'DELETE FROM app_config_scope_entries WHERE scope_type = ? AND scope_id = ?',
        [row.scopeType, row.scopeId],
      );
      for (const entry of snapshot.entries) {
        tx.run(
          `INSERT INTO app_config_scope_entries
             (scope_type, scope_id, domain, key, enabled, label, value, sort_order, required, props_json, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.scopeType,
            row.scopeId,
            entry.domain,
            entry.key,
            entry.enabled ? 1 : 0,
            entry.label,
            entry.value,
            entry.order ?? null,
            entry.required === undefined ? null : entry.required ? 1 : 0,
            JSON.stringify(entry.props || {}),
            now,
            user.id,
          ],
        );
      }
    });
    AppConfigService.invalidate();
    AppConfigService.notify();
  }

  public static isConfigurationScopeType(value: unknown): value is ConfigurationScopeType {
    return isConfigurationScopeType(value);
  }

  public static isEnabled(domain: AppConfigEntry['domain'], key: string, fallback = true): boolean {
    return AppConfigService.getEntry(domain, key)?.enabled ?? fallback;
  }

  public static getLabel(domain: AppConfigEntry['domain'], key: string, fallback: string): string {
    const entry = AppConfigService.getEntry(domain, key);
    return entry && entry.label ? entry.label : fallback;
  }

  public static getText(key: string, fallback: string): string {
    const entry = AppConfigService.getEntry('text', key);
    return entry ? entry.value : fallback;
  }

  public static resolveText(state: AppConfigState, key: string, fallback: string): string {
    const entry = state.entryIndex.get(entryId('text', key));
    return entry ? entry.value : fallback;
  }

  public static getPage(pathname: string): AppConfigPageState {
    const key = normalizePagePath(pathname);
    const entry = AppConfigService.getEntry('page', key);
    return {
      enabled: entry?.enabled ?? true,
      label: entry?.label ? entry.label : null,
      order: entry?.order ?? null,
      entry,
    };
  }

  public static isPageEnabled(pathname: string): boolean {
    return AppConfigService.getPage(pathname).enabled;
  }

  public static getPageLabel(pathname: string, fallback: string): string {
    return AppConfigService.getPage(pathname).label || fallback;
  }

  public static getSection(pagePath: string, sectionId: string): AppConfigSectionState {
    const key = `${normalizePagePath(pagePath)}#${sectionId}`;
    const entry = AppConfigService.getEntry('section', key);
    return {
      enabled: entry?.enabled ?? true,
      label: entry?.label ? entry.label : null,
      entry,
    };
  }

  public static getField(formId: string, fieldKey: string): AppConfigFieldState {
    const key = `${formId}#${fieldKey}`;
    const entry = AppConfigService.getEntry('field', key);
    return {
      visible: entry?.enabled ?? true,
      required: entry?.required ?? false,
      label: entry?.label ? entry.label : null,
      entry,
    };
  }

  public static getPolicyString(key: string, fallback: string): string {
    const entry = AppConfigService.getEntry('policy', key);
    return entry && entry.value !== '' ? entry.value : fallback;
  }

  public static getPolicyNumber(key: string, fallback: number): number {
    const raw = AppConfigService.getEntry('policy', key)?.value;
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  public static getPolicyBoolean(key: string, fallback: boolean): boolean {
    const raw = AppConfigService.getEntry('policy', key)?.value;
    if (raw === undefined || raw === '') return fallback;
    return raw === '1' || raw === 'true' || raw === 'نعم';
  }

  public static getPolicyCatalog() {
    return APP_CONFIG_POLICY_CATALOG;
  }

  public static getNumbering(prefix: string): AppConfigNumbering {
    const entry = AppConfigService.getEntry('numbering', prefix);
    const props = entry?.props || {};
    return {
      prefix: typeof props.prefix === 'string' && props.prefix.trim() ? props.prefix.trim() : prefix,
      template: typeof props.template === 'string' && props.template.trim()
        ? props.template.trim()
        : DEFAULT_NUMBER_TEMPLATE,
      resetYearly: props.resetYearly === undefined ? true : props.resetYearly === true || props.resetYearly === 'true',
    };
  }

  public static formatNextNumber(prefix: string, seq: number, date = new Date()): string {
    const numbering = AppConfigService.getNumbering(prefix);
    return formatDocumentNumber(numbering.template, { prefix: numbering.prefix, seq, date });
  }

  /** Lets `DatabaseManager.nextNumber` honour administrator templates. */
  public static installNumbering(): void {
    DatabaseManager.setNumberFormatter((prefix, seq, date) =>
      AppConfigService.formatNextNumber(prefix, seq, date)
    );
  }

  public static getPrintTemplate(key: string, fallback = ''): string {
    const entry = AppConfigService.getEntry('print', key);
    return entry ? entry.value : fallback;
  }

  public static getSelectorsForPage(pathname: string): AppConfigRule[] {
    const page = normalizePagePath(pathname);
    return AppConfigService.getState().rules.filter((rule) =>
      rule.enabled
      && rule.kind === 'selector'
      && (rule.pagePath === '*' || rule.pagePath === page)
    );
  }

  public static getTextRulesForPage(pathname: string): AppConfigRule[] {
    const page = normalizePagePath(pathname);
    return AppConfigService.getState().rules.filter((rule) =>
      rule.enabled
      && rule.kind === 'text'
      && (rule.pagePath === '*' || rule.pagePath === page)
    );
  }

  public static saveConfig(
    input: { entries: AppConfigEntry[]; rules: AppConfigRule[] },
    reason = 'تحديث محرك التكوين',
    actor?: User | null,
  ): AppConfigSnapshot {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'settings.update');

    const snapshot = validateAppConfigSnapshot({
      schemaVersion: APP_CONFIG_SCHEMA_VERSION,
      entries: input.entries,
      rules: input.rules,
    });
    const db = AppConfigService.database();
    const now = new Date().toISOString();
    const snapshotJson = serializeAppConfigSnapshot(snapshot);

    db.executeTransaction((tx) => {
      tx.run('DELETE FROM app_config_entries');
      tx.run('DELETE FROM app_config_rules');
      for (const entry of snapshot.entries) {
        tx.run(
          `INSERT INTO app_config_entries
             (domain, key, enabled, label, value, sort_order, required, props_json, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entry.domain,
            entry.key,
            entry.enabled ? 1 : 0,
            entry.label,
            entry.value,
            entry.order ?? null,
            entry.required === undefined ? null : entry.required ? 1 : 0,
            JSON.stringify(entry.props || {}),
            now,
            user.id,
          ],
        );
      }
      for (const rule of snapshot.rules) {
        tx.run(
          `INSERT INTO app_config_rules
             (id, kind, page_path, selector, match_text, replacement_text, action, enabled, note, created_at, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rule.id,
            rule.kind,
            rule.pagePath,
            rule.selector ?? null,
            rule.matchText ?? null,
            rule.replacementText ?? null,
            rule.action,
            rule.enabled ? 1 : 0,
            rule.note ?? null,
            now,
            now,
            user.id,
          ],
        );
      }

      const latest = tx.query<{ snapshotJson: string }>(
        'SELECT snapshot_json AS snapshotJson FROM app_config_versions ORDER BY version DESC LIMIT 1',
      )[0];
      if (latest?.snapshotJson !== snapshotJson) {
        const version = Number(tx.query<{ version: number }>(
          'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM app_config_versions',
        )[0]?.version || 1);
        tx.run(
          `INSERT INTO app_config_versions
             (id, version, snapshot_json, created_by, created_by_name, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `acfg_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
            version,
            snapshotJson,
            user.id,
            user.fullName,
            reason.trim() || 'تحديث محرك التكوين',
            now,
          ],
        );
      }
    });

    try {
      new AuditService().log({
        userId: user.id,
        userName: user.fullName,
        action: 'تحديث محرك التكوين الديناميكي',
        module: 'APP_CONFIG',
        oldValues: JSON.stringify({ entries: AppConfigService.getState().entries.length }),
        newValues: JSON.stringify({
          entries: snapshot.entries.length,
          rules: snapshot.rules.length,
          reason,
        }),
      });
    } catch {
      // Audit failure must not roll back a validated configuration change.
    }

    AppConfigService.invalidate();
    AppConfigService.installNumbering();
    AppConfigService.notify();
    return snapshot;
  }

  public static upsertEntry(entry: AppConfigEntry, reason = 'تحديث هدف تكوين', actor?: User | null): AppConfigSnapshot {
    const normalized = validateAppConfigEntry(entry);
    const state = AppConfigService.getState();
    const entries = state.entries.filter(
      (item) => entryId(item.domain, item.key) !== entryId(normalized.domain, normalized.key),
    );
    entries.push(normalized);
    return AppConfigService.saveConfig({ entries, rules: state.rules }, reason, actor);
  }

  public static deleteEntry(
    domain: AppConfigEntry['domain'],
    key: string,
    reason = 'حذف هدف تكوين',
    actor?: User | null,
  ): AppConfigSnapshot {
    const state = AppConfigService.getState();
    return AppConfigService.saveConfig({
      entries: state.entries.filter((item) => entryId(item.domain, item.key) !== entryId(domain, key)),
      rules: state.rules,
    }, reason, actor);
  }

  public static upsertRule(rule: AppConfigRule, reason = 'تحديث قاعدة تكوين', actor?: User | null): AppConfigSnapshot {
    const normalized = validateAppConfigRule(rule);
    const state = AppConfigService.getState();
    const rules = state.rules.filter((item) => item.id !== normalized.id);
    rules.push(normalized);
    return AppConfigService.saveConfig({ entries: state.entries, rules }, reason, actor);
  }

  public static deleteRule(ruleId: string, reason = 'حذف قاعدة تكوين', actor?: User | null): AppConfigSnapshot {
    const state = AppConfigService.getState();
    return AppConfigService.saveConfig({
      entries: state.entries,
      rules: state.rules.filter((rule) => rule.id !== ruleId),
    }, reason, actor);
  }

  public static reset(actor?: User | null): AppConfigSnapshot {
    return AppConfigService.saveConfig({ entries: [], rules: [] }, 'إعادة ضبط محرك التكوين', actor);
  }

  public static exportJson(actor?: User | null): string {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'settings.view');
    const state = AppConfigService.getState();
    return JSON.stringify({
      schemaVersion: APP_CONFIG_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: user.fullName,
      entries: state.entries,
      rules: state.rules,
    }, null, 2);
  }

  public static importJson(raw: string, actor?: User | null): AppConfigSnapshot {
    if (typeof raw !== 'string' || raw.length > 2_000_000) {
      throw new Error('ملف التكوين كبير جدًا أو غير صالح.');
    }
    const snapshot = parseAppConfigSnapshot(raw);
    return AppConfigService.saveConfig(snapshot, 'استيراد تكوين ديناميكي', actor);
  }

  public static getVersions(limit = 50, actor?: User | null): AppConfigVersion[] {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'audit.view');
    const bounded = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    const rows = AppConfigService.database().query<VersionRow>(
      `SELECT id, version, snapshot_json AS snapshotJson, created_by AS createdBy,
              created_by_name AS createdByName, reason, created_at AS createdAt
       FROM app_config_versions ORDER BY version DESC LIMIT ?`,
      [bounded],
    );
    return rows.map((row) => ({
      id: row.id,
      version: Number(row.version),
      snapshot: parseAppConfigSnapshot(row.snapshotJson),
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  }

  public static restoreVersion(versionId: string, actor?: User | null): AppConfigSnapshot {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'settings.update');
    const row = AppConfigService.database().query<VersionRow>(
      `SELECT id, version, snapshot_json AS snapshotJson, created_by AS createdBy,
              created_by_name AS createdByName, reason, created_at AS createdAt
       FROM app_config_versions WHERE id = ?`,
      [versionId],
    )[0];
    if (!row) throw new Error('إصدار التكوين غير موجود.');
    const snapshot = parseAppConfigSnapshot(row.snapshotJson);
    return AppConfigService.saveConfig(snapshot, `استعادة إصدار التكوين ${row.version}`, user);
  }
}
