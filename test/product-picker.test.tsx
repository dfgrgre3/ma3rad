import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { Product } from '../src/types/index.ts';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/auth/AuthService.ts';
import { PermissionService } from '../src/services/auth/PermissionService.ts';
import { ProductService } from '../src/services/products/ProductService.ts';
import { CategoryService } from '../src/services/products/CategoryService.ts';
import { BrandService } from '../src/services/products/BrandService.ts';

test('product picker searches, filters, paginates, and returns the selected product', async () => {
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
  const { ProductPicker } = await import('../src/components/products/ProductPicker.tsx');
  const product = (id: string, name: string): Product => ({
    id,
    name,
    sku: `SKU-${id}`,
    barcode: `BAR-${id}`,
    categoryId: 'category-1',
    categoryName: 'تصنيف تجريبي',
    brandId: 'brand-1',
    brandName: 'ماركة تجريبية',
    grade: '',
    size: '60x60',
    baseUnit: 'M2',
    sellUnit: 'M2',
    piecesPerBox: 4,
    metersPerBox: 1.44,
    costPrice: 1,
    sellingPriceM2: 2,
    sellingPriceBox: 3,
    wholesalePriceM2: 1.5,
    minSellingPriceM2: 1,
    minStockLevel: 10,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  });
  const firstProduct = product('product-1', 'صنف 01');
  const secondPageProduct = product('product-26', 'صنف 26');
  const calls: Array<{ search: string; categoryId?: string; brandId?: string; page: number; options: unknown }> = [];
  let selectedProductId = '';
  let selectedProduct: Product | undefined;
  const originalGetProductsPage = ProductService.prototype.getProductsPage;
  const originalGetCategories = CategoryService.prototype.getAllCategories;
  const originalGetBrands = BrandService.prototype.getAllBrands;

  ProductService.prototype.getProductsPage = function getProductsPage(search, categoryId, brandId, page = 1, pageSize = 25, options = {}) {
    calls.push({ search, categoryId, brandId, page, options });
    const items = page === 1 ? [firstProduct] : [secondPageProduct];
    return { items, page, pageSize, totalItems: 26, totalPages: 2 };
  };
  CategoryService.prototype.getAllCategories = () => [{ id: 'category-1', name: 'تصنيف تجريبي' }] as any;
  BrandService.prototype.getAllBrands = () => [{ id: 'brand-1', name: 'ماركة تجريبية' }] as any;

  try {
    const onChange = (productId: string, selected: Product) => {
      selectedProductId = productId;
      selectedProduct = selected;
    };
    render(React.createElement(ProductPicker, {
      value: '',
      onChange,
      ariaLabel: 'استعراض أصناف الاختبار',
      allowedProductIds: ['product-1', 'product-26'],
    }));

    fireEvent.change(screen.getByRole('combobox', { name: 'بحث عن أصناف الاختبار' }), {
      target: { value: 'صنف 01' },
    });
    const suggestion = await screen.findByRole('button', { name: /صنف 01/ });
    const suggestionsPanel = screen.getByTestId('product-suggestions-panel');
    assert.ok(suggestionsPanel.classList.contains('selection-list'));
    assert.ok(suggestion.classList.contains('selection-list__row'));
    assert.equal(suggestionsPanel.style.width, 'max-content');
    assert.ok(suggestionsPanel.style.maxWidth);
    assert.ok(Number.parseFloat(suggestionsPanel.style.maxHeight) <= 420);
    assert.equal(suggestionsPanel.querySelector('[data-resize-handle]'), null);
    assert.equal(screen.queryByRole('button', { name: /تكبير نافذة النتائج/ }), null);

    fireEvent.click(suggestion);
    await waitFor(() => {
      assert.equal(selectedProductId, firstProduct.id);
      assert.equal(selectedProduct?.name, firstProduct.name);
    });

    const browseProductsButton = screen.getByRole('button', { name: 'استعراض أصناف الاختبار' });
    assert.ok(browseProductsButton.querySelector('svg'));
    assert.equal(browseProductsButton.textContent?.trim(), '');
    assert.equal(screen.queryByText('القائمة'), null);
    fireEvent.click(browseProductsButton);
    await screen.findByText('صنف 01');
    assert.ok(document.querySelector('.selection-list'));
    await waitFor(() => assert.ok(calls.some((call) => call.page === 1)));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'SKU-26' } });
    fireEvent.change(screen.getByLabelText('تصفية حسب التصنيف'), { target: { value: 'category-1' } });
    fireEvent.change(screen.getByLabelText('تصفية حسب الماركة'), { target: { value: 'brand-1' } });
    fireEvent.change(screen.getByLabelText('تصفية حسب حالة المخزون'), { target: { value: 'low' } });
    fireEvent.change(screen.getByLabelText('ترتيب الأصناف'), { target: { value: 'price_desc' } });
    await waitFor(() => {
      assert.ok(calls.some((call) => call.search === 'SKU-26'
        && call.categoryId === 'category-1'
        && call.brandId === 'brand-1'
        && (call.options as { stockStatus?: string }).stockStatus === 'low'
        && (call.options as { productIds?: string[] }).productIds?.join(',') === 'product-1,product-26'
        && (call.options as { sortBy?: string }).sortBy === 'price_desc'));
    });

    fireEvent.click(screen.getByRole('button', { name: /التالي/ }));
    const productButton = await screen.findByRole('button', { name: /صنف 26/ });
    fireEvent.click(productButton);
    await waitFor(() => {
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.ok(calls.some((call) => call.page === 2));
      assert.equal(selectedProductId, secondPageProduct.id);
      assert.equal(selectedProduct?.name, secondPageProduct.name);
    });
  } finally {
    cleanup();
    ProductService.prototype.getProductsPage = originalGetProductsPage;
    CategoryService.prototype.getAllCategories = originalGetCategories;
    BrandService.prototype.getAllBrands = originalGetBrands;
    dom.window.close();
  }
});

test('product pages can restrict results to an allowed product set', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  try {
    const suffix = Date.now().toString();
    const service = new ProductService();
    const createProduct = (name: string) => service.createProduct({
      sku: `PICKER-${name}-${suffix}`,
      barcode: `PICKER-BAR-${name}-${suffix}`,
      name: `Picker ${name} ${suffix}`,
      categoryId: 'cat_floor',
      brandId: 'br_cleo',
      grade: 'GRADE_1',
      size: '60x60',
      baseUnit: 'M2',
      sellUnit: 'M2',
      piecesPerBox: 4,
      metersPerBox: 1.44,
      costPrice: 10,
      sellingPriceM2: 20,
      sellingPriceBox: 28,
      wholesalePriceM2: 18,
      minSellingPriceM2: 15,
      minStockLevel: 10,
      isActive: true,
    });
    const allowed = createProduct('allowed');
    createProduct('excluded');

    const page = service.getProductsPage('', undefined, undefined, 1, 25, { productIds: [allowed.id] });
    assert.deepEqual(page.items.map((item) => item.id), [allowed.id]);
  } finally {
    AuthService.logout();
  }
});
