const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Service to manage and inspect Tailscale status and connection directly from Electron.
 */
class TailscaleService {
  constructor() {
    this.cachedStatus = null;
    this.lastChecked = 0;
  }

  /**
   * Find the Tailscale executable path on Windows.
   */
  getExecutablePath() {
    const defaultPaths = [
      'tailscale', // If in PATH
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Tailscale', 'tailscale.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Tailscale', 'tailscale.exe'),
      path.join(process.env['LocalAppData'] || '', 'Tailscale', 'tailscale.exe')
    ];

    for (const p of defaultPaths) {
      if (p === 'tailscale') continue;
      if (fs.existsSync(p)) return `"${p}"`;
    }
    return 'tailscale';
  }

  /**
   * Executes a tailscale CLI command.
   */
  async runCommand(args) {
    return new Promise((resolve) => {
      const exe = this.getExecutablePath();
      exec(`${exe} ${args}`, { windowsHide: true, timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, error: stderr?.trim() || error.message, stdout: stdout?.trim() });
        } else {
          resolve({ ok: true, stdout: stdout?.trim() });
        }
      });
    });
  }

  /**
   * Get current Tailscale status, IP, and peer list.
   */
  async getStatus() {
    const res = await this.runCommand('status --json');
    if (!res.ok) {
      return {
        installed: !res.error.includes('is not recognized') && !res.error.includes('cannot find'),
        running: false,
        ip: null,
        error: res.error,
        peers: []
      };
    }

    try {
      const data = JSON.parse(res.stdout);
      const self = data.Self || {};
      const ips = self.TailscaleIPs || [];
      const ipv4 = ips.find((ip) => ip.includes('.')) || null;

      const peers = [];
      if (data.Peer) {
        for (const peerKey of Object.keys(data.Peer)) {
          const p = data.Peer[peerKey];
          const peerIps = p.TailscaleIPs || [];
          peers.push({
            name: p.HostName || p.DNSName,
            ip: peerIps.find((ip) => ip.includes('.')) || null,
            online: Boolean(p.Online),
            os: p.OS
          });
        }
      }

      return {
        installed: true,
        running: self.Online !== false,
        ip: ipv4,
        nodeName: self.HostName,
        peers,
        backendState: data.BackendState
      };
    } catch {
      return {
        installed: true,
        running: false,
        ip: null,
        error: 'Failed to parse Tailscale status JSON'
      };
    }
  }

  /**
   * Connect or authenticate to Tailscale using an AuthKey or default up.
   */
  async connect(authKey = null) {
    let cmd = 'up --unattended';
    if (authKey && typeof authKey === 'string' && authKey.startsWith('tskey-')) {
      cmd += ` --authkey=${authKey.trim()}`;
    }
    return await this.runCommand(cmd);
  }

  /**
   * Disconnect Tailscale.
   */
  async disconnect() {
    return await this.runCommand('down');
  }
}

module.exports = new TailscaleService();
