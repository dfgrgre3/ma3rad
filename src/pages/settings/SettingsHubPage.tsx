import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import { AdminSettingsTab } from '../admin/AdminSettingsTab';
import { AppConfigurationPage } from './AppConfigurationPage';
import { ConfigurationStudioPage } from './ConfigurationStudioPage';

const ADMIN_TABS = ['general', 'business', 'branding', 'invoice', 'inventory', 'operations', 'security', 'backup'];

export const SettingsHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');

  if (requested === 'appConfig') {
    return <AppConfigurationPage />;
  }
  if (requested === 'configStudio') {
    return <ConfigurationStudioPage />;
  }

  const initial = requested && ADMIN_TABS.includes(requested) ? (requested as any) : 'general';
  const handleAdminTabChange = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 lg:p-6" dir="rtl">
      <div className="w-full space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">Ù…Ø±ÙƒØ² Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù…</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¹Ø§Ù…Ø©ØŒ Ø§Ù„Ù†Ø´Ø§Ø·ØŒ Ø§Ù„Ù‡ÙˆÙŠØ©ØŒ Ø§Ù„ÙÙˆØ§ØªÙŠØ±ØŒ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†ØŒ Ø§Ù„ØªØ´ØºÙŠÙ„ØŒ Ø§Ù„Ø£Ù…Ø§Ù†ØŒ ÙˆØ§Ù„Ù†Ø³Ø® ÙˆØ§Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø©</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <AdminSettingsTab initialTab={initial} onTabChange={handleAdminTabChange} />
        </div>
      </div>
    </div>
  );
};

export default SettingsHubPage;
