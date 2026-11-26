import React, { useEffect, useRef, useState } from 'react';
import { Camera, ScanLine, X } from 'lucide-react';

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const getBarcodeDetector = (): BarcodeDetectorConstructor | null => {
  const ctor = (window as any).BarcodeDetector as BarcodeDetectorConstructor | undefined;
  return typeof ctor === 'function' ? ctor : null;
};

const SCAN_INTERVAL_MS = 1200;

export const PosCameraScanner: React.FC<{
  onScan: (code: string) => void;
  onClose: () => void;
}> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>('');
  const [lastCode, setLastCode] = useState('');
  const lastScanAtRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const Detector = getBarcodeDetector();
    if (!Detector) {
      setError('متصفحك لا يدعم التعرف على الباركود بالكاميرا. استخدم باركود سلكي أو جهازاً يدعم هذه الميزة.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('الكاميرا غير متاحة في هذا الجهاز أو المتصفح.');
      return;
    }

    let stream: MediaStream | null = null;
    let detector: BarcodeDetectorLike;
    let rafId = 0;
    let cancelled = false;

    const tick = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      try {
        const codes = await detector.detect(video);
        const now = Date.now();
        if (codes.length && now - lastScanAtRef.current > SCAN_INTERVAL_MS) {
          lastScanAtRef.current = now;
          const value = codes[0].rawValue;
          setLastCode(value);
          onScanRef.current(value);
        }
      } catch {
        // detection errors are transient (frame not ready); keep scanning
      }
      rafId = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix'];
        let formats = wanted;
        try {
          const supported = await Detector.getSupportedFormats?.();
          if (supported?.length) formats = wanted.filter((f) => supported.includes(f));
        } catch { /* keep defaults */ }
        detector = new Detector({ formats });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        rafId = requestAnimationFrame(tick);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.name === 'NotAllowedError'
            ? 'تم رفض إذن الكاميرا. اسمح بالوصول من إعدادات المتصفح ثم أعد المحاولة.'
            : 'تعذر تشغيل الكاميرا على هذا الجهاز.');
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[120] bg-primary/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-3xl border border-line shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="flex items-center gap-2 text-sm font-black text-ink">
            <ScanLine className="w-4 h-4 text-primary" /> مسح الباركود بالكاميرا
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق الماسح"
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-primary/90 flex items-center justify-center">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            {!error && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-3/4 h-1/3 border-2 border-white/80 rounded-xl" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90 px-6 text-center">
                <Camera className="w-8 h-8" />
                <p className="text-xs font-bold leading-relaxed">{error}</p>
              </div>
            )}
          </div>

          {lastCode && (
            <p className="text-center text-xs font-bold text-success">
              آخر كود ممسوح: <span className="font-mono" dir="ltr">{lastCode}</span>
            </p>
          )}
          {!error && (
            <p className="text-center text-[11px] text-muted">
              وجّه الكاميرا نحو الباركود — تتم الإضافة تلقائياً عند التعرف عليه.
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-surface-muted hover:bg-surface-sunken text-ink font-bold rounded-xl text-xs border border-line"
          >
            إغلاق الماسح
          </button>
        </div>
      </div>
    </div>
  );
};
