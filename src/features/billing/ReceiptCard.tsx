import React from 'react';
import { Bill, BillItem, ShopSettings } from '@/types';
import { formatINR, formatISTDate, formatNumber, consolidateBillItems } from '@/lib/format';
import { QR_CODE_DATA_URI } from '@/assets/qrCodeDataUri';

interface ReceiptCardProps {
  bill: Bill;
  items: BillItem[];
  settings: ShopSettings;
  billedBy?: string;
  showScanPay?: boolean;
  id?: string;
  className?: string;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  bill,
  items,
  settings,
  billedBy,
  showScanPay = true,
  id = 'receipt-print-area',
  className = '',
}) => {
  const is58mm = settings.paper_size === '58mm';

  // Consolidate identical items by product so repeated items appear in one row with combined qty
  const consolidatedItems = React.useMemo(() => {
    return consolidateBillItems(items);
  }, [items]);

  // Check if brand_discounts is configured on this bill
  const hasBrandDiscounts =
    Boolean(bill.brand_discounts) &&
    Object.keys(bill.brand_discounts || {}).length > 0 &&
    Object.values(bill.brand_discounts || {}).some((pct) => (pct || 0) > 0);

  // Helper to get discount percentage strictly matching A4 invoice logic
  const getBrandDiscountPercent = (bName: string): number => {
    if (hasBrandDiscounts && bill.brand_discounts) {
      const target = bName.trim().toLowerCase();
      for (const [key, val] of Object.entries(bill.brand_discounts)) {
        if (key.trim().toLowerCase() === target) {
          return Math.max(0, Math.min(100, val || 0));
        }
      }
      return 0;
    }
    if (bill.discount > 0 && bill.subtotal > 0) {
      return Math.max(0, Math.min(100, Math.round((bill.discount / bill.subtotal) * 10000) / 100));
    }
    return 0;
  };

  // Group items by brand/category
  const brandGroups = React.useMemo(() => {
    const groupsMap = new Map<string, { displayName: string; items: BillItem[] }>();
    consolidatedItems.forEach((item) => {
      const rawBrand = (item.brand || 'Standard').trim() || 'Standard';
      const normKey = rawBrand.toLowerCase();
      const existing = groupsMap.get(normKey);
      if (existing) {
        existing.items.push(item);
      } else {
        groupsMap.set(normKey, { displayName: rawBrand.toUpperCase(), items: [item] });
      }
    });

    const groups: Array<{
      brandKey: string;
      displayName: string;
      items: BillItem[];
      subtotal: number;
      discountPct: number;
      discountAmount: number;
      netAmount: number;
    }> = [];

    // Sort to show Standard first, then other brands
    const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
      if (a === 'standard') return -1;
      if (b === 'standard') return 1;
      return a.localeCompare(b);
    });

    sortedKeys.forEach((key) => {
      const entry = groupsMap.get(key)!;
      const gItems = entry.items;
      const gSubtotal = gItems.reduce(
        (acc, it) => acc + (it.line_total || it.qty * it.unit_price),
        0
      );
      const discountPct = getBrandDiscountPercent(key);
      const discountAmount =
        discountPct > 0 ? Math.round(((gSubtotal * discountPct) / 100) * 100) / 100 : 0;
      const netAmount = Math.max(0, Math.round((gSubtotal - discountAmount) * 100) / 100);

      groups.push({
        brandKey: key,
        displayName: entry.displayName,
        items: gItems,
        subtotal: gSubtotal,
        discountPct,
        discountAmount,
        netAmount,
      });
    });

    return groups;
  }, [consolidatedItems, bill.brand_discounts, bill.discount, bill.subtotal]);

  return (
    <div
      id={id}
      className={`p-2 sm:p-4 bg-white text-black font-mono text-xs space-y-2 print:border-none print:p-1 print:m-0 print:bg-white w-full ${
        is58mm ? 'receipt-58mm' : ''
      } ${className}`}
      style={{
        margin: '0 auto',
        width: '100%',
        maxWidth: '100%',
        color: '#000000',
        backgroundColor: '#ffffff',
        border: 'none',
        borderRadius: 0,
        boxShadow: 'none',
      }}
    >
      {/* Shop Header (Center Aligned) */}
      <div className="text-center space-y-0.5">
        <h3 className="text-sm font-black uppercase tracking-wider text-black">{settings.shop_name}</h3>
        <p className="text-[11px] font-medium text-black">{settings.shop_address}</p>
        <p className="text-[11px] font-bold text-black">Ph: {settings.shop_phone}</p>
        {settings.gst_no && (
          <p className="text-[10px] font-bold text-black">GST: {settings.gst_no}</p>
        )}
      </div>

      <div className="border-t-2 border-dashed border-black my-1.5" />

      {/* Bill Meta (Center Aligned) */}
      <div className="text-center text-[11px] font-bold text-black space-y-0.5">
        <div>Bill: <span className="font-mono text-black font-black">{bill.bill_no}</span></div>
        <div className="text-black font-semibold text-[10px]">{formatISTDate(bill.created_at)}</div>
        {(bill.customer_name || bill.customer_phone) && (
          <div className="text-[10px] font-medium text-black pt-0.5">
            {bill.customer_name && <span>Customer: <strong className="text-black font-bold">{bill.customer_name}</strong> </span>}
            {bill.customer_phone && <span className="font-semibold text-black">({bill.customer_phone})</span>}
          </div>
        )}
      </div>

      <div className="border-t-2 border-dashed border-black my-1.5" />

      {/* Brand / Category Wise Grouped Items */}
      <div className="space-y-2">
        {brandGroups.map((group) => (
          <div key={group.brandKey} className="space-y-1">
            {/* BRAND HEADER (e.g., STANDARD, NET, GENERAL) */}
            <div className="text-center font-black uppercase text-xs py-0.5 border-t border-b border-black my-1 bg-black/5 tracking-wider">
              --- {group.displayName} ---
            </div>

            {/* Items Table for this Category */}
            <table className="w-full text-left text-[11px] text-black">
              <thead>
                <tr className="border-b border-black/40 font-bold">
                  <th className="py-1 text-black font-bold">Item</th>
                  <th className="py-1 text-right text-black font-bold whitespace-nowrap px-1">Qty</th>
                  <th className="py-1 text-right text-black font-bold whitespace-nowrap px-1">Rate</th>
                  <th className="py-1 text-right text-black font-bold whitespace-nowrap pl-1">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/20">
                {group.items.map((item, idx) => (
                  <tr key={idx} className="font-semibold align-top">
                    <td className="py-1 pr-1 font-sans text-xs break-words max-w-0 w-[45%]">
                      <span className="font-bold text-black leading-tight block">{item.product_name}</span>
                    </td>
                    <td className="py-1 text-right tabular-nums text-black font-bold whitespace-nowrap px-1 align-top">{item.qty}</td>
                    <td className="py-1 text-right tabular-nums text-black font-bold whitespace-nowrap px-1 align-top">{formatNumber(item.unit_price)}</td>
                    <td className="py-1 text-right tabular-nums text-black font-black whitespace-nowrap pl-1 align-top">
                      {formatNumber(item.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Category / Brand Subtotal & Discounts */}
            <div className="pt-1 pb-1 border-b border-dashed border-black/40 text-[11px] font-bold text-black space-y-0.5">
              <div className="flex justify-between">
                <span>{group.displayName} Total:</span>
                <span className="tabular-nums font-mono">{formatNumber(group.subtotal)}</span>
              </div>
              {group.discountPct > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>{group.displayName} Disc ({group.discountPct}%):</span>
                    <span className="tabular-nums font-mono">- {formatNumber(group.discountAmount)}</span>
                  </div>
                  <div className="flex justify-between font-black">
                    <span>{group.displayName} Net:</span>
                    <span className="tabular-nums font-mono">{formatNumber(group.netAmount)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t-2 border-dashed border-black my-1.5" />

      {/* Final Grand Totals Section */}
      <div className="space-y-1 text-xs font-bold text-black">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span className="tabular-nums font-mono text-black">{formatINR(bill.subtotal)}</span>
        </div>

        {bill.discount > 0 && (
          <div className="flex justify-between text-[11px] font-semibold text-black">
            <span>Total Discount:</span>
            <span className="tabular-nums font-mono">- {formatINR(bill.discount)}</span>
          </div>
        )}

        {/* Grand Total (Center Aligned, Bold & Prominent at Last) */}
        <div className="text-center font-black text-sm py-1.5 border-t-2 border-b-2 border-black text-black my-1">
          <span>GRAND TOTAL: {formatINR(bill.total)}</span>
        </div>

        {/* Payment Mode & Billed By username (Center Aligned at the last) */}
        <div className="text-center text-[11px] font-bold text-black pt-1 space-y-0.5">
          <p>Payment Mode: <span className="uppercase font-black text-black">{bill.payment_mode}</span></p>
          {billedBy && (
            <p className="text-black font-semibold">
              Billed By: <span className="font-bold text-black">{billedBy}</span>
            </p>
          )}
        </div>
      </div>

      {/* Scan and Pay QR Section */}
      {showScanPay && (
        <>
          <div className="border-t-2 border-dashed border-black my-1.5" />
          <div className="text-center py-1 space-y-1">
            <div className="text-[11px] font-black uppercase tracking-wider text-black">
              --- SCAN AND PAY ---
            </div>
            <div className="flex justify-center items-center py-1">
              <img
                src={QR_CODE_DATA_URI}
                alt="Scan and Pay QR"
                className="w-28 h-28 sm:w-32 sm:h-32 object-contain mx-auto border border-black p-1 bg-white"
                style={{ minWidth: '112px', minHeight: '112px', display: 'block' }}
              />
            </div>
            <p className="text-[10px] font-black text-black uppercase tracking-tight">
              Scan and Pay with Any UPI App
            </p>
          </div>
        </>
      )}

      <div className="border-t-2 border-dashed border-black my-1.5" />

      {/* Footer message (Center Aligned) */}
      <div className="text-center text-[10px] font-semibold text-black">
        <p>{settings.receipt_footer}</p>
      </div>
    </div>
  );
};
