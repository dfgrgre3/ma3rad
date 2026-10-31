// Central licensing & configuration client for the desktop app.
// Talks to the Central Super Admin platform over HTTPS.
// All operations are optional and never block local business operations.

const STORAGE_KEY = 'central_device_credential';
const SERVER_KEY = 'central_server_url';
const CONFIG_KEY = 'central_cached_config';
const FIRST_RUN_ACTIVATION_KEY = 'central_first_run_activated';
const LAST_VALIDATED_KEY = 'central_last_validated_at';
// Offline tolerance: a device that has validated successfully may keep working
// without reaching the licensing server for this long. After that, the app
// fails closed until the license can be validated again.
const VALIDATION_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export interface CentralActivationResult {
  deviceCredential?: string;
  tenantId?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface CentralConfig {
  schemaVersion: number;
  configurationVersion: number;
  tenantId?: string;
  activityId?: string;
  config: any;
  configJson?: string;
  signature?: string;
}

export class CentralLicenseService {
  static getServerUrl(): string {
    try { return localStorage.getItem(SERVER_KEY) || 'http://localhost:4000'; } catch { return 'http://localhost:4000'; }
  }
  static setServerUrl(url: string) {
    localStorage.setItem(SERVER_KEY, url.replace(/\/$/, ''));
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

  static async activate(activationCode: string, deviceName?: string): Promise<CentralActivationResult> {
    const base = this.getServerUrl();
    if (!base) throw new Error('Central server URL not configured');
    const res = await fetch(base + '/api/v1/licensing/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activationCode,
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
    const base = this.getServerUrl();
    const cred = this.getCredential();
    if (!base || !cred) return false;

    const withinGrace = () => {
      const last = this.getLastValidatedAt();
      return last > 0 && Date.now() - last <= VALIDATION_GRACE_MS;
    };

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;
      let res: Response;
      try {
        res = await fetch(base + '/api/v1/licensing/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: this.getDeviceId(), deviceCredential: cred }),
          ...(controller ? { signal: controller.signal } : {}),
        });
      } finally {
        if (timeout) clearTimeout(timeout);
      }
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
    const base = this.getServerUrl();
    const cred = this.getCredential();
    if (!base || !cred) return;
    try {
      await fetch(base + '/api/v1/licensing/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: this.getDeviceId(), deviceCredential: cred, appVersion: '1.1.3' }),
      });
    } catch { /* ignore */ }
  }

  static async fetchPublicKey(): Promise<string | null> {
    const base = this.getServerUrl();
    if (!base) return null;
    try {
      const res = await fetch(base + '/api/v1/configuration/public-key');
      if (!res.ok) return null;
      const data = await res.json();
      return data.publicKey || null;
    } catch { return null; }
  }

  static async verifyConfig(data: CentralConfig): Promise<boolean> {
    // Unsigned payloads are accepted only for legacy compatibility.
    if (!data || !data.signature || !data.config) return true;
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
    const base = this.getServerUrl();
    const cred = this.getCredential();
    if (!base) return null;
    try {
      const url = base + '/api/v1/configuration/current?deviceId=' + encodeURIComponent(this.getDeviceId()) + (cred ? '&credential=' + encodeURIComponent(cred) : '');
      const res = await fetch(url, { headers: cred ? { 'X-Device-Id': this.getDeviceId(), 'X-Device-Credential': cred } : {} });
      if (!res.ok) return null;
      const data = await res.json();
      if (data) {
        // Signed configuration must verify before it can replace the cached copy.
        if (!(await this.verifyConfig(data))) return this.getCachedConfig();
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(data)); } catch { /* ignore */ }
      }
      return data;
    } catch { return this.getCachedConfig(); }
  }

  static getCachedConfig(): CentralConfig | null {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  static isConfigured(): boolean {
    return !!this.getServerUrl();
  }
}
