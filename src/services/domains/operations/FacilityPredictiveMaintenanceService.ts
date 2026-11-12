import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import { localDateString } from '../../../utils/shared/date';

export type HealthStatus = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
export type TriggerType = 'VIBRATION' | 'TEMPERATURE' | 'PRESSURE' | 'NOISE' | 'OIL_QUALITY' | 'LEAK' | 'HEAT' | 'HOURS' | 'CYCLES' | 'OTHER';
export type TriggerSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ActivationStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'FALSE_POSITIVE';
export type PredictionStatus = 'ACTIVE' | 'VALIDATED' | 'INVALIDATED' | 'EXPIRED';

export interface AssetHealth {
  id: string;
  assetId: string;
  assetName: string;
  locationId: string;
  locationName: string;
  branchId: string;
  branchName: string;
  healthCheckDate: string;
  healthScore: number;
  healthStatus: HealthStatus;
  vibrationLevel: number | null;
  temperatureLevel: number | null;
  pressureLevel: number | null;
  noiseLevel: number | null;
  oilQuality: string | null;
  leakDetected: boolean;
  abnormalHeat: boolean;
  unusualVibration: boolean;
  notes: string | null;
  checkedBy: string;
  checkedByName: string;
  checkedAt: string;
}

export interface AssetHealthInput {
  assetId: string;
  locationId: string;
  healthCheckDate: string;
  healthScore: number;
  healthStatus: HealthStatus;
  vibrationLevel?: number | null;
  temperatureLevel?: number | null;
  pressureLevel?: number | null;
  noiseLevel?: number | null;
  oilQuality?: string | null;
  leakDetected?: boolean;
  abnormalHeat?: boolean;
  unusualVibration?: boolean;
  notes?: string | null;
}

export interface ConditionTrigger {
  id: string;
  triggerCode: string;
  triggerName: string;
  assetId: string;
  assetName: string;
  triggerType: TriggerType;
  thresholdValue: number;
  comparisonOperator: string;
  severity: TriggerSeverity;
  isActive: boolean;
  autoCreateWorkOrder: boolean;
  notificationEmails: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConditionTriggerInput {
  assetId: string;
  triggerName: string;
  triggerType: TriggerType;
  thresholdValue: number;
  comparisonOperator: string;
  severity: TriggerSeverity;
  isActive?: boolean;
  autoCreateWorkOrder?: boolean;
  notificationEmails?: string | null;
}

export interface ConditionActivation {
  id: string;
  triggerId: string;
  triggerName: string;
  assetId: string;
  assetName: string;
  activationDate: string;
  measuredValue: number;
  thresholdValue: number;
  severity: TriggerSeverity;
  workOrderId: string | null;
  workOrderNumber: string | null;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  resolutionNotes: string | null;
  status: ActivationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ConditionActivationInput {
  triggerId: string;
  assetId: string;
  activationDate: string;
  measuredValue: number;
  severity: TriggerSeverity;
  workOrderId?: string | null;
  resolutionNotes?: string | null;
}

export interface FailurePrediction {
  id: string;
  assetId: string;
  assetName: string;
  predictionDate: string;
  modelName: string;
  modelVersion: string | null;
  failureProbability: number;
  predictedFailureDate: string | null;
  confidenceLevel: number;
  contributingFactors: string | null;
  recommendedAction: string | null;
  predictedRemainingUsefulLifeDays: number | null;
  status: PredictionStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FailurePredictionInput {
  assetId: string;
  predictionDate: string;
  modelName: string;
  modelVersion?: string | null;
  failureProbability: number;
  predictedFailureDate?: string | null;
  confidenceLevel?: number;
  contributingFactors?: string | null;
  recommendedAction?: string | null;
  predictedRemainingUsefulLifeDays?: number | null;
  status?: PredictionStatus;
}

export interface RULTracking {
  id: string;
  assetId: string;
  assetName: string;
  trackingDate: string;
  currentRulDays: number;
  predictedRulDays: number;
  deteriorationRate: number;
  maintenanceImpactDays: number;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface RULTrackingInput {
  assetId: string;
  trackingDate: string;
  currentRulDays: number;
  predictedRulDays: number;
  deteriorationRate?: number;
  maintenanceImpactDays?: number;
  notes?: string | null;
}

export interface PredictiveMaintenanceStats {
  totalAssetsMonitored: number;
  criticalHealthAssets: number;
  poorHealthAssets: number;
  activeTriggers: number;
  openActivations: number;
  acknowledgedActivations: number;
  activePredictions: number;
  highRiskPredictions: number;
  avgHealthScore: number;
  assetsByHealthStatus: Array<{ status: string; count: number }>;
  activationsBySeverity: Array<{ severity: string; count: number }>;
}

const _MAX_DATE = '9999-12-31';

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export class FacilityPredictiveMaintenanceService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static notification = new NotificationService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'operations.view', 'facility_management.view',
    ]);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'operations.update', 'facility_management.manage',
    ]);
    return actor;
  }

  private static currentCompanyId(actor = AuthService.requireAuth()): string {
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const row = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!row?.companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة.');
    return row.companyId;
  }

  /* ========== Asset Health ========== */

  static getAssetHealth(): AssetHealth[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ah.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT ah.id, ah.asset_id AS assetId, fa.name AS assetName,
              ah.location_id AS locationId, fl.name AS locationName,
              ah.branch_id AS branchId, b.name AS branchName,
              ah.health_check_date AS healthCheckDate, ah.health_score AS healthScore,
              ah.health_status AS healthStatus, ah.vibration_level AS vibrationLevel,
              ah.temperature_level AS temperatureLevel, ah.pressure_level AS pressureLevel,
              ah.noise_level AS noiseLevel, ah.oil_quality AS oilQuality,
              ah.leak_detected AS leakDetected, ah.abnormal_heat AS abnormalHeat,
              ah.unusual_vibration AS unusualVibration, ah.notes,
              ah.checked_by AS checkedBy, u.full_name AS checkedByName,
              ah.checked_at AS checkedAt
       FROM facility_asset_health ah
       JOIN facility_assets fa ON fa.id = ah.asset_id
       JOIN facility_locations fl ON fl.id = ah.location_id
       JOIN branches b ON b.id = ah.branch_id
       LEFT JOIN users u ON u.id = ah.checked_by
       WHERE ah.company_id = ? AND ${scope.clause}
       ORDER BY ah.health_check_date DESC`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      healthStatus: row.health_status as HealthStatus,
      leakDetected: Boolean(row.leak_detected),
      abnormalHeat: Boolean(row.abnormal_heat),
      unusualVibration: Boolean(row.unusual_vibration),
    }));
  }

  static createAssetHealth(input: AssetHealthInput): AssetHealth {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const asset = this.db.query<{ id: string; name: string; location_id: string; branch_id: string }>(
      `SELECT fa.id, fa.name, fa.location_id AS locationId, fa.branch_id AS branchId
       FROM facility_assets fa
       WHERE fa.id = ? AND fa.company_id = ?`,
      [input.assetId, companyId]
    )[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    const location = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    if (input.healthScore < 0 || input.healthScore > 100) {
      throw new Error('النقاط الصحية يجب أن تكون بين 0 و 100.');
    }
    if (!isValidDate(input.healthCheckDate)) throw new Error('تاريخ الفحص الصحي غير صالح.');
    const id = `ah_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_asset_health
         (id, asset_id, location_id, branch_id, health_check_date, health_score,
          health_status, vibration_level, temperature_level, pressure_level,
          noise_level, oil_quality, leak_detected, abnormal_heat, unusual_vibration,
          notes, checked_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.assetId, input.locationId, asset.branch_id, input.healthCheckDate,
        input.healthScore, input.healthStatus, input.vibrationLevel || null,
        input.temperatureLevel || null, input.pressureLevel || null,
        input.noiseLevel || null, input.oilQuality || null,
        input.leakDetected ? 1 : 0, input.abnormalHeat ? 1 : 0,
        input.unusualVibration ? 1 : 0, input.notes || null, actor.id]
    );
    this.auditActor(actor, 'إضافة فحص صحة أصل', id, {
      assetId: input.assetId, healthScore: input.healthScore, healthStatus: input.healthStatus,
    });
    // Notify if critical health
    if (input.healthStatus === 'CRITICAL') {
      this.notification.createNotification(
        'SYSTEM', 'أصل بصحة حرجة',
        `أصل "${asset.name}" بصحة حرجة (نقاط: ${input.healthScore})`,
        actor.id, 'PREDICTIVE_MAINTENANCE', `${id}:critical`
      );
    }
    return this.getAssetHealthItem(id)!;
  }

  private static getAssetHealthItem(id: string): AssetHealth | null {
    const items = this.getAssetHealth().filter((i) => i.id === id);
    return items[0] ?? null;
  }

  /* ========== Condition Triggers ========== */

  static getConditionTriggers(): ConditionTrigger[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ct.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT ct.id, ct.trigger_code AS triggerCode, ct.trigger_name AS triggerName,
              ct.asset_id AS assetId, fa.name AS assetName,
              ct.trigger_type AS triggerType, ct.threshold_value AS thresholdValue,
              ct.comparison_operator AS comparisonOperator, ct.severity,
              ct.is_active AS isActive, ct.auto_create_work_order AS autoCreateWorkOrder,
              ct.notification_emails AS notificationEmails,
              ct.created_by AS createdBy, u.full_name AS createdByName,
              ct.created_at AS createdAt, ct.updated_at AS updatedAt
       FROM facility_condition_triggers ct
       JOIN facility_assets fa ON fa.id = ct.asset_id
       LEFT JOIN users u ON u.id = ct.created_by
       WHERE ct.company_id = ? AND ${scope.clause}
       ORDER BY ct.trigger_name`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      triggerType: row.trigger_type as TriggerType,
      comparisonOperator: row.comparison_operator as string,
      severity: row.severity as TriggerSeverity,
      isActive: Boolean(row.is_active),
      autoCreateWorkOrder: Boolean(row.auto_create_work_order),
    }));
  }

  static createConditionTrigger(input: ConditionTriggerInput): ConditionTrigger {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const asset = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM facility_assets WHERE id = ? AND company_id = ?',
      [input.assetId, companyId]
    )[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    if (!input.triggerName?.trim()) throw new Error('اسم المشغل مطلوب.');
    if (!['GT', 'LT', 'EQ', 'GTE', 'LTE'].includes(input.comparisonOperator)) {
      throw new Error('عامل المقارنة غير صالح.');
    }
    const triggerCode = `CT-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `ct_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_condition_triggers
         (id, trigger_code, trigger_name, asset_id, trigger_type, threshold_value,
          comparison_operator, severity, is_active, auto_create_work_order,
          notification_emails, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, triggerCode, input.triggerName.trim(), input.assetId, input.triggerType,
        input.thresholdValue, input.comparisonOperator, input.severity,
        input.isActive !== false ? 1 : 0, input.autoCreateWorkOrder ? 1 : 0,
        input.notificationEmails || null, actor.id]
    );
    this.auditActor(actor, 'إضافة مشغل حالة', id, {
      triggerCode, triggerName: input.triggerName, triggerType: input.triggerType,
    });
    return this.getConditionTrigger(id)!;
  }

  private static getConditionTrigger(id: string): ConditionTrigger | null {
    const triggers = this.getConditionTriggers().filter((t) => t.id === id);
    return triggers[0] ?? null;
  }

  /* ========== Condition Activations ========== */

  static getConditionActivations(): ConditionActivation[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ca.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT ca.id, ca.trigger_id AS triggerId, ct.trigger_name AS triggerName,
              ca.asset_id AS assetId, fa.name AS assetName,
              ca.activation_date AS activationDate, ca.measured_value AS measuredValue,
              ca.threshold_value AS thresholdValue, ca.severity,
              ca.work_order_id AS workOrderId, wo.work_order_number AS workOrderNumber,
              ca.acknowledged, ca.acknowledged_by AS acknowledgedBy,
              u.full_name AS acknowledgedByName, ca.acknowledged_at AS acknowledgedAt,
              ca.resolution_notes AS resolutionNotes, ca.status,
              ca.created_at AS createdAt, ca.updated_at AS updatedAt
       FROM facility_condition_activations ca
       JOIN facility_condition_triggers ct ON ct.id = ca.trigger_id
       JOIN facility_assets fa ON fa.id = ca.asset_id
       LEFT JOIN facility_work_orders wo ON wo.id = ca.work_order_id
       LEFT JOIN users u ON u.id = ca.acknowledged_by
       WHERE ca.company_id = ? AND ${scope.clause}
       ORDER BY ca.activation_date DESC`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      severity: row.severity as TriggerSeverity,
      acknowledged: Boolean(row.acknowledged),
      status: row.status as ActivationStatus,
      acknowledgedByName: row.acknowledged_by_name || null,
    }));
  }

  static createConditionActivation(input: ConditionActivationInput): ConditionActivation {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const trigger = this.db.query<{ id: string; trigger_name: string; asset_id: string }>(
      `SELECT ct.id, ct.trigger_name AS triggerName, ct.asset_id AS assetId
       FROM facility_condition_triggers ct
       WHERE ct.id = ? AND ct.company_id = ?`,
      [input.triggerId, companyId]
    )[0];
    if (!trigger) throw new Error('المشغل غير موجود.');
    if (!isValidDate(input.activationDate)) throw new Error('تاريخ التفعيل غير صالح.');
    const id = `ca_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_condition_activations
         (id, trigger_id, asset_id, activation_date, measured_value, threshold_value,
          severity, work_order_id, resolution_notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [id, input.triggerId, input.assetId, input.activationDate, input.measuredValue,
        0, input.severity, input.workOrderId || null, input.resolutionNotes || null]
    );
    this.auditActor(actor, 'تفعيل مشغل حالة', id, {
      triggerId: input.triggerId, measuredValue: input.measuredValue, severity: input.severity,
    });
    // Notify if critical severity
    if (input.severity === 'CRITICAL') {
      this.notification.createNotification(
        'SYSTEM', 'تنبيه حالة حرجة',
        `تم تفعيل مشغل حالة حرجة: "${trigger.trigger_name}" للأصل "${trigger.asset_id}"`,
        actor.id, 'PREDICTIVE_MAINTENANCE', `${id}:critical`
      );
    }
    return this.getConditionActivation(id)!;
  }

  private static getConditionActivation(id: string): ConditionActivation | null {
    const activations = this.getConditionActivations().filter((a) => a.id === id);
    return activations[0] ?? null;
  }

  static acknowledgeActivation(id: string, acknowledgedByNote?: string | null): ConditionActivation {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const activation = this.db.query<{ id: string }>(
      `SELECT ca.id FROM facility_condition_activations ca
       JOIN facility_condition_triggers ct ON ct.id = ca.trigger_id
       WHERE ca.id = ? AND ct.company_id = ?`,
      [id, companyId]
    )[0];
    if (!activation) throw new Error('تفعيل الحالة غير موجود.');
    this.db.run(
      `UPDATE facility_condition_activations
       SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [actor.id, localDateString(), id]
    );
    this.auditActor(actor, 'اعتماد تفعيل حالة', id, { acknowledgedByNote });
    return this.getConditionActivation(id)!;
  }

  /* ========== Failure Predictions ========== */

  static getFailurePredictions(): FailurePrediction[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('fp.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT fp.id, fp.asset_id AS assetId, fa.name AS assetName,
              fp.prediction_date AS predictionDate, fp.model_name AS modelName,
              fp.model_version AS modelVersion, fp.failure_probability AS failureProbability,
              fp.predicted_failure_date AS predictedFailureDate, fp.confidence_level AS confidenceLevel,
              fp.contributing_factors AS contributingFactors, fp.recommended_action AS recommendedAction,
              fp.predicted_remaining_useful_life_days AS predictedRemainingUsefulLifeDays,
              fp.status, fp.created_by AS createdBy, u.full_name AS createdByName,
              fp.created_at AS createdAt, fp.updated_at AS updatedAt
       FROM facility_failure_predictions fp
       JOIN facility_assets fa ON fa.id = fp.asset_id
       LEFT JOIN users u ON u.id = fp.created_by
       WHERE fp.company_id = ? AND ${scope.clause}
       ORDER BY fp.prediction_date DESC`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      status: row.status as PredictionStatus,
    }));
  }

  static createFailurePrediction(input: FailurePredictionInput): FailurePrediction {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const asset = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM facility_assets WHERE id = ? AND company_id = ?',
      [input.assetId, companyId]
    )[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    if (!input.modelName?.trim()) throw new Error('اسم النموذج مطلوب.');
    if (input.failureProbability < 0 || input.failureProbability > 1) {
      throw new Error('احتمالية الفشل يجب أن تكون بين 0 و 1.');
    }
    if (input.confidenceLevel !== undefined && (input.confidenceLevel < 0 || input.confidenceLevel > 1)) {
      throw new Error('مستوى الثقة يجب أن يكون بين 0 و 1.');
    }
    const id = `fp_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_failure_predictions
         (id, asset_id, prediction_date, model_name, model_version,
          failure_probability, predicted_failure_date, confidence_level,
          contributing_factors, recommended_action, predicted_remaining_useful_life_days,
          status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.assetId, input.predictionDate, input.modelName.trim(),
        input.modelVersion || null, input.failureProbability,
        input.predictedFailureDate || null, input.confidenceLevel ?? 0,
        input.contributingFactors || null, input.recommendedAction || null,
        input.predictedRemainingUsefulLifeDays || null, input.status ?? 'ACTIVE', actor.id]
    );
    this.auditActor(actor, 'إضافة توقع فشل', id, {
      assetId: input.assetId, modelName: input.modelName, failureProbability: input.failureProbability,
    });
    return this.getFailurePrediction(id)!;
  }

  private static getFailurePrediction(id: string): FailurePrediction | null {
    const predictions = this.getFailurePredictions().filter((p) => p.id === id);
    return predictions[0] ?? null;
  }

  /* ========== RUL Tracking ========== */

  static getRULTracking(): RULTracking[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('r.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT r.id, r.asset_id AS assetId, fa.name AS assetName,
              r.tracking_date AS trackingDate, r.current_rul_days AS currentRulDays,
              r.predicted_rul_days AS predictedRulDays, r.deterioration_rate AS deteriorationRate,
              r.maintenance_impact_days AS maintenanceImpactDays, r.notes,
              r.created_by AS createdBy, u.full_name AS createdByName,
              r.created_at AS createdAt, r.updated_at AS updatedAt
       FROM facility_rul_tracking r
       JOIN facility_assets fa ON fa.id = r.asset_id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.company_id = ? AND ${scope.clause}
       ORDER BY r.tracking_date DESC`,
      [companyId, ...scope.params]
    );
    return rows;
  }

  static createRULTracking(input: RULTrackingInput): RULTracking {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const asset = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM facility_assets WHERE id = ? AND company_id = ?',
      [input.assetId, companyId]
    )[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    if (!isValidDate(input.trackingDate)) throw new Error('تاريخ التتبع غير صالح.');
    if (input.currentRulDays < 0 || input.predictedRulDays < 0) {
      throw new Error('أيام العمر الافتراضي المتبقي يجب أن تكون غير سالبة.');
    }
    const id = `rul_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_rul_tracking
         (id, asset_id, tracking_date, current_rul_days, predicted_rul_days,
          deterioration_rate, maintenance_impact_days, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.assetId, input.trackingDate, input.currentRulDays,
        input.predictedRulDays, input.deteriorationRate ?? 0,
        input.maintenanceImpactDays ?? 0, input.notes || null, actor.id]
    );
    this.auditActor(actor, 'إضافة تتبع العمر الافتراضي المتبقي', id, {
      assetId: input.assetId, currentRulDays: input.currentRulDays, predictedRulDays: input.predictedRulDays,
    });
    return this.getRULTrackingItem(id)!;
  }

  private static getRULTrackingItem(id: string): RULTracking | null {
    const items = this.getRULTracking().filter((i) => i.id === id);
    return items[0] ?? null;
  }

  /* ========== Stats ========== */

  static getPredictiveMaintenanceStats(): PredictiveMaintenanceStats {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const _scope = this.branchAccess.sqlScope('ah.branch_id', undefined, actor);
    const totalAssetsMonitored = this.db.query<{ count: number }>(
      `SELECT COUNT(DISTINCT asset_id) AS count FROM facility_asset_health WHERE company_id = ?`,
      [companyId]
    )[0]?.count ?? 0;
    const criticalHealthAssets = this.db.query<{ count: number }>(
      `SELECT COUNT(DISTINCT asset_id) AS count FROM facility_asset_health WHERE company_id = ? AND health_status = 'CRITICAL'`,
      [companyId]
    )[0]?.count ?? 0;
    const poorHealthAssets = this.db.query<{ count: number }>(
      `SELECT COUNT(DISTINCT asset_id) AS count FROM facility_asset_health WHERE company_id = ? AND health_status = 'POOR'`,
      [companyId]
    )[0]?.count ?? 0;
    const activeTriggers = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_condition_triggers WHERE company_id = ? AND is_active = 1`,
      [companyId]
    )[0]?.count ?? 0;
    const openActivations = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_condition_activations WHERE company_id = ? AND status = 'OPEN'`,
      [companyId]
    )[0]?.count ?? 0;
    const acknowledgedActivations = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_condition_activations WHERE company_id = ? AND acknowledged = 1`,
      [companyId]
    )[0]?.count ?? 0;
    const activePredictions = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_failure_predictions WHERE company_id = ? AND status = 'ACTIVE'`,
      [companyId]
    )[0]?.count ?? 0;
    const highRiskPredictions = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_failure_predictions WHERE company_id = ? AND status = 'ACTIVE' AND failure_probability >= 0.7`,
      [companyId]
    )[0]?.count ?? 0;
    const avgHealthScore = this.db.query<{ avg: number }>(
      `SELECT AVG(health_score) AS avg FROM facility_asset_health WHERE company_id = ?`,
      [companyId]
    )[0]?.avg ?? 0;
    const assetsByHealthStatus = this.db.query<any>(
      `SELECT health_status AS status, COUNT(DISTINCT asset_id) AS count
       FROM facility_asset_health WHERE company_id = ? GROUP BY health_status`,
      [companyId]
    );
    const activationsBySeverity = this.db.query<any>(
      `SELECT severity, COUNT(*) AS count FROM facility_condition_activations WHERE company_id = ? GROUP BY severity`,
      [companyId]
    );
    return {
      totalAssetsMonitored: Number(totalAssetsMonitored),
      criticalHealthAssets: Number(criticalHealthAssets),
      poorHealthAssets: Number(poorHealthAssets),
      activeTriggers: Number(activeTriggers),
      openActivations: Number(openActivations),
      acknowledgedActivations: Number(acknowledgedActivations),
      activePredictions: Number(activePredictions),
      highRiskPredictions: Number(highRiskPredictions),
      avgHealthScore: roundNumber(Number(avgHealthScore) || 0),
      assetsByHealthStatus: assetsByHealthStatus.map((row) => ({ status: row.status, count: Number(row.count) })),
      activationsBySeverity: activationsBySeverity.map((row) => ({ severity: row.severity, count: Number(row.count) })),
    };
  }

  /* ========== Helpers ========== */

  private static auditActor(actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }
}
