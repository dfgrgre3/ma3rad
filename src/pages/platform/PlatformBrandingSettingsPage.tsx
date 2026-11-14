import React from 'react';
import { AdminSettingsTab } from '../admin/admin/AdminSettingsTab';

export const PlatformBrandingSettingsPage: React.FC = () => (
  <div className="space-y-4"><AdminSettingsTab initialTab="branding" /></div>
);
export default PlatformBrandingSettingsPage;
