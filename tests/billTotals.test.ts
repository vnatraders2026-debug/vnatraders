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

  it('applies percentage discount correctly', () => {
    const items = [
      { qty: 1, unit_price: 1000 },
    ];
    // 15% discount on 1000 = 150
    const { subtotal, discountPercent, discount, total } = calculateBillTotals(items, 15);

    expect(subtotal).toBe(1000);
    expect(discountPercent).toBe(15);
    expect(discount).toBe(150);
    expect(total).toBe(850);
  });

  it('clamps discount percentage so it cannot exceed 100%', () => {
    const items = [
      { qty: 1, unit_price: 200 },
    ];
    // 120% discount clamped to 100%
    const { subtotal, discountPercent, discount, total } = calculateBillTotals(items, 120);

    expect(subtotal).toBe(200);
    expect(discountPercent).toBe(100);
    expect(discount).toBe(200);
    expect(total).toBe(0);
  });

  it('handles negative discount percentage gracefully', () => {
    const items = [
      { qty: 2, unit_price: 150 },
    ];
    const { subtotal, discountPercent, discount, total } = calculateBillTotals(items, -10);

    expect(subtotal).toBe(300);
    expect(discountPercent).toBe(0);
    expect(discount).toBe(0);
    expect(total).toBe(300);
  });

  it('handles empty item list', () => {
    const { subtotal, discountPercent, discount, total } = calculateBillTotals([], 10);

    expect(subtotal).toBe(0);
    expect(discountPercent).toBe(10);
    expect(discount).toBe(0);
    expect(total).toBe(0);
  });

  it('calculates brand-specific discounts accurately for mixed brand bills', () => {
    const items = [
      { qty: 2, unit_price: 500, brand: 'Standard' }, // 1000 Standard
      { qty: 1, unit_price: 1000, brand: 'General' },  // 1000 General
      { qty: 1, unit_price: 200, brand: 'Sony' },     // 200 Sony
    ];

    // Standard gets 70% off (= 700), General gets 20% off (= 200), Sony gets 0%
    const brandDiscounts = {
      Standard: 70,
      General: 20,
    };

    const result = calculateBillTotals(items, 0, brandDiscounts);

    expect(result.subtotal).toBe(2200);
    expect(result.discount).toBe(900); // 700 + 200
    expect(result.total).toBe(1300); // 2200 - 900
    expect(result.brandTotals['Standard'].subtotal).toBe(1000);
    expect(result.brandTotals['Standard'].discount).toBe(700);
    expect(result.brandTotals['Standard'].net).toBe(300);
    expect(result.brandTotals['General'].subtotal).toBe(1000);
    expect(result.brandTotals['General'].discount).toBe(200);
    expect(result.brandTotals['General'].net).toBe(800);
    expect(result.brandTotals['Sony'].subtotal).toBe(200);
    expect(result.brandTotals['Sony'].discount).toBe(0);
    expect(result.brandTotals['Sony'].net).toBe(200);
  });
});

