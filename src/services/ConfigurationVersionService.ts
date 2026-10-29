import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { parseBusinessConfiguration, parseEnabledModules } from '../config/businessProfiles';
import { AuthService } from './AuthService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { PermissionService } from './PermissionService';
import { SettingsService } from './SettingsService';
import { TerminologyService } from './TerminologyService';
import type { User } from '../types';

export interface ActivityConfigurationSnapshot {
  schemaVersion: 1;
  businessType: string;
  businessTypeLabel: string;
  configuration: ReturnType<typeof parseBusinessConfiguration>;
  enabledModules: string[];
  terminologyOverrides: ReturnType<typeof TerminologyService.getOverrides>;
}

export interface ActivityConfigurationVersion {
  id: string;
  version: number;
  snapshot: ActivityConfigurationSnapshot;
  createdBy: string;
  createdByName: string;
  reason: string;
  createdAt: string;
}

type VersionRow = {
  id: string;
  version: number;
  snapshotJson: string;
  createdBy: string;
  createdByName: string;
  reason: string;
  createdAt: string;
};

export class ConfigurationVersionService {
  private static database() {
    return DatabaseManager.getInstance();
  }

  private static createSnapshot(): ActivityConfigurationSnapshot {
    const businessType = SettingsService.getValue('businessType') || 'general';
    const enabledModules = ModuleRegistryService.getEnabledModuleIds();
    return {
      schemaVersion: 1,
      businessType,
      businessTypeLabel: SettingsService.getValue('businessTypeLabel') || '',
      configuration: parseBusinessConfiguration(
        SettingsService.getValue('businessProfileConfig'),
        businessType,
      ),
      enabledModules: [...new Set(enabledModules)].sort(),
      terminologyOverrides: TerminologyService.getOverrides(),
    };
  }

  private static parseSnapshot(raw: string): ActivityConfigurationSnapshot {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`تعذر قراءة إصدار تكوين محفوظ: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('إصدار التكوين المحفوظ ليس كائنًا صالحًا.');
    }
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 1 || typeof record.businessType !== 'string') {
      throw new Error('إصدار التكوين المحفوظ يستخدم مخططًا غير مدعوم.');
    }
    if (!record.configuration || typeof record.configuration !== 'object' || Array.isArray(record.configuration)
      || !Array.isArray(record.enabledModules)
      || !record.terminologyOverrides || typeof record.terminologyOverrides !== 'object'
      || Array.isArray(record.terminologyOverrides)) {
      throw new Error('إصدار التكوين المحفوظ يفتقد بيانات إلزامية.');
    }
    const businessType = record.businessType;
    const configuration = parseBusinessConfiguration(
      JSON.stringify(record.configuration),
      businessType,
    );
    const modules = Array.isArray(record.enabledModules)
      ? record.enabledModules.filter((id): id is string => typeof id === 'string')
      : parseEnabledModules(undefined, businessType);
    const validatedModules = ModuleRegistryService.validate(
      modules,
      { trackInventory: configuration.trackInventory },
    );
    if (validatedModules.errors.length > 0) {
      throw new Error(`إصدار التكوين يحتوي وحدات غير صالحة: ${validatedModules.errors.join(' ')}`);
    }

    return {
      schemaVersion: 1,
      businessType,
      businessTypeLabel: typeof record.businessTypeLabel === 'string' ? record.businessTypeLabel : '',
      configuration,
      enabledModules: validatedModules.enabled,
      terminologyOverrides: TerminologyService.validateOverrides(record.terminologyOverrides || {}),
    };
  }

  private static fromRow(row: VersionRow): ActivityConfigurationVersion {
    return {
      id: row.id,
      version: Number(row.version),
      snapshot: ConfigurationVersionService.parseSnapshot(row.snapshotJson),
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }

  public static recordCurrent(reason: string, actor?: User | null): ActivityConfigurationVersion | null {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'settings.update');
    const snapshot = ConfigurationVersionService.createSnapshot();
    const snapshotJson = JSON.stringify(snapshot);
    const db = ConfigurationVersionService.database();
    const latest = db.query<{ snapshotJson: string }>(
      `SELECT snapshot_json AS snapshotJson
       FROM activity_configuration_versions ORDER BY version DESC LIMIT 1`
    )[0];
    if (latest?.snapshotJson === snapshotJson) return null;

    let result: ActivityConfigurationVersion | null = null;
    db.executeTransaction((tx) => {
      const version = Number(tx.query<{ version: number }>(
        'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM activity_configuration_versions'
      )[0]?.version || 1);
      const id = `acv_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
      const createdAt = new Date().toISOString();
      tx.run(
        `INSERT INTO activity_configuration_versions
          (id, version, snapshot_json, created_by, created_by_name, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, version, snapshotJson, user.id, user.fullName, reason.trim() || 'تحديث التكوين', createdAt],
      );
      result = ConfigurationVersionService.fromRow({
        id,
        version,
        snapshotJson,
        createdBy: user.id,
        createdByName: user.fullName,
        reason: reason.trim() || 'تحديث التكوين',
        createdAt,
      });
    });
    return result;
  }

  public static getVersions(actor?: User | null, limit = 50): ActivityConfigurationVersion[] {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'audit.view');
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    return ConfigurationVersionService.database()
      .query<VersionRow>(
        `SELECT id, version, snapshot_json AS snapshotJson, created_by AS createdBy,
                created_by_name AS createdByName, reason, created_at AS createdAt
         FROM activity_configuration_versions
         ORDER BY version DESC LIMIT ?`,
        [boundedLimit],
      )
      .map(ConfigurationVersionService.fromRow);
  }
}
