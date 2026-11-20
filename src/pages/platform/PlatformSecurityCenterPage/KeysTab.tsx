import React from 'react';
import { Key, KeyRound, RotateCcw, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformApiKey, PlatformSigningKey } from '../../../services/domains/platform/platformTypes';
import { formatDateTime } from '../components/PlatformUI';

interface KeysTabProps {
  signingKeys: PlatformSigningKey[];
  apiKeys: PlatformApiKey[];
  canManageSecurity: boolean;
  onRotateKey: (keyAlias: string) => void;
  onRotateApiKey: (id: string) => void;
  onRevokeApiKey: (id: string) => void;
  onOpenCreateApiKey: () => void;
}

export const KeysTab: React.FC<KeysTabProps> = ({
  signingKeys,
  apiKeys,
  canManageSecurity,
  onRotateKey,
  onRotateApiKey,
  onRevokeApiKey,
  onOpenCreateApiKey,
}) => (
  <div className="space-y-5">
    {/* Cryptographic Signing Keys */}
    <section className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between border-b border-line-strong pb-2.5">
        <div>
          <h3 className="text-xs font-bold text-muted flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-success" />
            مفاتيح التوقيع الرقمي للمنصة (Cryptographic Signing Keys)
          </h3>
          <p className="text-[11px] text-muted">
            تستخدم لتوليد وتوقيع التراخيص وحزم التكوين لضمان عدم تزييفها.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {signingKeys.map((k) => (
          <div
            key={k.id}
            className="rounded-lg border border-line-strong bg-primary/60 p-3.5 flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted">{k.keyAlias}</span>
                <span className="rounded bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5">
                  v{k.version}
                </span>
              </div>
              <p className="text-[11px] text-muted mt-1">
                الخوارزمية: <span className="font-mono text-muted">{k.algorithm}</span>
              </p>
              <p className="text-[10px] text-muted">تم الإنشاء: {formatDateTime(k.createdAt)}</p>
            </div>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => k.keyAlias && onRotateKey(k.keyAlias)}
              disabled={!canManageSecurity}
              leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              تدوير المفتاح
            </Button>
          </div>
        ))}
      </div>
    </section>

    {/* Platform API Keys */}
    <section className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between border-b border-line-strong pb-2.5">
        <div>
          <h3 className="text-xs font-bold text-muted flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            مفاتيح الـ API المركزية
          </h3>
          <p className="text-[11px] text-muted">
            مفاتيح التكامل الخاصة بالمنصة وخدمات الربط الخارجي ونطاقات الصلاحيات.
          </p>
        </div>
        {canManageSecurity && (
          <Button
            size="sm"
            onClick={onOpenCreateApiKey}
            leadingIcon={<Plus className="h-4 w-4" />}
          >
            إنشاء مفتاح API جديد
          </Button>
        )}
      </header>

      {apiKeys.length === 0 ? (
        <p className="text-xs text-muted py-4 text-center">لا توجد مفاتيح API مسجلة حالياً.</p>
      ) : (
        <DataTable
          ariaLabel="مفاتيح API"
          rows={apiKeys}
          rowKey={(key) => key.id}
          dense
          columns={[
            { key: 'name', header: 'اسم المفتاح', render: (key) => <span className="font-bold text-muted">{key.name}</span> },
            { key: 'prefix', header: 'البادئة', render: (key) => <span className="font-mono text-muted">{key.keyPrefix}...</span> },
            { key: 'scopes', header: 'الصلاحيات', render: (key) => <span className="text-muted">{key.scopes.join(', ') || 'الكل'}</span> },
            { key: 'status', header: 'الحالة', render: (key) => <span className={`font-bold ${key.isActive ? 'text-success' : 'text-danger'}`}>{key.isActive ? 'نشط' : 'ملغي'}</span> },
            { key: 'expires', header: 'تاريخ الانتهاء', render: (key) => <span className="text-muted">{key.expiresAt ? formatDateTime(key.expiresAt) : 'دائم'}</span> },
            { key: 'lastUsed', header: 'آخر استخدام', render: (key) => <span className="text-muted">{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'لم يستخدم'}</span> },
            {
              key: 'actions', header: 'إجراءات', align: 'center',
              render: (key) => key.isActive ? (
                <div className="flex items-center justify-center gap-2">
                  <button
                    disabled={!canManageSecurity}
                    onClick={() => onRotateApiKey(key.id)}
                    className="text-primary hover:underline text-xs flex items-center gap-1"
                    title="تدوير المفتاح"
                  >
                    <RotateCcw className="h-3 w-3" />
                    تدوير
                  </button>
                  <span className="text-ink-secondary">|</span>
                  <button
                    disabled={!canManageSecurity}
                    onClick={() => onRevokeApiKey(key.id)}
                    className="text-danger hover:underline text-xs"
                  >
                    إلغاء
                  </button>
                </div>
              ) : null,
            },
          ]}
        />
      )}
    </section>
  </div>
);
