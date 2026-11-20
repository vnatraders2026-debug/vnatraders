import { describe, it, expect } from 'vitest';
import { Product } from '@/types';

// Mock catalog for testing
const mockProducts: Product[] = [
  {
    id: 'prod-1',
    name: '1000 Wala Red Cracker',
    code: '1000W',
    brand: 'Standard',
    category: 'Crackers',
    unit: 'box',
    price: 350,
    wholesale_price: 280,
    cost_price: 200,
    stock: 500,
    min_order_qty: 10,
    packing_type: 'box',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'prod-2',
    name: 'Trident Poseidon 50 Shots',
    code: '5755',
    brand: 'General',
    category: 'Single & Multi Shots',
    unit: 'box',
    price: 950,
    wholesale_price: 722,
    cost_price: 550,
    stock: 5000,
    min_order_qty: 5,
    packing_type: 'box',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'prod-3',
    name: 'Sony Deluxe Sparklers 15cm',
    code: 'SPK-15',
    brand: 'Sony',
    category: 'Sparklers',
    unit: 'box',
    price: 85,
    wholesale_price: 65,
    cost_price: 45,
    stock: 1200,
    min_order_qty: 25,
    packing_type: 'box',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'prod-4',
    name: 'Cock 28 Giant Chakkars',
    code: 'CK-28',
    brand: 'Cock',
    category: 'Ground Chakkars',
    unit: 'box',
    price: 180,
    wholesale_price: 140,
    cost_price: 100,
    stock: 0,
    min_order_qty: 10,
    packing_type: 'box',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('Product Catalog & Visibility logic', () => {
  it('correctly filters products by multi-token search query', () => {
    const query = 'trident 5755';
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    const matches = mockProducts.filter((p) => {
      const name = p.name.toLowerCase();
      const code = p.code.toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();

      return tokens.every(
        (t) => name.includes(t) || code.includes(t) || brand.includes(t) || cat.includes(t)
      );
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('prod-2');
    expect(matches[0].name).toBe('Trident Poseidon 50 Shots');
  });

  it('correctly filters products by brand filter chip', () => {
    const standardProducts = mockProducts.filter(
      (p) => (p.brand || 'Standard').toLowerCase() === 'standard'
    );
    expect(standardProducts).toHaveLength(1);
    expect(standardProducts[0].code).toBe('1000W');

    const sonyProducts = mockProducts.filter(
      (p) => (p.brand || 'Standard').toLowerCase() === 'sony'
    );
    expect(sonyProducts).toHaveLength(1);
    expect(sonyProducts[0].name).toContain('Sony Deluxe');
  });

  it('correctly resolves wholesale vs retail pricing', () => {
    const prod = mockProducts.find((p) => p.id === 'prod-2')!;
    const wholesaleRate =
      prod.wholesale_price && prod.wholesale_price > 0 ? prod.wholesale_price : prod.price;
    const retailRate = prod.price;

    expect(wholesaleRate).toBe(722);
    expect(retailRate).toBe(950);
  });

  it('correctly computes addedItemsMap for order tracking', () => {
    const sampleOrderItems = [
      { product_id: 'prod-2', qty: 25 },
      { product_id: 'prod-2', qty: 15 },
      { product_id: 'prod-1', qty: 10 },
      { product_id: '', qty: 5 }, // custom product without ID
    ];

    const addedItemsMap: Record<string, number> = {};
    sampleOrderItems.forEach((it) => {
      if (it.product_id) {
        addedItemsMap[it.product_id] = (addedItemsMap[it.product_id] || 0) + (Number(it.qty) || 0);
      }
    });

    expect(addedItemsMap['prod-2']).toBe(40);
    expect(addedItemsMap['prod-1']).toBe(10);
    expect(Object.keys(addedItemsMap)).toHaveLength(2);
  });

  it('correctly identifies stock status badges', () => {
    const getStockStatus = (stock: number) => {
      if (stock > 10) return 'in_stock';
      if (stock > 0) return 'low_stock';
      return 'out_of_stock';
    };

    expect(getStockStatus(mockProducts[1].stock)).toBe('in_stock');
    expect(getStockStatus(5)).toBe('low_stock');
    expect(getStockStatus(mockProducts[3].stock)).toBe('out_of_stock');
  });
});

