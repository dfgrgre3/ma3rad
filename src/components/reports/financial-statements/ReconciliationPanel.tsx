import React from 'react';
import { DataTable } from '../../ui/DataTable';
import type { ReconciliationCheck } from '../../../services/domains/reports/FinancialStatementsService';
import { formatCurrency } from './format';

export function ReconciliationPanel({ checks }: { checks: ReconciliationCheck[] }) {
  const issues = checks.filter((check) => check.status === 'DIFFERENCE').length;
  const unavailable = checks.filter((check) => check.status === 'NOT_COMPARABLE').length;
  return (
    <div className="space-y-4">
      <div className={`rounded-xl border px-5 py-4 ${issues || unavailable ? 'border-warning-border bg-warning-soft' : 'border-success-border bg-success-soft'}`}>
        <p className="font-black text-sm">
          {issues || unavailable
            ? [issues ? `${issues} نقاط تحتاج إلى مراجعة` : '', unavailable ? `${unavailable} فحوصات غير قابلة للمقارنة ضمن نطاق الفرع` : ''].filter(Boolean).join(' · ')
            : 'الفحوصات المحاسبية متطابقة'}
        </p>
        <p className="text-xs text-ink-secondary mt-1">تعرض هذه الصفحة فروقات الأستاذ العام مع سجلات العملاء والموردين وطبقات تكلفة المخزون.</p>
      </div>
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <DataTable
          ariaLabel="فحوصات المصالحة"
          rows={checks}
          rowKey={(check: any) => check.key}
          tableClassName="text-sm"
          columns={[
            {
              key: 'check', header: 'الفحص',
              render: (check: any) => (
                <span>
                  <span className="block font-bold text-ink">{check.label}</span>
                  <span className="mt-1 block text-xs text-muted">{check.detail}</span>
                </span>
              ),
            },
            { key: 'ledger', header: 'الأستاذ العام', align: 'end' as const, render: (check: any) => <span className="font-mono">{check.status === 'NOT_COMPARABLE' ? '—' : formatCurrency(check.ledger)}</span> },
            { key: 'source', header: 'المصدر المقارن', align: 'end' as const, render: (check: any) => <span className="font-mono">{check.status === 'NOT_COMPARABLE' ? '—' : formatCurrency(check.source)}</span> },
            {
              key: 'diff', header: 'الفرق', align: 'end' as const,
              render: (check: any) => <span className={`font-mono ${check.status === 'MATCH' ? 'text-success' : check.status === 'NOT_COMPARABLE' ? 'text-warning' : 'text-danger'}`}>{check.status === 'NOT_COMPARABLE' ? '—' : formatCurrency(check.difference)}</span>,
            },
            {
              key: 'result', header: 'النتيجة',
              render: (check: any) => (
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${check.status === 'MATCH' ? 'bg-success-soft text-success' : check.status === 'NOT_COMPARABLE' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'}`}>
                  {check.status === 'MATCH' ? 'متطابق' : check.status === 'NOT_COMPARABLE' ? 'غير قابل للمقارنة' : 'فرق'}
                </span>
              ),
            },
          ]}
        />
        </div>
      </div>
    </div>
  );
}
