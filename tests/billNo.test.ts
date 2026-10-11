import { describe, it, expect } from 'vitest';
import { formatBillNo, getISTYYMMDD } from '../src/lib/format';

describe('Bill Number Generation', () => {
  it('formats bill number according to YYMMDD-<DEVICE>-<SEQ>', () => {
    const formatted = formatBillNo('261011', 'A', 7);
    expect(formatted).toBe('261011-A-0007');
  });

  it('pads sequence numbers properly', () => {
    expect(formatBillNo('261011', 'B', 1)).toBe('261011-B-0001');
    expect(formatBillNo('261011', 'B', 99)).toBe('261011-B-0099');
    expect(formatBillNo('261011', 'B', 1234)).toBe('261011-B-1234');
  });

  it('handles lowercase device code and defaults cleanly', () => {
    expect(formatBillNo('261011', 'c', 12)).toBe('261011-C-0012');
    expect(formatBillNo('261011', '', 5)).toBe('261011-A-0005');
  });

  it('extracts YYMMDD format from Date object in IST timezone', () => {
    const testDate = new Date('2026-10-11T10:00:00Z');
    const yymmdd = getISTYYMMDD(testDate);
    expect(yymmdd).toBe('261011');
  });
});
