export type SecurityTab = 'OVERVIEW' | 'SESSIONS' | 'LOGINS' | 'EVENTS' | 'KEYS' | 'INCIDENTS' | 'IP_BANS';

export interface IncidentFormState {
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  details: string;
  sourceIp: string;
}

export interface ApiKeyFormState {
  tenantId: string;
  name: string;
  scopes: string[];
  expiresAt: string;
}
