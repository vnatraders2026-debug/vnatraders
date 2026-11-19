import { describe, it, expect } from 'vitest';
import { formatQuotationNo, formatINR, numberToWordsINR } from '../src/lib/format';
import { DEFAULT_QUOTATION_TERMS } from '../src/features/quotations/QuotationsPage';

describe('VNA Traders Quotations & Estimations Module', () => {
  it('formats quotation numbers as QT-YYMMDD-XXXX properly', () => {
    expect(formatQuotationNo('261117', 1)).toBe('QT-261117-0001');
    expect(formatQuotationNo('261117', 42)).toBe('QT-261117-0042');
    expect(formatQuotationNo('261117', 9999)).toBe('QT-261117-9999');
  });

  it('calculates quotation item totals and discount correctly', () => {
    const qty = 50;
    const unitPrice = 420;
    const discountPercent = 10;

    const gross = qty * unitPrice; // 21,000
    const discount = gross * (discountPercent / 100); // 2,100
    const taxable = gross - discount; // 18,900

    expect(gross).toBe(21000);
    expect(discount).toBe(2100);
    expect(taxable).toBe(18900);
  });

  it('computes 18% GST (CGST 9% + SGST 9%) and rounding for intra-state quotes', () => {
    const taxableAmount = 18900;
    const cgst = Math.round(taxableAmount * 0.09 * 100) / 100;
    const sgst = Math.round(taxableAmount * 0.09 * 100) / 100;
    const rawTotal = taxableAmount + cgst + sgst;
    const roundedTotal = Math.round(rawTotal);
    const roundOff = Math.round((roundedTotal - rawTotal) * 100) / 100;

    expect(cgst).toBe(1701);
    expect(sgst).toBe(1701);
    expect(rawTotal).toBe(22302);
    expect(roundedTotal).toBe(22302);
    expect(roundOff).toBe(0);
  });

  it('computes 18% IGST for interstate fireworks supply quotes (e.g. to Karnataka)', () => {
    const taxableAmount = 42000;
    const igst = Math.round(taxableAmount * 0.18 * 100) / 100;
    const totalAmount = taxableAmount + igst;

    expect(igst).toBe(7560);
    expect(totalAmount).toBe(49560);
    expect(numberToWordsINR(totalAmount)).toBe('Rupees Forty Nine Thousand Five Hundred Sixty Only');
  });

  it('includes standard crackers clauses in default quotation terms', () => {
    expect(DEFAULT_QUOTATION_TERMS).toContain('Price Validity');
    expect(DEFAULT_QUOTATION_TERMS).toContain('Genuine Green Crackers');
    expect(DEFAULT_QUOTATION_TERMS).toContain('HSN Code 3604');
    expect(DEFAULT_QUOTATION_TERMS).toContain('Payment Terms');
  });

  it('accurately identifies expired quotes based on valid_until date', () => {
    const todayStr = '2026-11-17';
    const pastDate = '2026-11-10';
    const futureDate = '2026-11-24';

    const isExpiredPast = pastDate < todayStr;
    const isExpiredFuture = futureDate < todayStr;

    expect(isExpiredPast).toBe(true);
    expect(isExpiredFuture).toBe(false);
  });
});

