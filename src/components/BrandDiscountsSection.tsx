import React, { useMemo } from 'react';
import { Tag, Percent, RotateCcw } from 'lucide-react';
import { formatINR } from '@/lib/format';

export interface BrandDiscountItem {
  brand?: string;
  qty: number;
  unit_price?: number;
  unit_cost?: number;
  line_total?: number;
}

export interface BrandWiseSummary {
  brand: string;
  itemCount: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  netAmount: number;
}

export interface BrandDiscountsTotals {
  grossSubtotal: number;
  totalDiscount: number;
  netTotal: number;
  effectiveDiscountPercent: number;
  brandSummaries: BrandWiseSummary[];
}

/**
 * Universal helper to calculate brand-wise breakdown and totals across
 * Sale Orders, Purchase Orders, Quotations, and Invoices.
 */
export function calculateBrandWiseTotals(
  items: BrandDiscountItem[],
  brandDiscounts: Record<string, number> = {},
  availableBrands: string[] = []
): BrandDiscountsTotals {
  // 1. Group items by brand
  const brandDataMap: Record<string, { count: number; subtotal: number }> = {};

  items.forEach((item) => {
    const rawBrand = (item.brand || '').trim();
    const brand = rawBrand || 'Standard';
    if (!brandDataMap[brand]) {
      brandDataMap[brand] = { count: 0, subtotal: 0 };
    }
    const qty = Math.max(0, Number(item.qty) || 0);
    const rate = Math.max(0, Number(item.unit_price ?? item.unit_cost) || 0);
    const lineTotal = item.line_total !== undefined && item.line_total > 0
      ? Number(item.line_total)
      : Math.round(qty * rate * 100) / 100;

    brandDataMap[brand].count += qty;
    brandDataMap[brand].subtotal += lineTotal;
  });

  // 2. Build unique list of all relevant brands
  const brandSet = new Set<string>();
  Object.keys(brandDataMap).forEach((b) => brandSet.add(b));
  availableBrands.forEach((b) => {
    if (b && b.trim()) brandSet.add(b.trim());
  });
  Object.keys(brandDiscounts).forEach((b) => {
    if (b && b.trim()) brandSet.add(b.trim());
  });

  // Always ensure standard defaults appear
  brandSet.add('Standard');
  brandSet.add('General');

  // Normalized case-insensitive discount map
  const normalizedDiscountMap = new Map<string, number>();
  for (const [k, v] of Object.entries(brandDiscounts)) {
    if (k && k.trim()) {
      normalizedDiscountMap.set(k.trim().toLowerCase(), Math.max(0, Math.min(100, Number(v) || 0)));
    }
  }

  // 3. Compute breakdown for each brand
  let grossSubtotal = 0;
  let totalDiscount = 0;

  const brandSummaries: BrandWiseSummary[] = Array.from(brandSet)
    .sort((a, b) => {
      // Put Standard and General first, then alphabetical
      if (a === 'Standard') return -1;
      if (b === 'Standard') return 1;
      if (a === 'General') return -1;
      if (b === 'General') return 1;
      return a.localeCompare(b);
    })
    .map((brand) => {
      const data = brandDataMap[brand] || { count: 0, subtotal: 0 };
      const brandSubtotal = Math.round(data.subtotal * 100) / 100;
      const lower = brand.toLowerCase();
      const discPct = normalizedDiscountMap.has(lower)
        ? normalizedDiscountMap.get(lower)!
        : 0;

      const discAmt = Math.round(((brandSubtotal * discPct) / 100) * 100) / 100;
      const net = Math.max(0, Math.round((brandSubtotal - discAmt) * 100) / 100);

      grossSubtotal += brandSubtotal;
      totalDiscount += discAmt;

      return {
        brand,
        itemCount: data.count,
        subtotal: brandSubtotal,
        discountPercent: discPct,
        discountAmount: discAmt,
        netAmount: net,
      };
    });

  grossSubtotal = Math.round(grossSubtotal * 100) / 100;
  totalDiscount = Math.round(totalDiscount * 100) / 100;
  const netTotal = Math.max(0, Math.round((grossSubtotal - totalDiscount) * 100) / 100);
  const effectiveDiscountPercent =
    grossSubtotal > 0 ? Math.round((totalDiscount / grossSubtotal) * 10000) / 100 : 0;

  return {
    grossSubtotal,
    totalDiscount,
    netTotal,
    effectiveDiscountPercent,
    brandSummaries,
  };
}

export interface BrandDiscountsSectionProps {
  items: BrandDiscountItem[];
  brandDiscounts: Record<string, number>;
  onChangeBrandDiscount: (brand: string, percent: number) => void;
  onClearAllDiscounts?: () => void;
  onApplyAllDiscounts?: (percent: number) => void;
  availableBrands?: string[];
  title?: string;
  subtitle?: string;
  readOnly?: boolean;
  className?: string;
}

export const BrandDiscountsSection: React.FC<BrandDiscountsSectionProps> = ({
  items,
  brandDiscounts,
  onChangeBrandDiscount,
  onClearAllDiscounts,
  onApplyAllDiscounts,
  availableBrands = [],
  title = 'Brand-Wise Discounts',
  subtitle = 'Enter manual discount percentage (%) for each cracker brand. Discounts are calculated automatically on the brand subtotal.',
  readOnly = false,
  className = '',
}) => {
  // Calculate full brand breakdown
  const calculations = useMemo(() => {
    return calculateBrandWiseTotals(items, brandDiscounts, availableBrands);
  }, [items, brandDiscounts, availableBrands]);

  const hasAnyDiscount = calculations.totalDiscount > 0;

  // Preset shortcut buttons for quick convenience
  const PRESET_DISCOUNTS = [5, 10, 15, 20, 25, 30];

  const handleApplyPresetAll = (pct: number) => {
    if (onApplyAllDiscounts) {
      onApplyAllDiscounts(pct);
    } else {
      calculations.brandSummaries.forEach((s) => {
        onChangeBrandDiscount(s.brand, pct);
      });
    }
  };

  const handleResetAll = () => {
    if (onClearAllDiscounts) {
      onClearAllDiscounts();
    } else {
      calculations.brandSummaries.forEach((s) => {
        onChangeBrandDiscount(s.brand, 0);
      });
    }
  };

  return (
    <div className={`bg-surface border border-border rounded-lg p-3.5 space-y-3 shadow-xs ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-1.5">
            <Percent size={15} className="text-accent" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-text">{title}</h4>
            {hasAnyDiscount && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
                Total Saved: -{formatINR(calculations.totalDiscount)} ({calculations.effectiveDiscountPercent}%)
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>}
        </div>

        {/* Quick Action Shortcuts (Apply all / Reset) */}
        {!readOnly && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-text-muted font-medium">Quick Set All:</span>
            {PRESET_DISCOUNTS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handleApplyPresetAll(pct)}
                className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-background hover:bg-accent hover:text-white border border-border text-text transition-colors"
                title={`Apply ${pct}% discount across all brands`}
              >
                {pct}%
              </button>
            ))}
            {hasAnyDiscount && (
              <button
                type="button"
                onClick={handleResetAll}
                className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-danger/10 hover:bg-danger hover:text-white text-danger border border-danger/30 transition-colors ml-1"
                title="Reset all brand discounts to 0%"
              >
                <RotateCcw size={10} />
                <span>Reset</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Brand Discounts Table / Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60 text-text-muted text-left text-[11px]">
              <th className="py-1.5 px-2 font-semibold">Brand / Manufacturer</th>
              <th className="py-1.5 px-2 font-semibold text-right">Items Subtotal (₹)</th>
              <th className="py-1.5 px-2 font-semibold text-center w-36">Discount %</th>
              <th className="py-1.5 px-2 font-semibold text-right">Discount (₹)</th>
              <th className="py-1.5 px-2 font-semibold text-right">Net Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {calculations.brandSummaries.map((b) => {
              const hasItems = b.itemCount > 0;
              const isDiscounted = b.discountPercent > 0;

              return (
                <tr
                  key={b.brand}
                  className={`transition-colors ${
                    hasItems ? (isDiscounted ? 'bg-accent/5' : 'hover:bg-background/50') : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  {/* Brand Name */}
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1.5">
                      <Tag size={12} className={hasItems ? 'text-accent' : 'text-text-muted'} />
                      <span className={`font-bold ${hasItems ? 'text-text' : 'text-text-muted'}`}>
                        {b.brand}
                      </span>
                      {hasItems ? (
                        <span className="text-[10px] text-text-muted font-mono">
                          ({b.itemCount} {b.itemCount === 1 ? 'box' : 'boxes'})
                        </span>
                      ) : (
                        <span className="text-[9px] text-text-muted italic">(No items)</span>
                      )}
                    </div>
                  </td>

                  {/* Items Subtotal */}
                  <td className="py-2 px-2 text-right font-mono font-semibold text-text">
                    {formatINR(b.subtotal)}
                  </td>

                  {/* Manual Discount % Input */}
                  <td className="py-2 px-2 text-center">
                    <div className="inline-flex items-center justify-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        disabled={readOnly}
                        value={b.discountPercent === 0 ? '' : b.discountPercent}
                        placeholder="0"
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                          onChangeBrandDiscount(b.brand, val);
                        }}
                        className={`w-20 text-center py-1 px-1.5 text-xs font-mono font-black border rounded focus:outline-none focus:ring-1 focus:ring-accent ${
                          isDiscounted
                            ? 'bg-accent text-white border-accent shadow-xs'
                            : 'bg-background text-text border-border hover:border-text-muted'
                        }`}
                      />
                      <span className="text-xs font-bold text-text-muted">%</span>
                    </div>
                  </td>

                  {/* Discount Amount in Rupees */}
                  <td className="py-2 px-2 text-right font-mono font-bold text-danger">
                    {b.discountAmount > 0 ? `- ${formatINR(b.discountAmount)}` : '₹0.00'}
                  </td>

                  {/* Net Brand Amount */}
                  <td className="py-2 px-2 text-right font-mono font-black text-text">
                    {formatINR(b.netAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Footer Bar */}
      <div className="p-2.5 bg-background rounded-md border border-border flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-text-muted">
            <span>Gross Value:</span>
            <strong className="text-text font-mono">{formatINR(calculations.grossSubtotal)}</strong>
          </div>
          {calculations.totalDiscount > 0 && (
            <div className="flex items-center gap-1 text-danger">
              <span>Brand Discount:</span>
              <strong className="font-mono">- {formatINR(calculations.totalDiscount)}</strong>
              <span className="text-[10px] font-bold text-success">({calculations.effectiveDiscountPercent}%)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-text-muted uppercase text-[11px] tracking-wide">Net Document Total:</span>
          <span className="text-sm font-black text-accent font-mono">
            {formatINR(calculations.netTotal)}
          </span>
        </div>
      </div>
    </div>
  );
};
