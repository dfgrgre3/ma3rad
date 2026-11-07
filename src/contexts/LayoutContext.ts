import { createContext } from 'react';
import type { User } from '../types';

export const LayoutContext = createContext<{
  currentUser: User | null;
}>({ currentUser: null });
