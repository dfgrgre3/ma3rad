import React from 'react';
import { AdminSettingsTab } from '../admin/admin/AdminSettingsTab';

/**
 * Reuses the existing business-activity settings screen inside the platform
 * console so the platform owner can configure the installation's activity
 * profile (modules, inventory tracking, features, terminology, ...) without
 * leaving /platform.
 */
export const PlatformActivitySettingsPage: React.FC = () => (
  <div className="space-y-4">
    <AdminSettingsTab initialTab="business" />
  </div>
);

export default PlatformActivitySettingsPage;
