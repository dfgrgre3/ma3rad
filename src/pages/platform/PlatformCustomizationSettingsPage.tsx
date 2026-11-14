import React from 'react';
import { AdminSettingsTab } from '../admin/admin/AdminSettingsTab';

export const PlatformCustomizationSettingsPage: React.FC = () => (
  <div className="space-y-4"><AdminSettingsTab initialTab="customization" /></div>
);
export default PlatformCustomizationSettingsPage;
