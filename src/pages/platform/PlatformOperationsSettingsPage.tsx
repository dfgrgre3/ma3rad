import React from 'react';
import { AdminSettingsTab } from '../admin/admin/AdminSettingsTab';

export const PlatformOperationsSettingsPage: React.FC = () => (
  <div className="space-y-4"><AdminSettingsTab initialTab="operations" /></div>
);
export default PlatformOperationsSettingsPage;
