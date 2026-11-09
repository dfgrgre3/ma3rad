import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { Customer } from '../src/types/index.ts';

test('POS customer selection dialog uses shared option rows and preserves selection behavior', async () => {
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
  const { PosCustomerSelectionDialog } = await import('../src/components/pos/PosCustomerSelectionDialog.tsx');
  const customer: Customer = {
    id: 'customer-selection-test',
    code: 'CUS-001',
    name: 'عميل الاختبار',
    phone: '01000000000',
    customerType: 'RETAIL',
    creditLimit: 1000,
    currentBalance: 0,
    totalPurchases: 0,
    isActive: 1,
    createdAt: '',
    updatedAt: '',
  };
  let selected: Customer | undefined;
  let closed = false;

  try {
    render(React.createElement(PosCustomerSelectionDialog, {
      isOpen: true,
      customerService: {
        getCustomersPage: () => ({
          items: [customer],
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
        }),
      },
      selectedCustomerId: customer.id,
      onClose: () => { closed = true; },
      onSelectCustomer: (nextCustomer: Customer) => { selected = nextCustomer; },
    }));

    await screen.findByText(customer.name);
    const table = document.querySelector('table.selection-list');
    const row = table?.querySelector('tr.selection-list__row');
    assert.ok(table);
    assert.ok(row);
    assert.equal(row.getAttribute('aria-selected'), 'true');
    assert.ok(row.classList.contains('is-selected'));
    assert.equal(screen.getByText('نشط').tagName, 'SPAN');

    fireEvent.click(screen.getByRole('button', { name: 'محدد' }));
    await waitFor(() => {
      assert.equal(selected, customer);
      assert.equal(closed, true);
    });
  } finally {
    cleanup();
    dom.window.close();
  }
});
