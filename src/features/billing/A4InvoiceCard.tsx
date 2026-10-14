import React from 'react';
import { Bill, BillItem, ShopSettings } from '@/types';
import { formatNumber, formatDateDMY, numberToWordsINR } from '@/lib/format';

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
  // Helper to format Brand Header matching reference style (e.g. 'Common Price List 2025' or 'Standard Fireworks 2026 Part "A"')
  const getBrandDisplayName = (brandName?: string): string => {
    const raw = (brandName || '').trim();
    const lower = raw.toLowerCase();
    if (!raw || lower === 'general' || lower === 'common' || lower === 'common price list') {
      return 'Common Price List 2025';
    }
    if (lower === 'standard' || lower === 'standard fireworks') {
      return 'Standard Fireworks 2026 Part "A"';
    }
    return `${raw} Fireworks 2026`;
  };

  // Helper to extract case packing if available (e.g. from name "(25 Pcs)" or defaults to "0 Case x 1")
  const getCasePacking = (productName: string): string => {
    const match = productName.match(/\((\d+)\s*(?:pcs|pc|items|pack)?\)/i);
    if (match && match[1]) {
      return `0 Case x ${match[1]}`;
    }
    return '0 Case x 1';
  };

  // Group items by brand
  const groupsMap = new Map<string, BillItem[]>();
  items.forEach((item) => {
    const b = (item.brand || 'Common').trim() || 'Common';
    const list = groupsMap.get(b) || [];
    list.push(item);
    groupsMap.set(b, list);
  });

  // Calculate totals and discounts per group
  const brandGroups: BrandGroup[] = [];
  let calculatedSubtotal = 0;

  groupsMap.forEach((gItems, bKey) => {
    const groupTotal = gItems.reduce((acc, it) => acc + (it.line_total || it.qty * it.unit_price), 0);
    calculatedSubtotal += groupTotal;

    // Determine discount % for this group
    let discountPct = 0;
    if (bill.brand_discounts && bill.brand_discounts[bKey] !== undefined) {
      discountPct = bill.brand_discounts[bKey];
    } else if (
      bill.brand_discounts &&
      Object.keys(bill.brand_discounts).length > 0 &&
      (bKey.toLowerCase() === 'general' || bKey.toLowerCase() === 'common') &&
      bill.brand_discounts['General'] !== undefined
    ) {
      discountPct = bill.brand_discounts['General'];
    } else if (bill.discount > 0 && bill.subtotal > 0) {
      discountPct = Math.round((bill.discount / bill.subtotal) * 10000) / 100;
    }

    const discountAmount = Math.round(((groupTotal * discountPct) / 100) * 100) / 100;
    const amount = Math.max(0, Math.round((groupTotal - discountAmount) * 100) / 100);

    brandGroups.push({
      brandKey: bKey,
      displayName: getBrandDisplayName(bKey),
      items: gItems,
      total: groupTotal,
      discountPct,
      discountAmount,
      amount,
    });
  });

  // Calculate unrounded net sum and round off
  const sumGroupNet = brandGroups.reduce((acc, g) => acc + g.amount, 0);
  const netAmount = bill.total;
  const roundOff = Math.round((netAmount - sumGroupNet) * 100) / 100;

  // Inclusive GST 18% (9% CGST + 9% SGST)
  // Taxable = Net / 1.18
  const baseForTax = sumGroupNet > 0 ? sumGroupNet : netAmount;
  const taxable = Math.round((baseForTax / 1.18) * 100) / 100;
  const cgst = Math.round(taxable * 0.09 * 100) / 100;
  const sgst = Math.round(taxable * 0.09 * 100) / 100;

  const shopName = settings.shop_name || 'VNA Traders';
  const gstNo = settings.gst_no || '33ACGPV5399F1Z5';

  return (
    <div
      id={id}
      className={`a4-invoice-sheet bg-white text-slate-900 mx-auto w-full p-4 sm:p-6 text-[13px] leading-snug font-sans ${className}`}
      style={{
        width: '100%',
        maxWidth: '210mm',
        minHeight: '290mm',
        boxSizing: 'border-box',
        backgroundColor: '#FFFFFF',
        color: '#0f172a',
      }}
    >
      {/* Outer Rounded Frame */}
      <div className="border border-slate-700/80 rounded-xl p-4 sm:p-5 flex flex-col justify-between h-full min-h-[275mm] shadow-none">
        <div>
          {/* Top Header Inner Box */}
          <div className="border border-slate-700/80 rounded-lg p-3 sm:p-4 mb-3 relative">
            {/* Centered Shop Info */}
            <div className="text-center">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 uppercase">
                {shopName}
              </h1>
              <div className="text-xs sm:text-sm font-semibold tracking-wider text-slate-700 uppercase mt-0.5">
                MENU
              </div>
              <div className="text-xs text-slate-700 font-medium mt-0.5">
                S No.:16/8, Geemangalam
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
           
            </div>
          </div>

          {/* Products Table */}
          <table className="w-full text-left text-xs sm:text-[13px] border-collapse">
            <thead>
              <tr className="border-t border-b border-slate-700/80 font-bold text-slate-900">
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
                  {/* Brand / Price List Group Header */}
                  <tr className="border-b border-slate-300">
                    <td colSpan={6} className="py-1.5 px-2 font-bold text-slate-900 bg-slate-50/50">
                      {group.displayName}
                    </td>
                  </tr>

                  {/* Group Items */}
                  {group.items.map((item, itemIdx) => (
                    <tr key={itemIdx} className="border-b border-slate-200/60 hover:bg-slate-50/30">
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
                  <tr className="border-b border-slate-400">
                    <td colSpan={3} className="py-1 px-2"></td>
                    <td colSpan={2} className="py-1 px-2 text-right text-slate-700 font-medium">
                      Total :
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums font-semibold text-slate-900">
                      {formatNumber(group.total)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-400">
                    <td colSpan={3} className="py-1 px-2"></td>
                    <td colSpan={2} className="py-1 px-2 text-right text-slate-700 font-medium">
                      Discount {formatNumber(group.discountPct)} % :
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums font-semibold text-slate-900">
                      {formatNumber(group.discountAmount)}
                    </td>
                  </tr>
                  <tr className="border-b-2 border-slate-700">
                    <td colSpan={3} className="py-1 px-2"></td>
                    <td colSpan={2} className="py-1 px-2 text-right font-bold text-slate-900">
                      Amount :
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums font-bold text-slate-900">
                      {formatNumber(group.amount)}
                    </td>
                  </tr>
                </React.Fragment>
              ))}

              {/* Round Off Row */}
              <tr className="border-b border-slate-400">
                <td colSpan={4} className="py-1 px-2"></td>
                <td className="py-1 px-2 text-right font-bold text-slate-800">
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

          {/* Grand Total & Net Amount Row */}
          <div className="border-t-2 border-b-2 border-slate-900 py-2 px-2 mt-1 flex justify-between items-center text-sm sm:text-base">
            <div className="font-bold text-slate-900">
              Total Case : <span className="font-semibold">0</span>
            </div>
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span>Net Amount :</span>
              <span className="text-base sm:text-lg tabular-nums tracking-tight font-black">
                ₹ {formatNumber(netAmount)}
              </span>
            </div>
          </div>

          {/* Amount in words */}
          <div className="py-1.5 px-2 font-semibold text-xs sm:text-[13px] text-slate-900">
            {numberToWordsINR(netAmount)}
          </div>
        </div>

        {/* Footer Area */}
        <div className="mt-8 space-y-3">
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
          <div className="border border-slate-700/80 rounded p-2.5 text-[11px] sm:text-xs font-semibold text-slate-900 space-y-0.5 leading-snug">
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
  );
};
