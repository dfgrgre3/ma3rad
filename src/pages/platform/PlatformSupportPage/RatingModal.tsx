import React from 'react';
import { Star } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { inputClass } from '../components/PlatformUI';

interface RatingModalProps {
  open: boolean;
  onClose: () => void;
  ratingStars: number;
  setRatingStars: (v: number) => void;
  ratingFeedback: string;
  setRatingFeedback: (v: string) => void;
  canManageSupport: boolean;
  onSubmit: () => void;
}

export const RatingModal: React.FC<RatingModalProps> = ({
  open,
  onClose,
  ratingStars,
  setRatingStars,
  ratingFeedback,
  setRatingFeedback,
  canManageSupport,
  onSubmit,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="تقييم رضا العميل"
  >
    <div className="space-y-3.5 text-right">
      <div>
        <label className="block text-xs font-semibold text-muted mb-2">عدد النجوم (1 - 5)</label>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRatingStars(star)}
              className="p-1 hover:scale-110 transition-transform"
            >
              <Star
                className={`h-7 w-7 ${
                  star <= ratingStars ? 'text-warning fill-warning' : 'text-ink-secondary'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">ملاحظات العميل</label>
        <textarea
          rows={3}
          value={ratingFeedback}
          onChange={(e) => setRatingFeedback(e.target.value)}
          placeholder="اكتب ملاحظات العميل أو ملخص ما تم حله..."
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
        <Button variant="secondary" size="sm" onClick={onClose}>
          إلغاء
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!canManageSupport}>
          حفظ التقييم
        </Button>
      </div>
    </div>
  </Modal>
);
