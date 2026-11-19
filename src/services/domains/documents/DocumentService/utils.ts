import { v4 as uuidv4 } from 'uuid';

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
}
