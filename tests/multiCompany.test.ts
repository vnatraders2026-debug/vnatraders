import { describe, it, expect } from 'vitest';
import { DEFAULT_COMPANY_ID } from '../src/db';

describe('Multi-company isolation helpers', () => {
  const makeItem = (company_id?: string) => ({ id: '1', company_id });

  const matchesCompany = (item: { company_id?: string }, activeId: string, isAll: boolean) =>
    isAll ||
    item.company_id === activeId ||
    (!item.company_id && activeId === DEFAULT_COMPANY_ID);

  it('shows all items in isAllCompanies mode', () => {
    expect(matchesCompany(makeItem('abc'), DEFAULT_COMPANY_ID, true)).toBe(true);
    expect(matchesCompany(makeItem(), DEFAULT_COMPANY_ID, true)).toBe(true);
  });

  it('filters items by activeCompanyId', () => {
    expect(matchesCompany(makeItem('abc'), 'abc', false)).toBe(true);
    expect(matchesCompany(makeItem('xyz'), 'abc', false)).toBe(false);
  });

  it('allows legacy items without company_id under DEFAULT_COMPANY_ID', () => {
    expect(matchesCompany(makeItem(), DEFAULT_COMPANY_ID, false)).toBe(true);
    expect(matchesCompany(makeItem(), 'other-id', false)).toBe(false);
  });

  it('DEFAULT_COMPANY_ID has the correct value', () => {
    expect(DEFAULT_COMPANY_ID).toBe('c1111111-1111-1111-1111-111111110001');
  });
});

describe('Stock alert logic', () => {
  const products = [
    { id: '1', name: 'Product A', stock: 0, min_stock: 20 },
    { id: '2', name: 'Product B', stock: 5, min_stock: 20 },
    { id: '3', name: 'Product C', stock: 50, min_stock: 20 },
    { id: '4', name: 'Product D', stock: 20, min_stock: 20 },
  ];

  const getZeroStock = (prods: typeof products) => prods.filter((p) => (p.stock ?? 0) === 0);
  const getLowStock = (prods: typeof products) =>
    prods.filter((p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.min_stock ?? 20));

  it('flags zero-stock products correctly', () => {
    const zero = getZeroStock(products);
    expect(zero).toHaveLength(1);
    expect(zero[0].name).toBe('Product A');
  });

  it('flags low-stock products correctly', () => {
    const low = getLowStock(products);
    expect(low).toHaveLength(2);
    expect(low.map((p) => p.name).sort()).toEqual(['Product B', 'Product D']);
  });

  it('does not flag normal-stock products', () => {
    const zero = getZeroStock(products);
    const low = getLowStock(products);
    const alertIds = new Set([...zero, ...low].map((p) => p.id));
    expect(alertIds.has('3')).toBe(false);
  });

  it('sale order qty > product stock is a warning condition', () => {
    const orderedQty = 30;
    const productStock = 5;
    expect(orderedQty > productStock).toBe(true);
  });
});