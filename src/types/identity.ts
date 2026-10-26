// Database Domain Types & Interfaces

export type BuiltInUserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTANT';
// `(string & {})` preserves autocomplete for the built-ins while allowing
// admin-defined custom roles without a code change.
export type UserRole = BuiltInUserRole | (string & {});

export interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt?: string;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string;
}
