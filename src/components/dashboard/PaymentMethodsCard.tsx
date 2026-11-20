import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CeramicMath } from '../../utils/products/ceramicMath';
import type { PaymentDistributionItem } from '../../types/dashboard/components';

interface PaymentMethodsCardProps {
  paymentDistribution: PaymentDistributionItem[];
}

export const PaymentMethodsCard: React.FC<PaymentMethodsCardProps> = ({ paymentDistribution }) => {
  return (
    <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
      <h3 className="text-xs font-bold text-ink dark:text-white mb-0.5">طرق الدفع</h3>
      <p className="text-[11px] text-muted mb-2">توزيع إيرادات الدفع المستخدمة</p>
      <div className="h-44 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 176 }}>
          <BarChart data={paymentDistribution} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--cerami-chart-grid)" />
            <XAxis dataKey="method" stroke="var(--cerami-muted)" fontSize={9} tickLine={false} />
            <YAxis stroke="var(--cerami-muted)" fontSize={9} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--cerami-tooltip-surface)', borderColor: 'var(--cerami-tooltip-border)', color: 'var(--cerami-text)', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
              formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبلغ']}
            />
            <Bar isAnimationActive={false} dataKey="amount" fill="var(--win-accent)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
