import React from 'react';
import { Bill, BillItem, ShopSettings } from '@/types';
import { formatINR, formatISTDate, formatNumber } from '@/lib/format';

interface ReceiptCardProps {
  bill: Bill;
  items: BillItem[];
  settings: ShopSettings;
  id?: string;
  className?: string;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  bill,
  items,
  settings,
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
      {/* Shop Header */}
      <div className="text-center space-y-0.5">
        <h3 className="text-sm font-black uppercase tracking-wider text-black">{settings.shop_name}</h3>
        <p className="text-[11px] font-medium text-black">{settings.shop_address}</p>
        <p className="text-[11px] font-bold text-black">Ph: {settings.shop_phone}</p>
        {settings.gst_no && (
          <p className="text-[10px] font-bold text-black">GST: {settings.gst_no}</p>
        )}
      </div>

      <div className="border-t-2 border-dashed border-black my-1.5" />

      {/* Bill Meta */}
      <div className="flex justify-between text-[11px] font-bold text-black">
        <span>Bill: <span className="font-mono text-black font-black">{bill.bill_no}</span></span>
        <span>{formatISTDate(bill.created_at)}</span>
      </div>

      {(bill.customer_name || bill.customer_phone) && (
        <div className="text-[11px] font-medium text-black">
          {bill.customer_name && <span>Customer: <strong className="text-black font-bold">{bill.customer_name}</strong> </span>}
          {bill.customer_phone && <span className="font-semibold text-black">({bill.customer_phone})</span>}
        </div>
      )}

      <div className="border-t-2 border-dashed border-black my-1.5" />

      {/* Items Table */}
      <table className="w-full text-left text-[11px] text-black">
        <thead>
          <tr className="border-b-2 border-black font-bold">
            <th className="py-1 text-black font-bold">Item</th>
            <th className="py-1 text-right text-black font-bold">Qty</th>
            <th className="py-1 text-right text-black font-bold">Rate</th>
            <th className="py-1 text-right text-black font-bold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/30">
          {items.map((item, idx) => (
            <tr key={idx} className="font-semibold">
              <td className="py-1 pr-1 max-w-[130px] font-sans text-xs">
                <div className="font-bold text-black leading-tight">{item.product_name}</div>
                <div className="text-[9px] text-black font-mono font-bold tracking-wider">
                  [{item.brand || 'General'}]
                </div>
              </td>
              <td className="py-1 text-right tabular-nums text-black font-bold">{item.qty}</td>
              <td className="py-1 text-right tabular-nums text-black font-bold">{formatNumber(item.unit_price)}</td>
              <td className="py-1 text-right tabular-nums text-black font-black">
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
              .map(([bName, bPct]) => (
                <div key={bName} className="flex justify-between font-semibold">
                  <span>{bName} Disc ({bPct}%):</span>
                  <span className="tabular-nums font-mono">{bPct}% off</span>
                </div>
              ))}
            <div className="flex justify-between font-bold pt-0.5">
              <span>Total Discount:</span>
              <span className="tabular-nums font-mono">- {formatINR(bill.discount)}</span>
            </div>
          </div>
        ) : bill.discount > 0 ? (
          <div className="flex justify-between">
            <span>
              Discount{' '}
              {bill.subtotal > 0
                ? `(${Math.round((bill.discount / bill.subtotal) * 100)}%)`
                : ''}:
            </span>
            <span className="tabular-nums font-mono">- {formatINR(bill.discount)}</span>
          </div>
        ) : null}

        <div className="flex justify-between font-black text-sm pt-1 border-t-2 border-black text-black">
          <span>Grand Total:</span>
          <span className="tabular-nums font-mono text-black">{formatINR(bill.total)}</span>
        </div>

        <div className="flex justify-between text-[11px] font-semibold text-black pt-0.5">
          <span>Payment:</span>
          <span className="uppercase font-bold text-black">{bill.payment_mode}</span>
        </div>
      </div>

      <div className="border-t-2 border-dashed border-black my-1.5" />

      {/* Footer message */}
      <div className="text-center text-[10px] font-semibold text-black">
        <p>{settings.receipt_footer}</p>
      </div>
    </div>
  );
};
