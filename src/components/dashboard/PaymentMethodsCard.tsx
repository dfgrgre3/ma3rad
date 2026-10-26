import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CeramicMath } from '../../utils/ceramicMath';

interface PaymentMethodsCardProps {
  paymentDistribution: any[];
}

export const PaymentMethodsCard: React.FC<PaymentMethodsCardProps> = ({ paymentDistribution }) => {
  return (
    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">طرق الدفع</h3>
      <p className="text-[11px] text-slate-400 mb-2">توزيع إيرادات الدفع المستخدمة</p>
      <div className="h-44 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={paymentDistribution} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
            <XAxis dataKey="method" stroke="#94a3b8" fontSize={9} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
              formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبلغ']}
            />
            <Bar isAnimationActive={false} dataKey="amount" fill="#0284c7" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
