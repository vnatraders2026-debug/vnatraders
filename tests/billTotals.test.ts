import { describe, it, expect } from 'vitest';
import { calculateBillTotals, formatBillNo, getISTYYMMDD } from '../src/lib/format';

describe('Bill Total Calculations', () => {
  it('calculates subtotal correctly for multiple items', () => {
    const items = [
      { qty: 2, unit_price: 45.0 }, // 90.00
      { qty: 3, unit_price: 110.0 }, // 330.00
      { qty: 1, unit_price: 260.5 }, // 260.50
    ];
    const { subtotal, discount, total } = calculateBillTotals(items, 0);

    expect(subtotal).toBe(680.5);
    expect(discount).toBe(0);
    expect(total).toBe(680.5);
  });

  it('applies discount correctly within range', () => {
    const items = [
      { qty: 1, unit_price: 1000 },
    ];
    const { subtotal, discount, total } = calculateBillTotals(items, 150);

    expect(subtotal).toBe(1000);
    expect(discount).toBe(150);
    expect(total).toBe(850);
  });

  it('clamps discount so it cannot exceed subtotal', () => {
    const items = [
      { qty: 1, unit_price: 200 },
    ];
    const { subtotal, discount, total } = calculateBillTotals(items, 500);

    expect(subtotal).toBe(200);
    expect(discount).toBe(200);
    expect(total).toBe(0);
  });

  it('handles negative discount gracefully', () => {
    const items = [
      { qty: 2, unit_price: 150 },
    ];
    const { subtotal, discount, total } = calculateBillTotals(items, -50);

    expect(subtotal).toBe(300);
    expect(discount).toBe(0);
    expect(total).toBe(300);
  });

  it('handles empty item list', () => {
    const { subtotal, discount, total } = calculateBillTotals([], 100);

    expect(subtotal).toBe(0);
    expect(discount).toBe(0);
    expect(total).toBe(0);
  });
});
