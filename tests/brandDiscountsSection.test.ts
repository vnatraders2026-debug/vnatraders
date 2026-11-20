import { describe, it, expect } from 'vitest';
import { calculateBrandWiseTotals } from '@/components/BrandDiscountsSection';

describe('BrandDiscountsSection & calculateBrandWiseTotals', () => {
  it('correctly aggregates gross subtotal by brand when no discounts are entered', () => {
    const items = [
      { brand: 'Standard', qty: 10, unit_price: 100, line_total: 1000 },
      { brand: 'Standard', qty: 5, unit_price: 200, line_total: 1000 },
      { brand: 'Sony', qty: 4, unit_price: 500, line_total: 2000 },
      { brand: 'General', qty: 2, unit_price: 250, line_total: 500 },
    ];

    const result = calculateBrandWiseTotals(items, {});

    expect(result.grossSubtotal).toBe(4500);
    expect(result.totalDiscount).toBe(0);
    expect(result.netTotal).toBe(4500);
    expect(result.effectiveDiscountPercent).toBe(0);

    const standard = result.brandSummaries.find((b) => b.brand === 'Standard');
    expect(standard).toBeDefined();
    expect(standard?.subtotal).toBe(2000);
    expect(standard?.discountPercent).toBe(0);
    expect(standard?.discountAmount).toBe(0);
    expect(standard?.netAmount).toBe(2000);

    const sony = result.brandSummaries.find((b) => b.brand === 'Sony');
    expect(sony?.subtotal).toBe(2000);
    expect(sony?.netAmount).toBe(2000);
  });

  it('accurately applies manual brand discounts per brand', () => {
    const items = [
      { brand: 'Standard', qty: 10, unit_price: 100, line_total: 1000 }, // Standard: ₹1000 @ 10% = ₹100 disc, net ₹900
      { brand: 'Sony', qty: 2, unit_price: 1000, line_total: 2000 },     // Sony: ₹2000 @ 20% = ₹400 disc, net ₹1600
      { brand: 'General', qty: 5, unit_price: 200, line_total: 1000 },   // General: ₹1000 @ 0% = ₹0 disc, net ₹1000
    ];

    const discounts = {
      Standard: 10,
      Sony: 20,
      General: 0,
    };

    const result = calculateBrandWiseTotals(items, discounts);

    expect(result.grossSubtotal).toBe(4000);
    expect(result.totalDiscount).toBe(500); // 100 + 400 = 500
    expect(result.netTotal).toBe(3500); // 4000 - 500 = 3500
    expect(result.effectiveDiscountPercent).toBe(12.5); // 500 / 4000 = 12.5%

    const standard = result.brandSummaries.find((b) => b.brand === 'Standard');
    expect(standard?.discountPercent).toBe(10);
    expect(standard?.discountAmount).toBe(100);
    expect(standard?.netAmount).toBe(900);

    const sony = result.brandSummaries.find((b) => b.brand === 'Sony');
    expect(sony?.discountPercent).toBe(20);
    expect(sony?.discountAmount).toBe(400);
    expect(sony?.netAmount).toBe(1600);
  });

  it('supports unit_cost for purchase orders seamlessly', () => {
    const poItems = [
      { brand: 'Cock', qty: 50, unit_cost: 60, line_total: 3000 }, // ₹3000 @ 15% = ₹450
      { brand: 'Standard', qty: 20, unit_cost: 100, line_total: 2000 }, // ₹2000 @ 5% = ₹100
    ];

    const result = calculateBrandWiseTotals(poItems, { Cock: 15, Standard: 5 });

    expect(result.grossSubtotal).toBe(5000);
    expect(result.totalDiscount).toBe(550);
    expect(result.netTotal).toBe(4450);
  });

  it('handles case-insensitive brand names gracefully', () => {
    const items = [
      { brand: 'STANDARD', qty: 10, unit_price: 100, line_total: 1000 },
    ];

    const result = calculateBrandWiseTotals(items, { standard: 10 });
    expect(result.totalDiscount).toBe(100);
    expect(result.netTotal).toBe(900);
  });
});
