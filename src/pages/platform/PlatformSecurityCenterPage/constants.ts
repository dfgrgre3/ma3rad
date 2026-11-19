export type SecurityTab = 'OVERVIEW' | 'SESSIONS' | 'LOGINS' | 'KEYS' | 'INCIDENTS';

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
