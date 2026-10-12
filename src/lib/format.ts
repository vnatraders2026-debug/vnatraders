// Formatting utilities for INR currency and IST date/time

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrNumberFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '₹0.00';
  }
  return inrFormatter.format(amount);
}

export function formatNumber(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '0.00';
  }
  return inrNumberFormatter.format(amount);
}

export function formatISTDate(dateInput: string | Date | number): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';

  // Format in IST timezone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };

  // e.g. "11 Oct 2026, 03:32 PM"
  const formatter = new Intl.DateTimeFormat('en-GB', options);
  const parts = formatter.formatToParts(d);

  let day = '';
  let month = '';
  let year = '';
  let hour = '';
  let minute = '';
  let dayPeriod = '';

  for (const part of parts) {
    if (part.type === 'day') day = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'year') year = part.value;
    if (part.type === 'hour') hour = part.value;
    if (part.type === 'minute') minute = part.value;
    if (part.type === 'dayPeriod') dayPeriod = part.value.toUpperCase();
  }

  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
}

export function formatISTDateOnly(dateInput: string | Date | number): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';

  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };

  const formatter = new Intl.DateTimeFormat('en-GB', options);
  const parts = formatter.formatToParts(d);

  let day = '';
  let month = '';
  let year = '';

  for (const part of parts) {
    if (part.type === 'day') day = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'year') year = part.value;
  }

  return `${day} ${month} ${year}`;
}

/**
 * Generate YYMMDD date code in IST timezone
 */
export function getISTYYMMDD(date: Date = new Date()): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  };

  const formatter = new Intl.DateTimeFormat('en-GB', options);
  const parts = formatter.formatToParts(date);

  let year = '';
  let month = '';
  let day = '';

  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }

  return `${year}${month}${day}`;
}

/**
 * Format bill number: YYMMDD-<DEVICE>-<SEQ> (e.g., 261011-A-0007)
 */
export function formatBillNo(dateStr: string, deviceCode: string, sequence: number): string {
  const cleanDevice = (deviceCode || 'A').toUpperCase().trim().slice(0, 2);
  const seqPadded = String(sequence).padStart(4, '0');
  return `${dateStr}-${cleanDevice}-${seqPadded}`;
}

export interface BrandTotalBreakdown {
  subtotal: number;
  discountPercent: number;
  discount: number;
  net: number;
}

export interface BillTotalsResult {
  subtotal: number;
  discountPercent: number;
  discount: number;
  total: number;
  brandTotals: Record<string, BrandTotalBreakdown>;
}

/**
 * Compute bill totals with percentage discount, supporting brand-wise discounts
 */
export function calculateBillTotals(
  items: Array<{ qty: number; unit_price: number; brand?: string }>,
  discountPercent: number = 0,
  brandDiscounts?: Record<string, number>
): BillTotalsResult {
  const brandSubtotals: Record<string, number> = {};

  items.forEach((item) => {
    const qty = Math.max(0, item.qty || 0);
    const price = Math.max(0, item.unit_price || 0);
    const lineTotal = Math.round(qty * price * 100) / 100;
    const brand = (item.brand || 'Standard').trim() || 'Standard';
    brandSubtotals[brand] = (brandSubtotals[brand] || 0) + lineTotal;
  });

  const rawSubtotal = Object.values(brandSubtotals).reduce((sum, v) => sum + v, 0);
  const subtotal = Math.round(rawSubtotal * 100) / 100;

  const hasBrandDiscounts =
    brandDiscounts &&
    Object.keys(brandDiscounts).length > 0 &&
    Object.values(brandDiscounts).some((pct) => pct > 0);

  const brandTotals: Record<string, BrandTotalBreakdown> = {};
  let totalDiscount = 0;

  if (hasBrandDiscounts) {
    Object.entries(brandSubtotals).forEach(([brand, bSub]) => {
      const bPct = Math.max(0, Math.min(100, brandDiscounts[brand] || 0));
      const bDisc = Math.round(((bSub * bPct) / 100) * 100) / 100;
      totalDiscount += bDisc;
      brandTotals[brand] = {
        subtotal: Math.round(bSub * 100) / 100,
        discountPercent: bPct,
        discount: bDisc,
        net: Math.max(0, Math.round((bSub - bDisc) * 100) / 100),
      };
    });
  } else {
    const validPercent = Math.max(0, Math.min(100, Math.round((discountPercent || 0) * 100) / 100));
    totalDiscount = Math.round(((subtotal * validPercent) / 100) * 100) / 100;
    Object.entries(brandSubtotals).forEach(([brand, bSub]) => {
      const bDisc = Math.round(((bSub * validPercent) / 100) * 100) / 100;
      brandTotals[brand] = {
        subtotal: Math.round(bSub * 100) / 100,
        discountPercent: validPercent,
        discount: bDisc,
        net: Math.max(0, Math.round((bSub - bDisc) * 100) / 100),
      };
    });
  }

  const finalDiscount = Math.min(subtotal, Math.round(totalDiscount * 100) / 100);
  const total = Math.max(0, Math.round((subtotal - finalDiscount) * 100) / 100);
  const effectivePercent =
    subtotal > 0 ? Math.round((finalDiscount / subtotal) * 10000) / 100 : 0;

  return {
    subtotal,
    discountPercent: hasBrandDiscounts ? effectivePercent : Math.max(0, Math.min(100, discountPercent)),
    discount: finalDiscount,
    total,
    brandTotals,
  };
}
