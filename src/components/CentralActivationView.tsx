import React, { useState, useEffect } from 'react';
import { CentralLicenseService } from '../services/CentralLicenseService';
import { CentralConfigApplier } from '../services/CentralConfigApplier';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';

export const CentralActivationView: React.FC = () => {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [status, setStatus] = useState('');
  const [config, setConfig] = useState<any>(null);
  const canManageLicense = PermissionService.can(AuthService.getCurrentUser(), 'ui.admin.license.manage', '/central-activation');

  useEffect(() => {
    if (canManageLicense) setConfig(CentralLicenseService.getCachedConfig());
  }, [canManageLicense]);

  const handleActivate = async () => {
    try {
      setStatus('Activating...');
      const res = await CentralLicenseService.activate(
        {
          activationCode: activationCode.trim(),
          account: account.trim(),
          password,
          phone: phone.trim(),
        },
        deviceName.trim() || undefined,
      );
      const local = res.localAccount;
      if (local?.username && password) {
        try {
          AuthService.provisionCentralAccount({
            username: local.username,
            password,
            fullName: local.fullName,
            phone: local.phone || phone.trim(),
            role: local.role,
          });
        } catch (provisionError) {
          console.error('Could not provision the local account after activation:', provisionError);
        }
      }
      setStatus('Activated: ' + (res.tenantId || 'ok'));
      const cfg = await CentralLicenseService.fetchConfig();
      CentralConfigApplier.apply();
      setConfig(cfg);
    } catch (e: any) {
      setStatus('Activation failed: ' + (e?.message || e));
    }
  };

  const handleFetchConfig = async () => {
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.license.manage', '/central-activation');
      const cfg = await CentralLicenseService.fetchConfig();
      CentralConfigApplier.apply();
      setConfig(cfg);
      setStatus('Config fetched: v' + (cfg?.configurationVersion ?? 0));
    } catch (e: any) {
      setStatus('Fetch failed: ' + (e?.message || e));
    }
  };

  if (!canManageLicense) {
    return <div className="p-6 text-sm font-bold text-rose-700" role="alert">لا تملك صلاحية إدارة تفعيل الجهاز المركزي.</div>;
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Central Activation & Configuration</h2>
        <p className="text-xs text-slate-500">Connect this device to the Central Super Admin platform.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-2xl">
        <div>
          <label className="font-bold text-slate-700 block mb-1 text-xs">Account</label>
          <input
            type="text"
            dir="ltr"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="account"
            autoComplete="username"
            className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs"
          />
        </div>
        <div>
          <label className="font-bold text-slate-700 block mb-1 text-xs">Password</label>
          <input
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs"
          />
        </div>
        <div>
          <label className="font-bold text-slate-700 block mb-1 text-xs">Phone</label>
          <input
            type="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01xxxxxxxxx"
            autoComplete="tel"
            className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs"
          />
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1 text-xs">Activation Code</label>
          <input
            type="text"
            dir="ltr"
            value={activationCode}
            onChange={(e) => setActivationCode(e.target.value)}
            placeholder="EDAR-XXXX-XXXX-XXXX"
            className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs"
          />
        </div>
        <div>
          <label className="font-bold text-slate-700 block mb-1 text-xs">Device Name (optional)</label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={handleActivate} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold">Activate Device</button>
          <button onClick={handleFetchConfig} className="px-4 py-2 bg-slate-600 text-white rounded-xl text-xs font-bold">Fetch Config</button>
        </div>

        {status && <div className="text-xs text-slate-700 bg-slate-100 p-2 rounded">{status}</div>}

        {config && (
          <div className="text-xs bg-slate-50 p-3 rounded border border-slate-200">
            <div className="font-bold mb-1">Cached Config (v{config.configurationVersion})</div>
            <pre className="overflow-auto max-h-40">{JSON.stringify(config.config, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
