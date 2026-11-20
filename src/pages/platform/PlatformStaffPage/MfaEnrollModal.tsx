import React from 'react';
import { QrCode } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { inputClass } from '../components/PlatformUI';

export interface MfaSetupData {
  secret: string;
  qrCodeImage: string;
  recoveryCodes: string[];
}

interface MfaEnrollModalProps {
  open: boolean;
  onClose: () => void;
  mfaSetup: MfaSetupData | null;
  mfaQrDataUrl: string;
  mfaCode: string;
  setMfaCode: (v: string) => void;
  mfaAck: boolean;
  setMfaAck: (v: boolean) => void;
  onConfirm: () => void;
}

export const MfaEnrollModal: React.FC<MfaEnrollModalProps> = ({
  open,
  onClose,
  mfaSetup,
  mfaQrDataUrl,
  mfaCode,
  setMfaCode,
  mfaAck,
  setMfaAck,
  onConfirm,
}) => (
  <Modal open={open} onClose={onClose} title="تفعيل المصادقة الثنائية" size="md">
    {mfaSetup && (
      <div className="space-y-4 text-right">
        <ol className="space-y-1.5 text-[11px] text-muted list-decimal list-inside">
          <li>امسح رمز QR من تطبيق المصادقة (Google Authenticator / Authy / 1Password).</li>
          <li>أو أدخل المفتاح يدوياً في التطبيق.</li>
          <li>احفظ رموز الاسترداد في مكان آمن — كل رمز يُستخدم مرة واحدة.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line-strong bg-primary/50 p-4">
          {mfaQrDataUrl ? (
            <img src={mfaQrDataUrl} alt="QR للمصادقة الثنائية" className="rounded-lg bg-surface p-1.5" width={176} height={176} />
          ) : (
            <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-line-strong text-ink-secondary"><QrCode className="h-16 w-16" /></div>
          )}
          <div className="min-w-[180px] flex-1">
            <p className="text-[10px] font-bold text-muted mb-1">المفتاح السري</p>
            <p dir="ltr" className="break-all rounded-lg border border-line-strong bg-primary px-3 py-2 font-mono text-[10px] text-muted select-all">{mfaSetup.secret}</p>
          </div>
        </div>
        <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
          <p className="text-[10.5px] font-bold text-warning">رموز الاسترداد (تظهر مرة واحدة فقط)</p>
          <div dir="ltr" className="mt-2 grid grid-cols-2 gap-1 font-mono text-[10.5px] text-warning/90">
            {mfaSetup.recoveryCodes.map((code) => <span key={code}>{code}</span>)}
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-muted">
          <input type="checkbox" checked={mfaAck} onChange={(e) => setMfaAck(e.target.checked)} className="rounded border-line-strong text-primary" />
          <span>أقرّ بأنني حفظت رموز الاسترداد في مكان آمن</span>
        </label>
        <div className="flex items-end gap-2">
          <input
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            dir="ltr"
            className={`${inputClass} max-w-[160px] text-center font-mono tracking-[0.3em]`}
          />
          <Button size="sm" onClick={onConfirm} disabled={mfaCode.length !== 6 || !mfaAck}>
            تأكيد وتفعيل
          </Button>
        </div>
      </div>
    )}
  </Modal>
);
