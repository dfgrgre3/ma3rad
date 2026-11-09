// Central licensing & configuration client for the desktop app.
// Talks to the Central Super Admin platform over HTTPS.
// All operations are optional and never block local business operations.

import { authSession } from '../auth/session';
import { PermissionService } from '../auth/PermissionService';
import { APP_VERSION } from '../../config/appVersion';
import {
  readCachedCentralConfig,
  getCachedHiddenMenus,
  getCachedFeaturePermissions,
  getCachedDisabledPermissions,
  getCachedUsageLimits,
} from './centralConfigStore';

const CONFIG_KEY = 'central_cached_config';
const FIRST_RUN_ACTIVATION_KEY = 'central_first_run_activated';
const LAST_VALIDATED_KEY = 'central_last_validated_at';
// Offline tolerance: a device that has validated successfully may keep working
// without reaching the licensing server for this long. After that, the app
// fails closed until the license can be validated again.
const VALIDATION_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** يُطلَق عند وصول تكوين مركزي جديد حتى تُعيد الواجهة تقييم الحدود والصلاحيات. */
export const CENTRAL_CONFIG_CHANGED_EVENT = 'central-config-changed';

export interface CentralActivationResult {
  credentialStored?: boolean;
  tenantId?: string;
  localAccount?: { username: string; fullName?: string; role?: string; phone?: string } | null;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

/** بيانات تفعيل الجهاز: الحساب وكلمة المرور والهاتف المُنشأة من لوحة الإدارة + مفتاح الترخيص. */
export interface CentralActivationCredentials {
  activationCode: string;
  account: string;
  password: string;
  phone: string;
}

export interface CentralConfig {
  schemaVersion: number;
  configurationVersion: number;
  tenantId?: string;
  activityId?: string;
  activityType?: string;
  config: any;
  configJson?: string;
  signature?: string;
}

export class CentralLicenseService {
  /**
   * رقم مراجعة يزداد عند كل تغيّر فعلي في التكوين المركزي، فتستخدمه الواجهة
   * لإعادة تقييم الصلاحيات وإخفاء/إظهار الأزرار فورًا.
   */
  private static configRevision = 0;

  static getConfigRevision(): number {
    return CentralLicenseService.configRevision;
  }

  static async getServerUrl(): Promise<string> {
    const bridge = typeof window !== 'undefined' ? window.ceramisys?.central?.getServerUrl : undefined;
    if (!bridge) throw new Error('Central API configuration is available only through the secured Electron bridge.');
    return bridge();
  }

  /**
   * القاعدة الآمنة للاتصال بالمنصة المركزية: HTTPS إلزامي، ويُسمح بـ HTTP
   * فقط على هذا الجهاز (localhost) أثناء التطوير. أي رابط غير آمن يُرفض حتى
   * لا يُرسل رمز الجهاز (credential) عبر اتصال غير مشفّر.
   */
  static async getSecureServerUrl(): Promise<string> {
    return this.getServerUrl();
  }

  private static async request(
    path: string,
    init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string } = {}
  ): Promise<{ ok: boolean; status: number; json: () => Promise<any> }> {
    const bridge = typeof window !== 'undefined' ? window.ceramisys?.central?.request : undefined;
    if (!bridge) throw new Error('Central API is available only through the secured Electron bridge.');
    const result = await bridge({
      path,
      method: init.method || 'GET',
      headers: init.headers,
      body: init.body,
    });
    return { ok: result.ok, status: result.status, json: async () => result.body };
  }

  static async getStatus(): Promise<{ configured: boolean; activated: boolean }> {
    const central = typeof window !== 'undefined' ? window.ceramisys?.central : undefined;
    if (!central?.getStatus) throw new Error('Central API status is available only through the secured Electron bridge.');
    const legacyCredential = localStorage.getItem('central_device_credential');
    if (legacyCredential) {
      if (!central.migrateCredential) throw new Error('Secure migration for the legacy central credential is unavailable.');
      await central.migrateCredential(legacyCredential);
      localStorage.removeItem('central_device_credential');
    }
    localStorage.removeItem('central_server_url');
    return central.getStatus();
  }

  static async hasCredential(): Promise<boolean> {
    return (await this.getStatus()).activated;
  }

  private static cachedHwid = '';

  static async initHardwareBinding(): Promise<string> {
    try {
      if (typeof window !== 'undefined' && window.ceramisys?.license?.getHwid) {
        const hwid = await window.ceramisys.license.getHwid();
        if (hwid) {
          this.cachedHwid = hwid;
          localStorage.setItem('central_device_id', hwid);
          return hwid;
        }
      }
    } catch { /* fallback */ }
    return this.getDeviceId();
  }

  static getDeviceId(): string {
    if (this.cachedHwid) return this.cachedHwid;
    try {
      let id = localStorage.getItem('central_device_id');
      if (!id) { id = 'dev_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('central_device_id', id); }
      return id;
    } catch { return 'dev_unknown'; }
  }

  static async activate(credentials: CentralActivationCredentials, deviceName?: string): Promise<CentralActivationResult> {
    PermissionService.require(authSession.requireAuth(), 'ui.admin.license.manage', '/central-activation');
    return this.performActivation(credentials, deviceName);
  }

  static async activateFirstRun(credentials: CentralActivationCredentials, deviceName?: string): Promise<CentralActivationResult> {
    if (authSession.getCurrentUser() || await this.hasCredential()) {
      throw new Error('Initial activation is available only before a device account is activated.');
    }
    return this.performActivation(credentials, deviceName);
  }

  private static async performActivation(credentials: CentralActivationCredentials, deviceName?: string): Promise<CentralActivationResult> {
    const base = await this.getSecureServerUrl();
    if (!base) throw new Error('Central server URL not configured');
    const res = await this.request('/api/v1/licensing/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activationCode: credentials.activationCode,
        account: credentials.account,
        password: credentials.password,
        phone: credentials.phone,
        deviceId: this.getDeviceId(),
        deviceName: deviceName || navigator.userAgent.slice(0, 40),
        os: navigator.platform,
        appVersion: APP_VERSION,
        deviceRole: 'standalone',
      }),
    });
    const data: CentralActivationResult = await res.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid activation response');
    }
    if (!res.ok) throw new Error(data.message || data.error || 'activation_failed');
    if (data.credentialStored !== true) {
      throw new Error('The activation credential was not securely stored on this device.');
    }
    return data;
  }

  static async hasCompletedFirstRunActivation(): Promise<boolean> {
    return this.hasCredential();
  }

  static markFirstRunActivationComplete(): void {
    localStorage.setItem(FIRST_RUN_ACTIVATION_KEY, '1');
  }

  static async clearActivation(): Promise<void> {
    try {
      localStorage.removeItem(LAST_VALIDATED_KEY);
      localStorage.removeItem(FIRST_RUN_ACTIVATION_KEY);
    } catch {
      // The secure credential is still cleared through the main process below.
    }
    const bridge = typeof window !== 'undefined' ? window.ceramisys?.central?.clearCredential : undefined;
    if (!bridge) throw new Error('Central credential storage is unavailable through the secured Electron bridge.');
    await bridge();
  }

  private static getLastValidatedAt(): number {
    try {
      return Number(localStorage.getItem(LAST_VALIDATED_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private static markValidated(): void {
    try {
      localStorage.setItem(LAST_VALIDATED_KEY, String(Date.now()));
    } catch {
      // Ignore storage failures; in-memory enforcement still applies per call.
    }
  }

  /**
   * Server-side validation with a bounded offline grace period.
   * Fails closed when the credential is missing, rejected, or the grace period
   * has elapsed without a successful validation.
   */
  static async validate(): Promise<boolean> {
    if (typeof window !== 'undefined' && window.ceramisys?.license?.load) {
      try {
        const check = await window.ceramisys.license.load();
        if (!check.active && check.reason === 'hardware_mismatch_cloned') {
          console.error('License violation: Software cloning detected on unauthorized hardware.');
          return false;
        }
        if (!check.active && check.reason === 'clock_rollback_detected') {
          console.error('License violation: System clock rollback detected.');
          return false;
        }
      } catch { /* ignore */ }
    }
    const withinGrace = () => {
      const last = this.getLastValidatedAt();
      return last > 0 && Date.now() - last <= VALIDATION_GRACE_MS;
    };

    let status: { configured: boolean; activated: boolean };
    try {
      status = await this.getStatus();
    } catch (error) {
      console.error('Could not read the protected central activation state:', error);
      return false;
    }
    if (!status.configured || !status.activated) return false;

    try {
      const res = await this.request('/api/v1/licensing/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: this.getDeviceId() }),
      });
      if (res.ok) {
        this.markValidated();
        return true;
      }
      // A definitive rejection from the server revokes access immediately.
      if (res.status >= 400 && res.status < 500) {
        return false;
      }
      return withinGrace();
    } catch {
      // Transport failures may use only the bounded previously validated grace period.
      return withinGrace();
    }
  }

  static async heartbeat(): Promise<void> {
    try {
      const status = await this.getStatus();
      if (!status.configured || !status.activated) return;
      await this.request('/api/v1/licensing/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: this.getDeviceId(), appVersion: APP_VERSION }),
      });
    } catch (error) {
      console.warn('Central licensing heartbeat failed:', error);
    }
  }

  /**
   * بيانات المنشأة والفروع المخصّصة من الإدارة المركزية لهذا الجهاز.
   * تبقى كل استدعاءات الشبكة في هذا الملف وحده (سياسة الجهاز الواحد).
   */
  static async fetchEstablishment(): Promise<any | null> {
    try {
      const status = await this.getStatus();
      if (!status.configured || !status.activated) return null;
      const deviceId = this.getDeviceId();
      // رمز الجهاز يُرسل في الترويسات فقط ولا يظهر في عنوان URL (سجلات/وسطاء).
      const res = await this.request('/api/v1/configuration/establishment', {
        headers: { 'X-Device-Id': deviceId },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    } catch (error) {
      console.warn('Could not fetch central establishment configuration:', error);
      return null;
    }
  }

  /**
   * إرسال تقرير خطأ إلى القياس المركزي (best-effort).
   */
  static async postTelemetryError(payload: {
    deviceId?: string;
    title: string;
    description: string;
    stackTrace: string;
    issueType: string;
    severity: string;
  }): Promise<void> {
    try {
      const status = await this.getStatus();
      if (!status.configured) return;
      await this.request('/api/v1/telemetry/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: payload.deviceId || this.getDeviceId(),
          title: payload.title,
          description: payload.description,
          stackTrace: payload.stackTrace,
          issueType: payload.issueType,
          severity: payload.severity,
        }),
      });
    } catch (error) {
      console.warn('Could not post central telemetry error:', error);
    }
  }

  /**
   * جلب قائمة الإصدارات المنشورة من الإدارة المركزية.
   */
  static async fetchReleases(): Promise<any[]> {
    try {
      const status = await this.getStatus();
      if (!status.configured) return [];
      const res = await this.request('/api/v1/releases', {
        headers: status.activated ? { 'X-Device-Id': this.getDeviceId() } : {},
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('Could not fetch central releases:', error);
      return [];
    }
  }

  static async fetchPublicKey(): Promise<string | null> {
    const base = await this.getSecureServerUrl();
    if (!base) return null;
    try {
      const res = await this.request('/api/v1/configuration/public-key');
      if (!res.ok) return null;
      const data = await res.json();
      return data.publicKey || null;
    } catch { return null; }
  }

  static async verifyConfig(data: CentralConfig): Promise<boolean> {
    // Fail closed: a configuration is trusted only when it carries a signature
    // that verifies against the published public key. Unsigned, malformed or
    // unverifiable payloads are rejected outright instead of being accepted.
    if (!data || !data.config || typeof data.signature !== 'string' || !data.signature) return false;
    try {
      const pub = await this.fetchPublicKey();
      if (!pub) return false; // signed but unverifiable => fail closed
      const der = Uint8Array.from(atob(pub), c => c.charCodeAt(0));
      const key = await (crypto as any).subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);
      const sig = Uint8Array.from(atob(data.signature), c => c.charCodeAt(0));
      // Prefer the raw signed string when the server provides it (byte-exact).
      const signedString =
        typeof (data as any).configJson === 'string'
          ? (data as any).configJson
          : (typeof data.config === 'string' ? data.config : JSON.stringify(data.config));
      const payload = new TextEncoder().encode(signedString);
      const ok = await (crypto as any).subtle.verify('Ed25519', key, sig, payload);
      return ok === true;
    } catch {
      return false; // verification failure => fail closed
    }
  }

  static async fetchConfig(): Promise<CentralConfig | null> {
    try {
      const status = await this.getStatus();
      if (!status.configured || !status.activated) return null;
      // رمز الجهاز يُرسل في الترويسات فقط ولا يظهر في عنوان URL (سجلات/وسطاء).
      const res = await this.request('/api/v1/configuration/current', {
        headers: { 'X-Device-Id': this.getDeviceId() },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data) {
        // Signed configuration must verify before it can replace the cached copy.
        if (!(await this.verifyConfig(data))) return this.getCachedConfig();
        const previous = this.getCachedConfig();
        // لا نُشعر الواجهة إلا عند تغيّر فعلي، حتى لا تُعاد التقييمات بلا داعٍ
        // عند الاستقصاء القصير للتحديث الفوري.
        const changed = !previous || previous.configurationVersion !== data.configurationVersion;
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(data)); } catch { /* ignore */ }
        if (changed) {
          CentralLicenseService.configRevision += 1;
          try { this.notify(); } catch { /* ignore */ }
        }
      }
      return data;
    } catch { return this.getCachedConfig(); }
  }

  static getCachedConfig(): CentralConfig | null {
    // وضع التشغيل المحلي: لا نُطبّق أي تكوين مركزي قديم مخزَّن (قوائم/وحدات/صلاحيات).
    return readCachedCentralConfig() as CentralConfig | null;
  }

  private static listeners = new Set<(cfg: CentralConfig | null) => void>();

  static subscribe(listener: (cfg: CentralConfig | null) => void): () => void {
    this.listeners.add(listener);
    try { listener(this.getCachedConfig()); } catch { /* ignore */ }
    return () => { this.listeners.delete(listener); };
  }

  private static notify(): void {
    const cfg = this.getCachedConfig();
    for (const l of this.listeners) {
      try { l(cfg); } catch { /* ignore */ }
    }
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event(CENTRAL_CONFIG_CHANGED_EVENT));
      }
    } catch { /* ignore */ }
  }

  static getActivityType(): string | undefined {
    return this.getCachedConfig()?.activityType || this.getCachedConfig()?.config?.activityType;
  }

  static getAllowedModules(): string[] | null {
    const cfg = this.getCachedConfig();
    const m = cfg?.config?.allowedModules;
    return Array.isArray(m) ? (m as string[]) : null;
  }

  static getHiddenMenus(): string[] {
    return getCachedHiddenMenus();
  }

  static getFeaturePermissions(): any[] {
    return getCachedFeaturePermissions();
  }

  static getUsageLimits(): Record<string, any> {
    return getCachedUsageLimits();
  }
  /** أكواد الصلاحيات/الأزرار المعطّلة من منصة الإدارة المركزية لهذا الترخيص. */
  static getDisabledPermissions(): string[] {
    return getCachedDisabledPermissions();
  }
  static async isConfigured(): Promise<boolean> {
    return (await this.getStatus()).configured;
  }
}
