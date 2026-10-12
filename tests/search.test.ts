import { describe, it, expect, beforeEach } from 'vitest';
import { createProductSearchIndex, searchProducts } from '../src/db/search';
import { Product } from '../src/types';

describe('searchProducts - Only name, code, and price', () => {
  const sampleProducts: Product[] = [
    {
      id: 'p-1',
      code: '166',
      name: 'Andal Naachiar 70 Items',
      category: 'Gift Boxes',
      unit: 'box',
      price: 1500.0,
      stock: 100,
      is_active: true,
      brand: 'General',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'p-2',
      code: 'SPK-10',
      name: 'Electric Wonder',
      category: 'Sparklers',
      unit: 'box',
      price: 450.0,
      stock: 50,
      is_active: true,
      brand: 'Standard',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'p-3',
      code: '265',
      name: 'Paper Bomb 1Kg',
      category: 'Bombs & Sound Crackers',
      unit: 'box',
      price: 190.0,
      stock: 30,
      is_active: true,
      brand: 'General',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    createProductSearchIndex(sampleProducts);
  });

  it('searches by product name', () => {
    const results = searchProducts('Andal', sampleProducts);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].code).toBe('166');
  });

  it('searches by product code', () => {
    const results = searchProducts('SPK-10', sampleProducts);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Electric Wonder');
  });

  it('searches by numeric code', () => {
    const results = searchProducts('265', sampleProducts);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Paper Bomb 1Kg');
  });

  it('searches by price', () => {
    const results1500 = searchProducts('1500', sampleProducts);
    expect(results1500.length).toBeGreaterThan(0);
    expect(results1500[0].code).toBe('166');

    const results450 = searchProducts('450', sampleProducts);
    expect(results450.length).toBeGreaterThan(0);
    expect(results450[0].code).toBe('SPK-10');
  });

  it('does NOT match by brand name alone if not in name, code, or price', () => {
    // Neither Andal Naachiar nor Paper Bomb has 'Standard' in name/code/price.
    // 'Standard' is only the brand of SPK-10 (Electric Wonder).
    const results = searchProducts('Standard', sampleProducts);
    // Since 'Standard' is not in name, code, or price of SPK-10, it shouldn't return SPK-10
    expect(results.some((p) => p.name === 'Electric Wonder')).toBe(false);
  });

  it('does NOT match by category name alone if not in name, code, or price', () => {
    // 'Gift Boxes' is the category of Andal Naachiar (166), but not in its name/code/price
    const results = searchProducts('Gift Boxes', sampleProducts);
    expect(results.some((p) => p.code === '166')).toBe(false);
  });
});
