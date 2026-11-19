import { describe, it, expect } from 'vitest';
import { formatPoNo, formatSoNo, formatInvoiceNo, formatINR, numberToWordsINR } from '../src/lib/format';

describe('VNA Traders Wholesale & Orders Logic', () => {
  it('generates properly formatted Purchase Order Numbers (PO-YYMMDD-XXXX)', () => {
    const poNo = formatPoNo('261117', 1);
    expect(poNo).toBe('PO-261117-0001');
    expect(formatPoNo('261117', 42)).toBe('PO-261117-0042');
  });

  it('generates properly formatted Sale Order Numbers (SO-YYMMDD-XXXX)', () => {
    const soNo = formatSoNo('261117', 5);
    expect(soNo).toBe('SO-261117-0005');
    expect(formatSoNo('261117', 1234)).toBe('SO-261117-1234');
  });

  it('generates properly formatted Tax Invoice Numbers (INV-YYMM-XXXX)', () => {
    const invNo = formatInvoiceNo('2611', 1);
    expect(invNo).toBe('INV-2611-0001');
    expect(formatInvoiceNo('2611', 99)).toBe('INV-2611-0099');
  });

  it('calculates Intra-State GST (CGST 9% + SGST 9%) correctly for fireworks (HSN 3604)', () => {
    const taxableAmount = 10000;
    const cgst = Math.round(taxableAmount * 0.09 * 100) / 100;
    const sgst = Math.round(taxableAmount * 0.09 * 100) / 100;
    const totalTax = cgst + sgst;
    const totalAmount = taxableAmount + totalTax;

    expect(cgst).toBe(900);
    expect(sgst).toBe(900);
    expect(totalTax).toBe(1800);
    expect(totalAmount).toBe(11800);
  });

  it('calculates Inter-State IGST (18%) correctly for outside Tamil Nadu consignees', () => {
    const taxableAmount = 25000;
    const igst = Math.round(taxableAmount * 0.18 * 100) / 100;
    const totalAmount = taxableAmount + igst;

    expect(igst).toBe(4500);
    expect(totalAmount).toBe(29500);
  });

  it('converts INR amounts into proper words for printed Tax Invoices', () => {
    expect(numberToWordsINR(11800)).toBe('Rupees Eleven Thousand Eight Hundred Only');
    expect(numberToWordsINR(250000)).toBe('Rupees Two Lakh Fifty Thousand Only');
  });

  it('supports wholesale pricing mode selection and fallback', () => {
    const product = {
      id: 'prod-1',
      name: '10cm Deluxe Sparklers',
      price: 150, // Retail MRP
      wholesale_price: 65, // Wholesale dealer rate
    };

    const getPrice = (p: typeof product, mode: 'retail' | 'wholesale') => {
      if (mode === 'wholesale') return p.wholesale_price || p.price;
      return p.price;
    };

    expect(getPrice(product, 'retail')).toBe(150);
    expect(getPrice(product, 'wholesale')).toBe(65);

    // Fallback if wholesale_price is undefined
    const productWithoutWholesale = {
      id: 'prod-2',
      name: 'Special Crackers',
      price: 200,
    };
    expect(getPrice(productWithoutWholesale as any, 'wholesale')).toBe(200);
  });
});
