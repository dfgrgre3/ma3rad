export interface PlatformApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformApiKeyCreated {
  key: PlatformApiKey;
  plainTextKey: string;
}
