import React from 'react';
import { Bill, BillItem, ShopSettings } from '@/types';
import { formatNumber, formatDateDMY, numberToWordsINR, consolidateBillItems } from '@/lib/format';

interface A4InvoiceCardProps {
  bill: Bill;
  items: BillItem[];
  settings: ShopSettings;
  billedBy?: string;
  id?: string;
  className?: string;
}

interface BrandGroup {
  brandKey: string;
  displayName: string;
  items: BillItem[];
  total: number;
  discountPct: number;
  discountAmount: number;
  amount: number;
}

export const A4InvoiceCard: React.FC<A4InvoiceCardProps> = ({
  bill,
  items,
  settings,
  billedBy: _billedBy,
  id = 'a4-invoice-print-area',
  className = '',
}) => {
  // Use exact brand or category name directly without any fabricated suffixes
  const getBrandDisplayName = (brandName?: string): string => {
    const raw = (brandName || '').trim();
    return raw || 'General';
  };

  // Helper to extract case packing if available (e.g. from name "(25 Pcs)" or defaults to "0 Case x 1")
  const getCasePacking = (productName: string): string => {
    const match = productName.match(/\((\d+)\s*(?:pcs|pc|items|pack)?\)/i);
    if (match && match[1]) {
      return `0 Case x ${match[1]}`;
    }
    return '0 Case x 1';
  };

  // Consolidate identical items within a group
  // so if same item has multiple entries or added qty, it displays in ONE single row with total qty
  const consolidateItems = (rawItems: BillItem[]): BillItem[] => {
    return consolidateBillItems(rawItems);
  };

  // Group items by brand/category
  const groupsMap = new Map<string, BillItem[]>();
  items.forEach((item) => {
    const b = (item.brand || 'General').trim() || 'General';
    const list = groupsMap.get(b) || [];
    list.push(item);
    groupsMap.set(b, list);
  });

  // Check if brand_discounts is configured on this bill
  const hasBrandDiscounts =
    Boolean(bill.brand_discounts) &&
    Object.keys(bill.brand_discounts || {}).length > 0 &&
    Object.values(bill.brand_discounts || {}).some((pct) => (pct || 0) > 0);

  // Helper to get discount percentage strictly matching thermal printer logic
  const getBrandDiscountPercent = (bName: string): number => {
    if (hasBrandDiscounts && bill.brand_discounts) {
      const target = bName.trim().toLowerCase();
      // Case-insensitive lookup in bill.brand_discounts
      for (const [key, val] of Object.entries(bill.brand_discounts)) {
        if (key.trim().toLowerCase() === target) {
          return Math.max(0, Math.min(100, val || 0));
        }
      }
      // If brand_discounts is active but this specific brand has no discount, it is strictly 0%!
      // Never apply an auto/distributed discount to brands without discount.
      return 0;
    }

    // Only if NO brand-specific discounts were defined and there is a general bill discount
    if (bill.discount > 0 && bill.subtotal > 0) {
      return Math.max(0, Math.min(100, Math.round((bill.discount / bill.subtotal) * 10000) / 100));
    }

    return 0;
  };

  // Calculate totals and discounts per group
  const brandGroups: BrandGroup[] = [];

  groupsMap.forEach((gItems, bKey) => {
    const consolidated = consolidateItems(gItems);
    const groupTotal = consolidated.reduce(
      (acc, it) => acc + (it.line_total || it.qty * it.unit_price),
      0
    );

    const discountPct = getBrandDiscountPercent(bKey);
    const discountAmount =
      discountPct > 0 ? Math.round(((groupTotal * discountPct) / 100) * 100) / 100 : 0;
    const amount = Math.max(0, Math.round((groupTotal - discountAmount) * 100) / 100);

    brandGroups.push({
      brandKey: bKey,
      displayName: getBrandDisplayName(bKey),
      items: consolidated,
      total: groupTotal,
      discountPct,
      discountAmount,
      amount,
    });
  });

  // Calculate unrounded net sum from groups and round off to match bill.total
  const sumGroupNet = brandGroups.reduce((acc, g) => acc + g.amount, 0);
  const netAmount = bill.total;
  const roundOff = Math.round((netAmount - sumGroupNet) * 100) / 100;

  // Inclusive GST 18% (9% CGST + 9% SGST)
  // Taxable = Net / 1.18
  const baseForTax = netAmount > 0 ? netAmount : sumGroupNet;
  const taxable = Math.round((baseForTax / 1.18) * 100) / 100;
  const cgst = Math.round(taxable * 0.09 * 100) / 100;
  const sgst = Math.round(taxable * 0.09 * 100) / 100;

  const shopName = settings.shop_name || 'VNA Traders';
  const gstNo = settings.gst_no || '33ACGPV5399F1Z5';

  return (
    <div
      id={id}
      className={`a4-invoice-sheet bg-white text-slate-900 mx-auto w-full text-[13px] leading-snug font-sans ${className}`}
      style={{
        width: '100%',
        maxWidth: '210mm',
        boxSizing: 'border-box',
        backgroundColor: '#FFFFFF',
        color: '#0f172a',
      }}
    >
      {/* Outer Border Container */}
      <div className="a4-invoice-outer-border border border-slate-700/80 rounded-xl p-5 sm:p-6 shadow-none">
        {/* Top Header Inner Box (Kept intact on page 1) */}
        <div className="invoice-header-box border border-slate-700/80 rounded-lg p-3 sm:p-4 mb-3 relative">
          {/* Centered Shop Info */}
          <div className="text-center">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 uppercase">
              {shopName}
            </h1>
            <div className="text-xs sm:text-sm font-semibold tracking-wider text-slate-700 uppercase mt-0.5">
              MEINU
            </div>
            <div className="text-xs text-slate-700 font-medium mt-0.5">
              S No.:16/8, Zeemangalam
            </div>
            <div className="text-xs text-slate-700 font-medium">
              Hosur-635109
            </div>
          </div>

          {/* Bottom row of Header: Left GSTIN, Right Sales Order */}
          <div className="flex items-end justify-between mt-3 pt-1">
            <div className="text-xs font-semibold text-slate-800">
              GSTIN {gstNo}
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-900">
              Sales Order
            </div>
          </div>
        </div>

        {/* Subheader: Customer & Order Meta */}
        <div className="flex justify-between items-start text-xs sm:text-[13px] py-1.5 px-1 font-medium text-slate-800 border-b border-slate-400/60 mb-2">
          <div>
            <span className="font-semibold">To</span>{' '}
            <span className="font-bold">
              {bill.customer_name ? bill.customer_name : 'Cash Bill'}
            </span>
            {bill.customer_phone && (
              <span className="text-slate-600 ml-1">({bill.customer_phone})</span>
            )}
          </div>
          <div className="text-right space-y-0.5">
            <div>
              <span className="text-slate-600">Order Number :</span>{' '}
              <span className="font-bold">{bill.bill_no}</span>
            </div>
            <div>
              <span className="text-slate-600">Date :</span>{' '}
              <span className="font-bold">{formatDateDMY(bill.created_at)}</span>
            </div>
            <div>
              <span className="text-slate-600">Page :</span>{' '}
              <span className="font-semibold">1 of 1</span>
            </div>
          </div>
        </div>

        {/* Products Table with continuation header support */}
        <table className="w-full text-left text-xs sm:text-[13px] border-collapse a4-products-table">
          <thead>
            <tr className="border-t border-b border-slate-700/80 font-bold text-slate-900 bg-white">
              <th className="py-1.5 px-2 w-[6%] text-left">SNO</th>
              <th className="py-1.5 px-2 w-[42%] text-left">Product</th>
              <th className="py-1.5 px-2 w-[22%] text-left">Case</th>
              <th className="py-1.5 px-2 w-[8%] text-right">Qty</th>
              <th className="py-1.5 px-2 w-[11%] text-right">Rate</th>
              <th className="py-1.5 px-2 w-[11%] text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {brandGroups.map((group, groupIdx) => (
              <React.Fragment key={groupIdx}>
                {/* Brand / Category Group Header */}
                <tr className="border-b border-slate-300 brand-group-header">
                  <td
                    colSpan={6}
                    className="py-1.5 px-2 font-bold text-slate-900 bg-slate-50/70 uppercase tracking-wide text-xs"
                  >
                    {group.displayName}
                  </td>
                </tr>

                {/* Group Items */}
                {group.items.map((item, itemIdx) => (
                  <tr
                    key={itemIdx}
                    className="border-b border-slate-200/60 hover:bg-slate-50/30 a4-item-row"
                  >
                    <td className="py-1 px-2 text-slate-700 text-left align-top">
                      {itemIdx + 1}
                    </td>
                    <td className="py-1 px-2 font-medium text-slate-900 text-left align-top">
                      {item.product_name}
                    </td>
                    <td className="py-1 px-2 text-slate-700 text-left align-top whitespace-nowrap">
                      {getCasePacking(item.product_name)}
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums font-semibold text-slate-900 align-top">
                      {item.qty}
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums text-slate-800 align-top">
                      {formatNumber(item.unit_price)}
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums font-semibold text-slate-900 align-top">
                      {formatNumber(item.line_total || item.qty * item.unit_price)}
                    </td>
                  </tr>
                ))}

                {/* Group Subtotal / Discount Summary */}
                <tr className="border-t border-slate-300 brand-subtotal-row">
                  <td colSpan={4} className="py-0.5 px-2"></td>
                  <td className="py-0.5 px-2 text-right text-slate-800 font-medium whitespace-nowrap">
                    Total :
                  </td>
                  <td className="py-0.5 px-2 text-right tabular-nums font-semibold text-slate-900">
                    {formatNumber(group.total)}
                  </td>
                </tr>

                {/* Brand-specific discount row (e.g. "Standard Discount 40.00 % :" or "General Discount 40.00 % :") */}
                {group.discountAmount > 0 && (
                  <tr className="border-b border-slate-200 brand-discount-row">
                    <td colSpan={4} className="py-0.5 px-2"></td>
                    <td className="py-0.5 px-2 text-right text-slate-800 font-medium whitespace-nowrap">
                      {group.displayName} Discount {formatNumber(group.discountPct)} % :
                    </td>
                    <td className="py-0.5 px-2 text-right tabular-nums font-semibold text-slate-900">
                      {formatNumber(group.discountAmount)}
                    </td>
                  </tr>
                )}

                <tr className="border-b-2 border-slate-700 brand-amount-row">
                  <td colSpan={4} className="py-0.5 px-2"></td>
                  <td className="py-0.5 px-2 text-right font-bold text-slate-900 whitespace-nowrap">
                    Amount :
                  </td>
                  <td className="py-0.5 px-2 text-right tabular-nums font-bold text-slate-900">
                    {formatNumber(group.amount)}
                  </td>
                </tr>
              </React.Fragment>
            ))}

            {/* Round Off Row */}
            <tr className="border-b border-slate-400">
              <td colSpan={4} className="py-1 px-2"></td>
              <td className="py-1 px-2 text-right font-bold text-slate-800 whitespace-nowrap">
                Round Off :
              </td>
              <td className="py-1 px-2 text-right tabular-nums font-bold text-slate-800">
                {roundOff !== 0
                  ? `${roundOff > 0 ? '+' : ''}${formatNumber(roundOff)}`
                  : '0.00'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer Block: Kept completely intact during page breaks */}
        <div className="invoice-footer-block mt-2">
          {/* Grand Total & Net Amount Row */}
          <div className="border-t-2 border-b-2 border-slate-900 py-1.5 px-2 flex justify-between items-center text-sm sm:text-base">
            <div className="font-bold text-slate-900">
              Total Case : <span className="font-semibold">0</span>
            </div>
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="text-slate-800">Net Amount :</span>
              <span className="text-base sm:text-lg tabular-nums tracking-tight font-black">
                ₹ {formatNumber(netAmount)}
              </span>
            </div>
          </div>

          {/* Amount in words */}
          <div className="py-1.5 px-2 font-bold text-xs sm:text-[13px] text-slate-900">
            {numberToWordsINR(netAmount)}
          </div>

          {/* Bottom Area: Tax, Terms, Signatures */}
          <div className="mt-4 space-y-3">
            {/* Tax Breakdown (Bottom Left) */}
            <div className="text-xs text-slate-800 font-medium space-y-0.5 px-2">
              <div>
                CGST 9.00 % on {formatNumber(taxable)} :{' '}
                <span className="font-semibold tabular-nums">{formatNumber(cgst)}</span>
              </div>
              <div>
                SGST 9.00 % on {formatNumber(taxable)} :{' '}
                <span className="font-semibold tabular-nums">{formatNumber(sgst)}</span>
              </div>
            </div>

            {/* Terms & Conditions Box */}
            <div className="border border-slate-700/80 rounded p-2 text-[11px] sm:text-xs font-semibold text-slate-900 space-y-0.5 leading-tight">
              <div>Please Collect Invoice at the Time of Delivery</div>
              <div>The above rates are subject to change under extra ordinary circumstances</div>
              <div>Goods will be despatched CASH and CARRY basis only</div>
            </div>

            {/* Signatures */}
            <div className="flex justify-between items-end pt-5 px-2 text-xs sm:text-[13px] font-bold text-slate-900">
              <div>Party's Signature</div>
              <div>For {shopName}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
