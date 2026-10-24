import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DatabaseManager } from '../src/database/db.ts';
import { postLedgerEntry } from '../src/database/ledger.ts';

test('financial statements screen filters cash flow and ledger and exports the balance sheet', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: dom.window.MutationObserver });
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    value: dom.window.getComputedStyle.bind(dom.window),
  });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    writable: true,
    value: true,
  });

  const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
  const React = await import('react');
  const { ToastProvider } = await import('../src/components/ui/Toast.tsx');
  const { FinancialStatementsPage } = await import('../src/pages/reports/FinancialStatementsPage.tsx');
  const manager = DatabaseManager.getInstance();
  await manager.initialize();

  const actorId = manager.query<{ id: string }>('SELECT id FROM users ORDER BY created_at, id LIMIT 1')[0]?.id;
  assert.ok(actorId);
  const postingDate = '2034-08-22';
  manager.executeTransaction(() => {
    postLedgerEntry(manager.getDatabase(), {
      date: postingDate,
      description: 'Financial statement UI test',
      referenceType: 'TEST_FINANCIAL_STATEMENT_UI',
      referenceId: 'ui_cash_flow_ledger_filter',
      createdBy: actorId,
      lines: [
        { accountCode: '1101', debit: 987.65, credit: 0 },
        { accountCode: '4101', debit: 0, credit: 987.65 },
      ],
    });
  });

  const originalAnchorClick = dom.window.HTMLAnchorElement.prototype.click;
  let exportDownload = '';
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    exportDownload = this.download;
  };

  try {
    render(React.createElement(
      ToastProvider,
      null,
      React.createElement(FinancialStatementsPage)
    ));
    await screen.findByText('إجمالي الأصول');

    fireEvent.click(screen.getByRole('button', { name: 'التدفقات النقدية' }));
    await screen.findByText('لا توجد حركات في الفترة المحددة');
    fireEvent.change(screen.getByLabelText('من تاريخ'), { target: { value: postingDate } });
    fireEvent.change(screen.getByLabelText('إلى تاريخ'), { target: { value: postingDate } });
    fireEvent.click(screen.getByRole('button', { name: 'تحديث القوائم المالية' }));

    const flowRow = await screen.findByText('2034-08');
    assert.match(flowRow.closest('tr')?.textContent || '', new RegExp(
      new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(987.65)
    ));

    fireEvent.click(screen.getByRole('button', { name: 'دفتر الأستاذ' }));
    const accountSelect = await screen.findByRole('combobox', { name: 'الحساب' });
    await waitFor(() => {
      assert.ok(Array.from((accountSelect as HTMLSelectElement).options).some((option) => option.textContent?.startsWith('1101')));
    });
    const cashAccount = Array.from((accountSelect as HTMLSelectElement).options)
      .find((option) => option.textContent?.startsWith('1101'));
    assert.ok(cashAccount);
    fireEvent.change(accountSelect, { target: { value: cashAccount.value } });
    assert.ok(await screen.findByText('Financial statement UI test'));

    fireEvent.click(screen.getByRole('button', { name: 'أعمار الديون' }));
    await screen.findByText('لا توجد مديونيات مستحقة');

    fireEvent.click(screen.getByRole('button', { name: 'الميزانية العمومية' }));
    await screen.findByText('إجمالي الأصول');
    const exportButton = screen.getByRole('button', { name: 'تصدير إلى Excel' });
    assert.equal((exportButton as HTMLButtonElement).disabled, false);
    fireEvent.click(exportButton);
    assert.match(exportDownload, /^balance-sheet-\d{4}-\d{2}-\d{2}\.xlsx$/);
  } finally {
    cleanup();
    dom.window.HTMLAnchorElement.prototype.click = originalAnchorClick;
    dom.window.close();
  }
});
