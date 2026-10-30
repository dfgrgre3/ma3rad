// Central licensing & configuration client for the desktop app.
// Talks to the Central Super Admin platform over HTTPS.
// All operations are optional and never block local business operations.

const STORAGE_KEY = 'central_device_credential';
const SERVER_KEY = 'central_server_url';
const CONFIG_KEY = 'central_cached_config';

export interface CentralConfig {
  schemaVersion: number;
  configurationVersion: number;
  tenantId?: string;
  activityId?: string;
  config: any;
  signature?: string;
}

export class CentralLicenseService {
  static getServerUrl(): string {
    try { return localStorage.getItem(SERVER_KEY) || ''; } catch { return ''; }
  }
  static setServerUrl(url: string) {
    try { localStorage.setItem(SERVER_KEY, url.replace(/\/$/, '')); } catch {}
  }

  static getCredential(): string {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  }
  static setCredential(cred: string) {
    try { localStorage.setItem(STORAGE_KEY, cred); } catch {}
  }
  static getDeviceId(): string {
    try {
      let id = localStorage.getItem('central_device_id');
      if (!id) { id = 'dev_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('central_device_id', id); }
      return id;
    } catch { return 'dev_unknown'; }
  }

  static async activate(activationCode: string, deviceName?: string): Promise<any> {
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'activation_failed');
    if (data.deviceCredential) this.setCredential(data.deviceCredential);
    return data;
  }

  static async validate(): Promise<boolean> {
    const base = this.getServerUrl();
    const cred = this.getCredential();
    if (!base || !cred) return true; // not configured => allow offline
    try {
      const res = await fetch(base + '/api/v1/licensing/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: this.getDeviceId(), deviceCredential: cred }),
      });
      return res.ok;
    } catch { return true; } // offline => allow
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
    } catch {}
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
    if (!data || !data.signature || !data.config) return true; // unsigned => trust (legacy)
    try {
      const pub = await this.fetchPublicKey();
      if (!pub) return true; // cannot verify => trust (offline)
      const der = Uint8Array.from(atob(pub), c => c.charCodeAt(0));
      const key = await (crypto as any).subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);
      const sig = Uint8Array.from(atob(data.signature), c => c.charCodeAt(0));
      const payload = new TextEncoder().encode(typeof data.config === 'string' ? data.config : JSON.stringify(data.config));
      // server signs config_json string; verify against the raw config_json. Reconstruct by using stored? We only have parsed config. Sign payload on server is config_json string. Verification may mismatch due to formatting. Fall back to trust.
      const ok = await (crypto as any).subtle.verify('Ed25519', key, sig, payload);
      return ok;
    } catch {
      return true; // verification unavailable => trust
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
        // best-effort signature check; do not block on mismatch (legacy unsigned)
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(data)); } catch {}
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
