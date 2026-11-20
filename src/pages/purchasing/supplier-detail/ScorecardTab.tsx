import React from 'react';
import { ShieldCheck, Clock, PackageCheck, AlertTriangle, Scale, Sparkles } from 'lucide-react';
import { SupplierScorecard } from '../../../services/domains/procurement/ProcurementService';
import { CeramicMath } from '../../../utils/products/ceramicMath';

export interface ScorecardTabProps {
  scorecard: SupplierScorecard | null;
}

export const ScorecardTab: React.FC<ScorecardTabProps> = ({ scorecard }) => {
  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-2xl border border-line p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span>سجل تقييم وأداء المورد الشامل</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              تحليل مؤشرات الالتزام بمواعيد التوريد، نسب التلف والجودة، ومطالبات العيوب
            </p>
          </div>

          {scorecard && (
            <div className="flex items-center gap-3 bg-gradient-to-l from-primary to-primary px-4 py-2 rounded-2xl border border-accent-border">
              <span className="text-xs font-bold text-ink-secondary">التقييم الإجمالي:</span>
              <span
                className={`text-sm font-black px-3 py-1 rounded-xl border ${
                  scorecard.ratingLabel === 'ممتاز'
                    ? 'bg-success text-white border-success'
                    : scorecard.ratingLabel === 'جيد جداً'
                    ? 'bg-primary text-white border-primary'
                    : scorecard.ratingLabel === 'جيد'
                    ? 'bg-warning text-white border-warning'
                    : 'bg-danger text-white border-danger'
                }`}
              >
                {scorecard.ratingLabel} ({scorecard.overallScore}/100)
              </span>
            </div>
          )}
        </div>

        {scorecard ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl border border-line bg-surface-muted/50 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-ink-secondary">
                  <span>الالتزام بموعد التوريد</span>
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                <div className="text-2xl font-black text-ink">
                  {scorecard.onTimeDeliveryRate}%
                </div>
                <div className="text-[11px] text-muted">
                  توريدات في موعدها: {scorecard.onTimeDeliveries} من {scorecard.receivedOrders}
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-line bg-surface-muted/50 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-ink-secondary">
                  <span>معدل قبول الفحص الفني</span>
                  <PackageCheck className="w-4 h-4 text-success" />
                </div>
                <div className="text-2xl font-black text-success">
                  {scorecard.acceptanceRate}%
                </div>
                <div className="text-[11px] text-muted">
                  إجمالي المقبول: {scorecard.totalAcceptedM2} م²
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-line bg-surface-muted/50 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-ink-secondary">
                  <span>نسبة التالف والكسر</span>
                  <AlertTriangle className="w-4 h-4 text-warning" />
                </div>
                <div className="text-2xl font-black text-warning">
                  {scorecard.damageRate}%
                </div>
                <div className="text-[11px] text-muted">
                  إجمالي التالف: {scorecard.totalDamagedM2} م²
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-line bg-surface-muted/50 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-ink-secondary">
                  <span>مطالبات العيوب والنقص</span>
                  <Scale className="w-4 h-4 text-danger" />
                </div>
                <div className="text-2xl font-black text-danger">
                  {scorecard.totalClaimsCount}
                </div>
                <div className="text-[11px] text-muted">
                  إجمالي القيمة: {CeramicMath.formatCurrency(scorecard.totalClaimedAmount)}
                </div>
              </div>
            </div>

            {/* Summary Box */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-ink to-primary text-white space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm text-primary">
                <Sparkles className="w-4 h-4" />
                <span>ملخص التوريدات المنجزة</span>
              </div>
              <div className="grid grid-cols-1  sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-muted block">إجمالي أوامر الشراء:</span>
                  <span className="text-base font-black text-white">{scorecard.totalOrders} أمر شراء</span>
                </div>
                <div>
                  <span className="text-muted block">الأوامر المستلمة:</span>
                  <span className="text-base font-black text-success">{scorecard.receivedOrders} أمر</span>
                </div>
                <div>
                  <span className="text-muted block">إجمالي حجم المشتريات:</span>
                  <span className="text-base font-black text-white">
                    {CeramicMath.formatCurrency(scorecard.totalPurchases)}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-muted">
            لا تتوفر بيانات تقييم كافية لهذا المورد بعد (يلزم تسجيل أوامر وأذونات استلام).
          </div>
        )}
      </div>
    </div>
  );
};
