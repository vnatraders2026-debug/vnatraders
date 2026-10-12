import React from 'react';
import { Bill, BillItem, ShopSettings } from '@/types';
import { formatINR, formatISTDate, formatNumber } from '@/lib/format';

interface ReceiptCardProps {
  bill: Bill;
  items: BillItem[];
  settings: ShopSettings;
  billedBy?: string;
  id?: string;
  className?: string;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  bill,
  items,
  settings,
  billedBy,
  id = 'receipt-print-area',
  className = '',
}) => {
  const is58mm = settings.paper_size === '58mm';

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

      {/* Items Table */}
      <table className="w-full text-left text-[11px] text-black">
        <thead>
          <tr className="border-b-2 border-black font-bold">
            <th className="py-1 text-black font-bold">Item</th>
            <th className="py-1 text-right text-black font-bold whitespace-nowrap px-1">Qty</th>
            <th className="py-1 text-right text-black font-bold whitespace-nowrap px-1">Rate</th>
            <th className="py-1 text-right text-black font-bold whitespace-nowrap pl-1">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/30">
          {items.map((item, idx) => (
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

      <div className="border-t-2 border-dashed border-black my-1.5" />

      {/* Totals Section */}
      <div className="space-y-1 text-xs font-bold text-black">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span className="tabular-nums font-mono text-black">{formatINR(bill.subtotal)}</span>
        </div>

        {bill.brand_discounts && Object.entries(bill.brand_discounts).some(([_, pct]) => pct > 0) ? (
          <div className="space-y-0.5 py-1 border-y border-dashed border-black text-[11px]">
            {Object.entries(bill.brand_discounts)
              .filter(([_, pct]) => pct > 0)
              .map(([bName, bPct]) => {
                const bSub = items
                  .filter((it) => (it.brand || 'Standard').toLowerCase() === bName.toLowerCase())
                  .reduce((sum, it) => sum + it.line_total, 0);
                const bDisc = bSub > 0 ? Math.round((bSub * bPct) / 100) : 0;
                return (
                  <div key={bName} className="flex justify-between font-semibold">
                    <span>{bName} Disc ({bPct}%):</span>
                    <span className="tabular-nums font-mono">
                      {bDisc > 0 ? `- ${formatINR(bDisc)}` : `${bPct}% off`}
                    </span>
                  </div>
                );
              })}
            <div className="flex justify-between font-bold pt-0.5">
              <span>Total Discount:</span>
              <span className="tabular-nums font-mono">- {formatINR(bill.discount)}</span>
            </div>
          </div>
        ) : bill.discount > 0 ? (
          <div className="flex justify-between">
            <span>
              Standard Disc{' '}
              {bill.subtotal > 0
                ? `(${Math.round((bill.discount / bill.subtotal) * 100)}%)`
                : ''}:
            </span>
            <span className="tabular-nums font-mono">- {formatINR(bill.discount)}</span>
          </div>
        ) : null}

        {/* Grand Total (Center Aligned, Bold & Prominent) */}
        <div className="text-center font-black text-sm py-1.5 border-t-2 border-b-2 border-black text-black">
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

      <div className="border-t-2 border-dashed border-black my-1.5" />

      {/* Footer message (Center Aligned) */}
      <div className="text-center text-[10px] font-semibold text-black">
        <p>{settings.receipt_footer}</p>
      </div>
    </div>
  );
};
