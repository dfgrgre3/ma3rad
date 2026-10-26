import type { ComponentType } from 'react';

export interface NavItemDef {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  perm?: string;
  highlight?: boolean;
  badge?: number;
}

export interface NavGroupDef {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  perm?: string;
  items: NavItemDef[];
}
