import { describe, it, expect } from 'vitest';
import { numberToWordsINR, formatDateDMY } from '../src/lib/format';

describe('format utilities', () => {
  it('converts numbers to Indian Rupees in words correctly', () => {
    expect(numberToWordsINR(2778)).toBe('Rupees Two Thousand Seven Hundred Seventy Eight Only');
    expect(numberToWordsINR(0)).toBe('Rupees Zero Only');
    expect(numberToWordsINR(100)).toBe('Rupees One Hundred Only');
    expect(numberToWordsINR(1000)).toBe('Rupees One Thousand Only');
    expect(numberToWordsINR(100000)).toBe('Rupees One Lakh Only');
    expect(numberToWordsINR(10000000)).toBe('Rupees One Crore Only');
    expect(numberToWordsINR(2123.5)).toBe('Rupees Two Thousand One Hundred Twenty Three and Fifty Paise Only');
  });

  it('formats dates in DD/MM/YYYY format', () => {
    const d = new Date(2026, 9, 10); // 10 Oct 2026
    expect(formatDateDMY(d)).toBe('10/10/2026');
  });
});
