import React from 'react';
import { AdminPage } from './AdminPage';

/**
 * User and permission management page.
 * Merged into the admin control center (users tab) to avoid a duplicate surface.
 */
export const UsersPage: React.FC = () => {
  return <AdminPage initialTab="users" />;
};

export default UsersPage;