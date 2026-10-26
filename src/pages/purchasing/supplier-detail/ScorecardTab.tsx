import React from 'react';
import { ShieldCheck, Clock, PackageCheck, AlertTriangle, Scale, Sparkles } from 'lucide-react';
import { SupplierScorecard } from '../../../services/ProcurementService';
import { CeramicMath } from '../../../utils/ceramicMath';

export interface ScorecardTabProps {
  scorecard: SupplierScorecard | null;
}

export const ScorecardTab: React.FC<ScorecardTabProps> = ({ scorecard }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <span>سجل تقييم وأداء المورد الشامل</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تحليل مؤشرات الالتزام بمواعيد التوريد، نسب التلف والجودة، ومطالبات العيوب
            </p>
          </div>

          {scorecard && (
            <div className="flex items-center gap-3 bg-gradient-to-l from-indigo-50 to-purple-50 px-4 py-2 rounded-2xl border border-indigo-100">
              <span className="text-xs font-bold text-slate-600">التقييم الإجمالي:</span>
              <span
                className={`text-sm font-black px-3 py-1 rounded-xl border ${
                  scorecard.ratingLabel === 'ممتاز'
                    ? 'bg-emerald-500 text-white border-emerald-600'
                    : scorecard.ratingLabel === 'جيد جداً'
                    ? 'bg-blue-500 text-white border-blue-600'
                    : scorecard.ratingLabel === 'جيد'
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-rose-500 text-white border-rose-600'
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
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>الالتزام بموعد التوريد</span>
                  <Clock className="w-4 h-4 text-sky-600" />
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {scorecard.onTimeDeliveryRate}%
                </div>
                <div className="text-[11px] text-slate-500">
                  توريدات في موعدها: {scorecard.onTimeDeliveries} من {scorecard.receivedOrders}
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>معدل قبول الفحص الفني</span>
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-emerald-600">
                  {scorecard.acceptanceRate}%
                </div>
                <div className="text-[11px] text-slate-500">
                  إجمالي المقبول: {scorecard.totalAcceptedM2} م²
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>نسبة التالف والكسر</span>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-600">
                  {scorecard.damageRate}%
                </div>
                <div className="text-[11px] text-slate-500">
                  إجمالي التالف: {scorecard.totalDamagedM2} م²
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>مطالبات العيوب والنقص</span>
                  <Scale className="w-4 h-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-600">
                  {scorecard.totalClaimsCount}
                </div>
                <div className="text-[11px] text-slate-500">
                  إجمالي القيمة: {CeramicMath.formatCurrency(scorecard.totalClaimedAmount)}
                </div>
              </div>
            </div>

            {/* Summary Box */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm text-indigo-300">
                <Sparkles className="w-4 h-4" />
                <span>ملخص التوريدات المنجزة</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">إجمالي أوامر الشراء:</span>
                  <span className="text-base font-black text-white">{scorecard.totalOrders} أمر شراء</span>
                </div>
                <div>
                  <span className="text-slate-400 block">الأوامر المستلمة:</span>
                  <span className="text-base font-black text-emerald-400">{scorecard.receivedOrders} أمر</span>
                </div>
                <div>
                  <span className="text-slate-400 block">إجمالي حجم المشتريات:</span>
                  <span className="text-base font-black text-white">
                    {CeramicMath.formatCurrency(scorecard.totalPurchases)}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-slate-400">
            لا تتوفر بيانات تقييم كافية لهذا المورد بعد (يلزم تسجيل أوامر وأذونات استلام).
          </div>
        )}
      </div>
    </div>
  );
};
