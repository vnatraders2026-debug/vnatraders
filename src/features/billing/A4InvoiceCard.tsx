import React from 'react';
import { Bill, BillItem, ShopSettings } from '@/types';
import { formatNumber, formatDateDMY, numberToWordsINR, calculateBillTotals } from '@/lib/format';

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
  // Helper to format Brand Header: clean brand name (e.g. 'Standard', 'General', 'Net', 'Vanitha')
  const getBrandDisplayName = (brandName?: string): string => {
    const raw = (brandName || '').trim();
    if (!raw || raw.toLowerCase() === 'common' || raw.toLowerCase() === 'common price list') {
      return 'General';
    }
    return raw;
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
    let b = (item.brand || 'General').trim() || 'General';
    if (b.toLowerCase() === 'common' || b.toLowerCase() === 'common price list') {
      b = 'General';
    }
    const list = groupsMap.get(b) || [];
    list.push(item);
    groupsMap.set(b, list);
  });

  // Calculate brand totals strictly matching thermal printer logic (calculateBillTotals)
  const hasExplicitBrandDiscounts =
    bill.brand_discounts &&
    Object.keys(bill.brand_discounts).length > 0 &&
    Object.values(bill.brand_discounts).some((pct) => pct > 0);

  const { brandTotals: calculatedBrandTotals } = calculateBillTotals(
    items,
    hasExplicitBrandDiscounts
      ? 0
      : bill.subtotal > 0
        ? Math.round((bill.discount / bill.subtotal) * 100)
        : 0,
    bill.brand_discounts
  );

  const brandGroups: BrandGroup[] = [];

  groupsMap.forEach((gItems, bKey) => {
    const groupTotal = gItems.reduce(
      (acc, it) => acc + (it.line_total || it.qty * it.unit_price),
      0
    );

    // Look up calculated brand data
    const bData = calculatedBrandTotals[bKey] || calculatedBrandTotals['General'] || calculatedBrandTotals['Common'];
    let discountPct = 0;
    let discountAmount = 0;
    let amount = groupTotal;

    if (hasExplicitBrandDiscounts) {
      // Only apply discount if explicitly specified for this brand
      let directPct = bill.brand_discounts?.[bKey] ?? 0;
      if (directPct === 0 && (bKey.toLowerCase() === 'general' || bKey.toLowerCase() === 'common')) {
        directPct = bill.brand_discounts?.['General'] ?? bill.brand_discounts?.['Common'] ?? 0;
      }
      discountPct = directPct;
      discountAmount = bData ? bData.discount : Math.round(((groupTotal * discountPct) / 100) * 100) / 100;
      amount = Math.max(0, Math.round((groupTotal - discountAmount) * 100) / 100);
    } else if (bill.discount > 0 && bill.subtotal > 0) {
      // Single overall discount applied across the bill
      discountPct = Math.round((bill.discount / bill.subtotal) * 10000) / 100;
      discountAmount = Math.round(((groupTotal * discountPct) / 100) * 100) / 100;
      amount = Math.max(0, Math.round((groupTotal - discountAmount) * 100) / 100);
    }

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

  // Calculate unrounded net sum and round off matching bill.total
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

  // Smart Pagination for A4 sheet:
  // If total items <= 12, everything fits on a single page.
  // If > 12 items, split across continuation pages so page 2 starts from the continue products.
  const PAGE_1_ITEM_CAP = 12;
  const CONTINUATION_PAGE_CAP = 18;

  const totalItemCount = items.length;
  let pages: Array<{ groups: BrandGroup[]; pageNum: number; isFirstPage: boolean; isLastPage: boolean }> = [];

  if (totalItemCount <= PAGE_1_ITEM_CAP) {
    // Fits on 1 page!
    pages = [{ groups: brandGroups, pageNum: 1, isFirstPage: true, isLastPage: true }];
  } else {
    // Multi-page splitting
    let currentItemBudget = PAGE_1_ITEM_CAP;
    let pageNum = 1;
    let currentGroups: BrandGroup[] = [];
    let itemsAccumulated = 0;

    for (const group of brandGroups) {
      if (itemsAccumulated + group.items.length <= currentItemBudget || currentGroups.length === 0) {
        currentGroups.push(group);
        itemsAccumulated += group.items.length;
      } else {
        // Close current page
        pages.push({
          groups: currentGroups,
          pageNum,
          isFirstPage: pageNum === 1,
          isLastPage: false,
        });
        pageNum++;
        currentGroups = [group];
        itemsAccumulated = group.items.length;
        currentItemBudget = CONTINUATION_PAGE_CAP;
      }
    }

    if (currentGroups.length > 0) {
      pages.push({
        groups: currentGroups,
        pageNum,
        isFirstPage: pageNum === 1,
        isLastPage: true,
      });
    }

    // Mark the true last page
    if (pages.length > 0) {
      pages[pages.length - 1].isLastPage = true;
    }
  }

  const totalPages = pages.length;

  return (
    <div
      id={id}
      className={`a4-invoice-container bg-white text-slate-900 mx-auto w-full text-[12px] leading-tight font-sans ${className}`}
      style={{
        width: '100%',
        maxWidth: '210mm',
        boxSizing: 'border-box',
        backgroundColor: '#FFFFFF',
        color: '#0f172a',
      }}
    >
      {pages.map((page, pageIdx) => {
        let runningItemIndex = 0;
        // Count previous items for SNO continuation
        for (let i = 0; i < pageIdx; i++) {
          for (const g of pages[i].groups) {
            runningItemIndex += g.items.length;
          }
        }

        return (
          <div
            key={page.pageNum}
            className={`a4-page-sheet bg-white p-2 sm:p-4 mb-4 print:mb-0 print:p-0 ${pageIdx < totalPages - 1 ? 'a4-page-break' : ''
              }`}
            style={{
              width: '100%',
              maxWidth: '210mm',
              boxSizing: 'border-box',
              pageBreakInside: 'avoid',
              breakInside: 'avoid',
              ...(pageIdx < totalPages - 1 ? { pageBreakAfter: 'always', breakAfter: 'page' } : {}),
            }}
          >
            {/* Outer Rounded Frame */}
            <div className="border border-slate-700/80 rounded-xl p-3 sm:p-4 flex flex-col justify-between min-h-[250mm] print:min-h-0 bg-white">
              <div>
                {/* Page 1 Full Header */}
                {page.isFirstPage ? (
                  <>
                    <div className="border border-slate-700/80 rounded-lg p-2.5 sm:p-3 mb-2 relative">
                      {/* Centered Shop Info */}
                      <div className="text-center">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 uppercase">
                          {shopName}
                        </h1>
                        <div className="text-xs font-semibold tracking-wider text-slate-700 uppercase mt-0.5">
                          MENU
                        </div>
                        <div className="text-[11px] text-slate-700 font-medium mt-0.5">
                          G Mangalam
                        </div>
                        <div className="text-[11px] text-slate-700 font-medium">
                          Hosur-635109
                        </div>
                      </div>

                      {/* Header bottom row: Left GSTIN, Right Sales Order */}
                      <div className="flex items-end justify-between mt-2 pt-1 border-t border-slate-200/60">
                        <div className="text-xs font-semibold text-slate-800">
                          GSTIN {gstNo}
                        </div>
                        <div className="text-base sm:text-lg font-bold text-slate-900">
                          Sales Order
                        </div>
                      </div>
                    </div>

                    {/* Subheader: Customer & Order Meta */}
                    <div className="flex justify-between items-center text-xs py-1 px-1 font-medium text-slate-800 border-b border-slate-400 mb-1.5">
                      <div>
                        <span className="font-semibold text-slate-600">To</span>{' '}
                        <span className="font-bold text-slate-900">
                          {bill.customer_name ? bill.customer_name : 'Cash Bill'}
                        </span>
                        {bill.customer_phone && (
                          <span className="text-slate-600 ml-1">({bill.customer_phone})</span>
                        )}
                      </div>
                      <div className="text-right flex items-center gap-3">
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
                          <span className="font-semibold">{page.pageNum} of {totalPages}</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Continuation Page Header */
                  <div className="border border-slate-700/80 rounded-lg p-2 mb-2 flex justify-between items-center text-xs bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 uppercase">{shopName}</span>
                      <span className="text-slate-600 font-medium">- Sales Order (Continued)</span>
                    </div>
                    <div className="text-right flex items-center gap-3 text-slate-800">
                      <div>
                        <span className="text-slate-600">Order No:</span>{' '}
                        <span className="font-bold">{bill.bill_no}</span>
                      </div>
                      <div>
                        <span className="text-slate-600">Date:</span>{' '}
                        <span className="font-bold">{formatDateDMY(bill.created_at)}</span>
                      </div>
                      <div>
                        <span className="font-bold">Page {page.pageNum} of {totalPages}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Products Table */}
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-t border-b border-slate-700/80 font-bold text-slate-900">
                      <th className="py-1 px-1.5 w-[6%] text-left">SNO</th>
                      <th className="py-1 px-1.5 w-[42%] text-left">Product</th>
                      <th className="py-1 px-1.5 w-[22%] text-left">Case</th>
                      <th className="py-1 px-1.5 w-[8%] text-right">Qty</th>
                      <th className="py-1 px-1.5 w-[11%] text-right">Rate</th>
                      <th className="py-1 px-1.5 w-[11%] text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.groups.map((group, groupIdx) => (
                      <React.Fragment key={groupIdx}>
                        {/* Brand Group Header */}
                        <tr className="border-b border-slate-300">
                          <td
                            colSpan={6}
                            className="py-1 px-1.5 font-bold text-slate-900 bg-slate-50/70"
                          >
                            {group.displayName}
                          </td>
                        </tr>

                        {/* Group Items */}
                        {group.items.map((item, itemIdx) => {
                          const sno = runningItemIndex + itemIdx + 1;
                          return (
                            <tr
                              key={itemIdx}
                              className="border-b border-slate-200/60 hover:bg-slate-50/30"
                            >
                              <td className="py-0.5 px-1.5 text-slate-700 text-left align-top">
                                {sno}
                              </td>
                              <td className="py-0.5 px-1.5 font-medium text-slate-900 text-left align-top">
                                {item.product_name}
                              </td>
                              <td className="py-0.5 px-1.5 text-slate-700 text-left align-top whitespace-nowrap">
                                {getCasePacking(item.product_name)}
                              </td>
                              <td className="py-0.5 px-1.5 text-right tabular-nums font-semibold text-slate-900 align-top">
                                {item.qty}
                              </td>
                              <td className="py-0.5 px-1.5 text-right tabular-nums text-slate-800 align-top">
                                {formatNumber(item.unit_price)}
                              </td>
                              <td className="py-0.5 px-1.5 text-right tabular-nums font-semibold text-slate-900 align-top">
                                {formatNumber(item.line_total || item.qty * item.unit_price)}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Group Subtotal / Discount Summary: Only show discount lines if a discount was applied! */}
                        {group.discountAmount > 0 ? (
                          <>
                            <tr className="border-t border-slate-300">
                              <td colSpan={4} className="py-0.5 px-1.5"></td>
                              <td className="py-0.5 px-1.5 text-right text-slate-700 font-medium whitespace-nowrap">
                                Total :
                              </td>
                              <td className="py-0.5 px-1.5 text-right tabular-nums font-semibold text-slate-900">
                                {formatNumber(group.total)}
                              </td>
                            </tr>
                            <tr>
                              <td colSpan={4} className="py-0.5 px-1.5"></td>
                              <td className="py-0.5 px-1.5 text-right text-slate-700 font-medium whitespace-nowrap">
                                {group.displayName} Discount {formatNumber(group.discountPct)} % :
                              </td>
                              <td className="py-0.5 px-1.5 text-right tabular-nums font-semibold text-slate-900">
                                {formatNumber(group.discountAmount)}
                              </td>
                            </tr>
                            <tr className="border-b border-slate-700">
                              <td colSpan={4} className="py-0.5 px-1.5"></td>
                              <td className="py-0.5 px-1.5 text-right font-bold text-slate-900 whitespace-nowrap">
                                Amount :
                              </td>
                              <td className="py-0.5 px-1.5 text-right tabular-nums font-bold text-slate-900">
                                {formatNumber(group.amount)}
                              </td>
                            </tr>
                          </>
                        ) : (
                          <tr className="border-t border-b border-slate-700">
                            <td colSpan={4} className="py-0.5 px-1.5"></td>
                            <td className="py-0.5 px-1.5 text-right font-bold text-slate-900 whitespace-nowrap">
                              Amount :
                            </td>
                            <td className="py-0.5 px-1.5 text-right tabular-nums font-bold text-slate-900">
                              {formatNumber(group.amount)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}

                    {/* Round Off: Only on the Last Page */}
                    {page.isLastPage && (
                      <tr className="border-b border-slate-400">
                        <td colSpan={4} className="py-0.5 px-1.5"></td>
                        <td className="py-0.5 px-1.5 text-right font-bold text-slate-800 whitespace-nowrap">
                          Round Off :
                        </td>
                        <td className="py-0.5 px-1.5 text-right tabular-nums font-bold text-slate-800">
                          {roundOff !== 0
                            ? `${roundOff > 0 ? '+' : ''}${formatNumber(roundOff)}`
                            : '0.00'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* If multi-page and not last page, show continuation note */}
                {!page.isLastPage && (
                  <div className="text-right text-xs font-semibold text-slate-500 py-1.5 pr-2 border-b border-slate-300">
                    Continued on Page {page.pageNum + 1}...
                  </div>
                )}

                {/* Grand Total & Net Amount Row: On the Last Page */}
                {page.isLastPage && (
                  <>
                    <div className="border-t-2 border-b-2 border-slate-900 py-1.5 px-2 mt-1 flex justify-between items-center text-sm">
                      <div className="font-bold text-slate-900">
                        Total Case : <span className="font-semibold">0</span>
                      </div>
                      <div className="flex items-center gap-2 font-bold text-slate-900">
                        <span className="text-slate-800">Net Amount :</span>
                        <span className="text-base tabular-nums tracking-tight font-black">
                          ₹ {formatNumber(netAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Amount in words */}
                    <div className="py-1 px-2 font-semibold text-xs text-slate-900">
                      {numberToWordsINR(netAmount)}
                    </div>
                  </>
                )}
              </div>

              {/* Footer Area: Only on the Last Page */}
              {page.isLastPage && (
                <div className="mt-4 space-y-2.5">
                  {/* Tax Breakdown (Bottom Left) */}
                  <div className="text-[11px] text-slate-800 font-medium space-y-0.5 px-2">
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
                  <div className="border border-slate-700/80 rounded p-2 text-[10.5px] font-semibold text-slate-900 space-y-0.5 leading-tight">
                    <div>Please Collect Invoice at the Time of Delivery</div>
                    <div>The above rates are subject to change under extra ordinary circumstances</div>
                    <div>Goods will be despatched CASH and CARRY basis only</div>
                  </div>

                  {/* Signatures */}
                  <div className="flex justify-between items-end pt-3 px-2 text-xs font-bold text-slate-900">
                    <div>Party's Signature</div>
                    <div>For {shopName}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
