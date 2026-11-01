// Central licensing & configuration client for the desktop app.
// Talks to the Central Super Admin platform over HTTPS.
// All operations are optional and never block local business operations.

import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BYPASS_FIRST_RUN_SETUP } from '../config/setupLifecycle';

const STORAGE_KEY = 'central_device_credential';
const SERVER_KEY = 'central_server_url';
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
  deviceCredential?: string;
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

  static getServerUrl(): string {
    try { return localStorage.getItem(SERVER_KEY) || 'http://localhost:4000'; } catch { return 'http://localhost:4000'; }
  }

  /**
   * القاعدة الآمنة للاتصال بالمنصة المركزية: HTTPS إلزامي، ويُسمح بـ HTTP
   * فقط على هذا الجهاز (localhost) أثناء التطوير. أي رابط غير آمن يُرفض حتى
   * لا يُرسل رمز الجهاز (credential) عبر اتصال غير مشفّر.
   */
  static getSecureServerUrl(): string {
    const base = CentralLicenseService.getServerUrl().trim().replace(/\/+$/, '');
    if (!base) return '';
    try {
      const url = new URL(base);
      const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
      if (url.protocol === 'https:') return base;
      if (url.protocol === 'http:' && localHosts.has(url.hostname)) return base;
    } catch {
      return '';
    }
    return '';
  }

  static setServerUrl(url: string) {
    const normalized = String(url || '').trim().replace(/\/+$/, '');
    if (!normalized) {
      localStorage.setItem(SERVER_KEY, '');
      return;
    }
    const previous = CentralLicenseService.getServerUrl();
    try {
      localStorage.setItem(SERVER_KEY, normalized);
      if (!CentralLicenseService.getSecureServerUrl()) {
        throw new Error('رابط المنصة المركزية يجب أن يبدأ بـ https:// (يُسمح بـ http://localhost للتطوير فقط).');
      }
    } catch (error) {
      try { localStorage.setItem(SERVER_KEY, previous); } catch { /* ignore */ }
      throw error;
    }
  }

  private static async request(
    path: string,
    init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string } = {}
  ): Promise<{ ok: boolean; status: number; json: () => Promise<any> }> {
    const bridge = typeof window !== 'undefined' ? window.ceramisys?.central?.request : undefined;
    if (!bridge) throw new Error('Central API is available only through the secured Electron bridge.');
    const result = await bridge({
      serverUrl: this.getSecureServerUrl(),
      path,
      method: init.method || 'GET',
      headers: init.headers,
      body: init.body,
    });
    return { ok: result.ok, status: result.status, json: async () => result.body };
  }

  static getCredential(): string {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  }
  static setCredential(cred: string) {
    localStorage.setItem(STORAGE_KEY, cred);
  }
  static getDeviceId(): string {
    try {
      let id = localStorage.getItem('central_device_id');
      if (!id) { id = 'dev_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('central_device_id', id); }
      return id;
    } catch { return 'dev_unknown'; }
  }

  static async activate(credentials: CentralActivationCredentials, deviceName?: string): Promise<CentralActivationResult> {
    PermissionService.require(AuthService.requireAuth(), 'admin.license.manage', '/central-activation');
    return this.performActivation(credentials, deviceName);
  }

  static async activateFirstRun(credentials: CentralActivationCredentials, deviceName?: string): Promise<CentralActivationResult> {
    if (AuthService.getCurrentUser() || this.getCredential()) {
      throw new Error('Initial activation is available only before a device account is activated.');
    }
    return this.performActivation(credentials, deviceName);
  }

  private static async performActivation(credentials: CentralActivationCredentials, deviceName?: string): Promise<CentralActivationResult> {
    const base = this.getSecureServerUrl();
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
        appVersion: '1.1.3',
        deviceRole: 'standalone',
      }),
    });
    const data: CentralActivationResult = await res.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid activation response');
    }
    if (!res.ok) throw new Error(data.message || data.error || 'activation_failed');
    if (typeof data.deviceCredential === 'string' && data.deviceCredential) {
      this.setCredential(data.deviceCredential);
    }
    return data;
  }

  static hasCompletedFirstRunActivation(): boolean {
    // The credential is the only proof of activation. A leftover UI flag must
    // never unlock the app after the credential has been removed.
    return !!this.getCredential();
  }

  static markFirstRunActivationComplete(): void {
    localStorage.setItem(FIRST_RUN_ACTIVATION_KEY, '1');
  }

  static clearActivation(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LAST_VALIDATED_KEY);
      localStorage.removeItem(FIRST_RUN_ACTIVATION_KEY);
    } catch {
      // Storage unavailability is handled by the activation gate.
    }
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
    const base = this.getSecureServerUrl();
    const cred = this.getCredential();
    if (!base || !cred) return false;

    const withinGrace = () => {
      const last = this.getLastValidatedAt();
      return last > 0 && Date.now() - last <= VALIDATION_GRACE_MS;
    };

    try {
      const res = await this.request('/api/v1/licensing/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: this.getDeviceId(), deviceCredential: cred }),
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
      // Network failure: allow only within the validated grace window.
      return withinGrace();
    }
  }

  static async heartbeat(): Promise<void> {
    const base = this.getSecureServerUrl();
    const cred = this.getCredential();
    if (!base || !cred) return;
    try {
      await this.request('/api/v1/licensing/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: this.getDeviceId(), deviceCredential: cred, appVersion: '1.1.3' }),
      });
    } catch { /* ignore */ }
  }

  /**
   * بيانات المنشأة والفروع المخصّصة من الإدارة المركزية لهذا الجهاز.
   * تبقى كل استدعاءات الشبكة في هذا الملف وحده (سياسة الجهاز الواحد).
   */
  static async fetchEstablishment(): Promise<any | null> {
    const base = this.getSecureServerUrl();
    const credential = this.getCredential();
    const deviceId = this.getDeviceId();
    if (!base || !credential) return null;
    try {
      // رمز الجهاز يُرسل في الترويسات فقط ولا يظهر في عنوان URL (سجلات/وسطاء).
      const res = await this.request('/api/v1/configuration/establishment', {
        headers: { 'X-Device-Id': deviceId, 'X-Device-Credential': credential },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    } catch {
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
    const base = this.getSecureServerUrl();
    if (!base) return;
    try {
      await this.request('/api/v1/telemetry/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: payload.deviceId || this.getDeviceId(),
          deviceCredential: this.getCredential(),
          title: payload.title,
          description: payload.description,
          stackTrace: payload.stackTrace,
          issueType: payload.issueType,
          severity: payload.severity,
        }),
      });
    } catch { /* ignore */ }
  }

  /**
   * جلب قائمة الإصدارات المنشورة من الإدارة المركزية.
   */
  static async fetchReleases(): Promise<any[]> {
    const base = this.getSecureServerUrl();
    if (!base) return [];
    try {
      const cred = this.getCredential();
      const res = await this.request('/api/v1/releases', {
        headers: cred ? { 'X-Device-Id': this.getDeviceId(), 'X-Device-Credential': cred } : {},
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  static async fetchPublicKey(): Promise<string | null> {
    const base = this.getSecureServerUrl();
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
    const base = this.getSecureServerUrl();
    const cred = this.getCredential();
    if (!base) return null;
    try {
      // رمز الجهاز يُرسل في الترويسات فقط ولا يظهر في عنوان URL (سجلات/وسطاء).
      const deviceId = this.getDeviceId();
      const res = await this.request('/api/v1/configuration/current', {
        headers: { 'X-Device-Id': deviceId, ...(cred ? { 'X-Device-Credential': cred } : {}) },
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
    if (BYPASS_FIRST_RUN_SETUP) return null;
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
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
    const cfg = this.getCachedConfig();
    const m = cfg?.config?.hiddenMenus;
    return Array.isArray(m) ? (m as string[]) : [];
  }

  static getFeaturePermissions(): any[] {
    const cfg = this.getCachedConfig();
    const m = cfg?.config?.featurePermissions;
    return Array.isArray(m) ? m : [];
  }

  static getUsageLimits(): Record<string, any> {
    const cfg = this.getCachedConfig();
    const m = cfg?.config?.usageLimits;
    return (m && typeof m === 'object') ? m : {};
  }
  /** أكواد الصلاحيات/الأزرار المعطّلة من منصة الإدارة المركزية لهذا الترخيص. */
  static getDisabledPermissions(): string[] {
    const cfg = this.getCachedConfig();
    const m = cfg?.config?.disabledPermissions;
    return Array.isArray(m) ? (m as string[]) : [];
  }
  static isConfigured(): boolean {
    return !!this.getServerUrl();
  }
}
