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
  return (
    <div
      id={id}
      className={`p-4 bg-white text-gray-900 border border-gray-200 rounded font-mono text-xs space-y-3 print:border-none print:p-0 print:bg-white ${className}`}
      style={{ minWidth: '320px', maxWidth: '420px', margin: '0 auto', color: '#111827', backgroundColor: '#ffffff' }}
    >
      {/* Shop Header */}
      <div className="text-center space-y-0.5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-black">{settings.shop_name}</h3>
        <p className="text-[11px] text-gray-600">{settings.shop_address}</p>
        <p className="text-[11px] text-gray-600">Ph: {settings.shop_phone}</p>
        {settings.gst_no && (
          <p className="text-[10px] text-gray-500">GST: {settings.gst_no}</p>
        )}
      </div>

      <div className="border-t border-dashed border-gray-400 my-2" />

      {/* Bill Meta */}
      <div className="flex justify-between text-[11px] text-gray-800">
        <span>Bill: <strong className="font-mono text-black">{bill.bill_no}</strong></span>
        <span>{formatISTDate(bill.created_at)}</span>
      </div>

      {(bill.customer_name || bill.customer_phone) && (
        <div className="text-[11px] text-gray-700">
          {bill.customer_name && <span>Customer: <strong>{bill.customer_name}</strong> </span>}
          {bill.customer_phone && <span>({bill.customer_phone})</span>}
        </div>
      )}

      <div className="border-t border-dashed border-gray-400 my-2" />

      {/* Items Table */}
      <table className="w-full text-left text-[11px] text-gray-900">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Price</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {items.map((item, idx) => (
            <tr key={idx}>
              <td className="py-1 pr-1 truncate max-w-[140px] font-sans text-xs">
                <div className="font-medium text-black">{item.product_name}</div>
                <div className="text-[9px] text-gray-500 uppercase font-mono tracking-wider">
                  [{item.brand || 'General'}]
                </div>
              </td>
              <td className="py-1 text-right tabular-nums">{item.qty}</td>
              <td className="py-1 text-right tabular-nums">{formatNumber(item.unit_price)}</td>
              <td className="py-1 text-right tabular-nums font-semibold text-black">
                {formatNumber(item.line_total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-gray-400 my-2" />

      {/* Totals Section */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between text-gray-700">
          <span>Subtotal:</span>
          <span className="tabular-nums font-mono">{formatINR(bill.subtotal)}</span>
        </div>

        {bill.brand_discounts && Object.entries(bill.brand_discounts).some(([_, pct]) => pct > 0) ? (
          <div className="space-y-0.5 py-1 border-y border-dashed border-gray-300 text-[11px] text-emerald-700">
            {Object.entries(bill.brand_discounts)
              .filter(([_, pct]) => pct > 0)
              .map(([bName, bPct]) => (
                <div key={bName} className="flex justify-between">
                  <span>{bName} Discount ({bPct}%):</span>
                  <span className="tabular-nums font-mono">{bPct}% off</span>
                </div>
              ))}
            <div className="flex justify-between font-semibold pt-0.5">
              <span>Total Discount:</span>
              <span className="tabular-nums font-mono">- {formatINR(bill.discount)}</span>
            </div>
          </div>
        ) : bill.discount > 0 ? (
          <div className="flex justify-between text-emerald-700">
            <span>
              Discount{' '}
              {bill.subtotal > 0
                ? `(${Math.round((bill.discount / bill.subtotal) * 100)}%)`
                : ''}:
            </span>
            <span className="tabular-nums font-mono">- {formatINR(bill.discount)}</span>
          </div>
        ) : null}

        <div className="flex justify-between font-bold text-sm pt-1 border-t border-gray-300 text-black">
          <span>Grand Total:</span>
          <span className="tabular-nums font-mono">{formatINR(bill.total)}</span>
        </div>

        <div className="flex justify-between text-[11px] text-gray-600">
          <span>Payment Mode:</span>
          <span className="uppercase font-medium text-black">{bill.payment_mode}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-gray-400 my-2" />

      {/* Footer message */}
      <div className="text-center text-[10px] text-gray-600">
        <p>{settings.receipt_footer}</p>
      </div>
    </div>
  );
};
