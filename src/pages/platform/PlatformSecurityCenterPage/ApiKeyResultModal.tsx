import React from 'react';
import { AlertTriangle, Copy } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { inputClass } from '../components/PlatformUI';
import { useToast } from '../../../components/ui/Toast';
import type { PlatformApiKey } from '../../../services/domains/platform/platformTypes';

interface ApiKeyResult {
  plainTextKey: string;
  key: PlatformApiKey;
}

interface ApiKeyResultModalProps {
  result: ApiKeyResult | null;
  onClose: () => void;
}

export const ApiKeyResultModal: React.FC<ApiKeyResultModalProps> = ({ result, onClose }) => {
  const toast = useToast();

  return (
    <Modal
      open={Boolean(result)}
      onClose={onClose}
      title="تم إنشاء مفتاح الـ API بنجاح"
    >
      <div className="space-y-4 text-right">
        <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-warning">
            <strong className="font-bold block mb-1">تنبيه أمان فائق الأهمية:</strong>
            هذه هي المرة الوحيدة التي سيظهر فيها مفتاح الـ API السري كاملاً. قم بنسخه وحفظه في بيئة آمنة فوراً؛ لن تتمكن من رؤيته مرة أخرى!
          </div>
        </div>

        {result && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted">مفتاح الـ API السري الكامل (Secret Key):</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={result.plainTextKey}
                className={`${inputClass} font-mono text-success select-all`}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(result.plainTextKey);
                  toast.success('تم نسخ المفتاح إلى الحافظة بنجاح.');
                }}
                leadingIcon={<Copy className="h-4 w-4" />}
              >
                نسخ
              </Button>
            </div>

            <div className="mt-3 p-3 bg-primary/60 rounded-lg border border-line-strong text-xs space-y-1 text-muted">
              <p><strong>اسم المفتاح:</strong> {result.key.name}</p>
              <p><strong>البادئة:</strong> <span className="font-mono">{result.key.keyPrefix}</span></p>
              <p><strong>الصلاحيات:</strong> {result.key.scopes.join(', ') || 'الكل'}</p>
              <p><strong>معرف المفتاح:</strong> <span className="font-mono">{result.key.id}</span></p>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-line-strong">
          <Button size="sm" onClick={onClose}>
            لقد قمت بحفظ المفتاح بأمان، إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
};
