import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../src/features/billing/store';
import { Bill, BillItem, Product } from '../src/types';
import { consolidateBillItems } from '../src/lib/format';

describe('Bill Edit & Item Consolidation', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  it('consolidates repeated items when loading a bill for edit', () => {
    const mockBill: Bill = {
      id: 'bill-1',
      bill_no: '261016-A-0001',
      subtotal: 3200,
      discount: 0,
      total: 3200,
      payment_mode: 'cash',
      created_by: 'user-1',
      created_at: '2026-10-14T10:00:00.000Z',
      updated_at: '2026-10-14T10:00:00.000Z',
    };

    // Simulate 4 duplicated rows of Peacock 40 Items
    const mockItems: BillItem[] = [
      { id: 'item-1', bill_id: 'bill-1', product_id: 'prod-1', product_name: 'Peacock 40 Items', brand: 'Net', qty: 1, unit_price: 800, line_total: 800 },
      { id: 'item-2', bill_id: 'bill-1', product_id: 'prod-1', product_name: 'Peacock 40 Items', brand: 'Net', qty: 1, unit_price: 800, line_total: 800 },
      { id: 'item-3', bill_id: 'bill-1', product_id: 'prod-1', product_name: 'Peacock 40 Items', brand: 'Net', qty: 1, unit_price: 800, line_total: 800 },
      { id: 'item-4', bill_id: 'bill-1', product_id: 'prod-1', product_name: 'Peacock 40 Items', brand: 'Net', qty: 1, unit_price: 800, line_total: 800 },
    ];

    useCartStore.getState().loadBillForEdit(mockBill, mockItems);

    const cartItems = useCartStore.getState().items;
    // Should be collapsed into exactly 1 row with combined quantity of 4
    expect(cartItems).toHaveLength(1);
    expect(cartItems[0].product_name).toBe('Peacock 40 Items');
    expect(cartItems[0].qty).toBe(4);
    expect(cartItems[0].line_total).toBe(3200);
    expect(useCartStore.getState().editingBillId).toBe('bill-1');
    expect(useCartStore.getState().editingBillCreatedAt).toBe('2026-10-14T10:00:00.000Z');
  });

  it('increments quantity in the same row when adding more of the same product', () => {
    const product: Product = {
      id: 'prod-peacock',
      code: '1866',
      name: 'Peacock 40 Items',
      category: 'Gift Box',
      brand: 'General',
      unit: 'box',
      price: 800,
      stock: 50,
      is_active: true,
    };

    // Add first time
    useCartStore.getState().addItem(product, 1);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(1);

    // Add second time with same product
    useCartStore.getState().addItem(product, 2);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(3);
    expect(useCartStore.getState().items[0].line_total).toBe(2400);

    // Add by matching name & price even if product_id was unlinked
    const unlinkedProduct: Product = {
      ...product,
      id: 'different-uuid-but-same-name',
    };
    useCartStore.getState().addItem(unlinkedProduct, 1);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(4);
    expect(useCartStore.getState().items[0].line_total).toBe(3200);
  });

  it('consolidateBillItems collapses 20 duplicate entries into 4 distinct items', () => {
    // Simulate a bill where 4 products were each duplicated 5 times (= 20 rows)
    const items: BillItem[] = [];
    const products = [
      { name: '10cm Electric Sparklers', price: 120, brand: 'Standard' },
      { name: 'Ground Chakkar Big', price: 180, brand: 'Standard' },
      { name: 'Flower Pots Special', price: 250, brand: 'Standard' },
      { name: 'Peacock 40 Items', price: 800, brand: 'General' },
    ];

    // Duplicate each product 5 times
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let pIdx = 0; pIdx < products.length; pIdx++) {
        items.push({
          id: `item-${cycle}-${pIdx}`,
          bill_id: 'bill-mult',
          product_id: `prod-${pIdx}`,
          product_name: products[pIdx].name,
          brand: products[pIdx].brand,
          unit_price: products[pIdx].price,
          qty: 1,
          line_total: products[pIdx].price,
        });
      }
    }

    expect(items).toHaveLength(20);

    const result = consolidateBillItems(items);

    // Must be exactly 4 clean items with qty 5 each
    expect(result).toHaveLength(4);
    expect(result[0].product_name).toBe('10cm Electric Sparklers');
    expect(result[0].qty).toBe(5);
    expect(result[0].line_total).toBe(600);

    expect(result[3].product_name).toBe('Peacock 40 Items');
    expect(result[3].qty).toBe(5);
    expect(result[3].line_total).toBe(4000);
  });
});
