import React, { useState, useEffect } from 'react';
import { CentralLicenseService } from '../services/CentralLicenseService';

export const CentralActivationView: React.FC = () => {
  const [serverUrl, setServerUrl] = useState(CentralLicenseService.getServerUrl());
  const [activationCode, setActivationCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [status, setStatus] = useState('');
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    setConfig(CentralLicenseService.getCachedConfig());
  }, []);

  const handleSaveUrl = () => {
    CentralLicenseService.setServerUrl(serverUrl);
    setStatus('Server URL saved.');
  };

  const handleActivate = async () => {
    try {
      setStatus('Activating...');
      const res = await CentralLicenseService.activate(activationCode, deviceName);
      setStatus('Activated: ' + (res.tenantId || 'ok'));
      const cfg = await CentralLicenseService.fetchConfig();
      setConfig(cfg);
    } catch (e: any) {
      setStatus('Activation failed: ' + (e?.message || e));
    }
  };

  const handleFetchConfig = async () => {
    try {
      const cfg = await CentralLicenseService.fetchConfig();
      setConfig(cfg);
      setStatus('Config fetched: v' + (cfg?.configurationVersion ?? 0));
    } catch (e: any) {
      setStatus('Fetch failed: ' + (e?.message || e));
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Central Activation & Configuration</h2>
        <p className="text-xs text-slate-500">Connect this device to the Central Super Admin platform.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-2xl">
        <div>
          <label className="font-bold text-slate-700 block mb-1 text-xs">Central Server URL</label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:4000"
            className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs"
          />
        </div>
        <button onClick={handleSaveUrl} className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold">Save URL</button>

        <div>
          <label className="font-bold text-slate-700 block mb-1 text-xs">Activation Code</label>
          <input
            type="text"
            value={activationCode}
            onChange={(e) => setActivationCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
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
