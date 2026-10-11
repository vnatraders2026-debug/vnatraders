import React, { useState, useEffect } from 'react';
import { Bill, BillItem, ShopSettings, Profile } from '@/types';
import { formatINR, formatISTDate, formatNumber } from '@/lib/format';
import { checkBillEditPermission, formatRemainingTime } from '@/lib/permissions';
import { Printer, PlusCircle, Edit3, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ReceiptModalProps {
  bill: Bill;
  items: BillItem[];
  settings: ShopSettings;
  currentUser: Profile;
  onNewBill: () => void;
  onEditBill: () => void;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  bill,
  items,
  settings,
  currentUser,
  onNewBill,
  onEditBill,
  onClose,
}) => {
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const editPermission = checkBillEditPermission(bill, currentUser, currentTimeMs);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Main Container */}
      <div className="relative w-full max-w-lg bg-surface border border-border rounded shadow-subtle p-6 z-10 max-h-[95dvh] flex flex-col">
        {/* Header Action Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4 print:hidden">
          <div>
            <h2 className="text-base font-bold text-text">Bill Receipt</h2>
            <p className="text-xs text-text-muted">{bill.bill_no}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text rounded hover:bg-background"
            aria-label="Close receipt"
          >
            <X size={18} />
          </button>
        </div>

        {/* Printable Receipt Paper Container */}
        <div
          id="receipt-print-area"
          className="flex-1 overflow-y-auto p-4 bg-background border border-border rounded font-mono text-xs text-text space-y-3 print:border-none print:p-0 print:bg-white"
        >
          {/* Shop Header */}
          <div className="text-center space-y-0.5">
            <h3 className="text-sm font-bold uppercase tracking-wider">{settings.shop_name}</h3>
            <p className="text-[11px] text-text-muted">{settings.shop_address}</p>
            <p className="text-[11px] text-text-muted">Ph: {settings.shop_phone}</p>
            {settings.gst_no && (
              <p className="text-[10px] text-text-muted">GST: {settings.gst_no}</p>
            )}
          </div>

          <div className="border-t border-dashed border-border my-2" />

          {/* Bill Meta */}
          <div className="flex justify-between text-[11px]">
            <span>Bill: <strong className="font-mono">{bill.bill_no}</strong></span>
            <span>{formatISTDate(bill.created_at)}</span>
          </div>

          {(bill.customer_name || bill.customer_phone) && (
            <div className="text-[11px] text-text-muted">
              {bill.customer_name && <span>Customer: {bill.customer_name} </span>}
              {bill.customer_phone && <span>({bill.customer_phone})</span>}
            </div>
          )}

          <div className="border-t border-dashed border-border my-2" />

          {/* Items Table */}
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="py-1">Item</th>
                <th className="py-1 text-right">Qty</th>
                <th className="py-1 text-right">Price</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1 pr-1 truncate max-w-[140px] font-sans text-xs">
                    {item.product_name}
                  </td>
                  <td className="py-1 text-right tabular-nums">{item.qty}</td>
                  <td className="py-1 text-right tabular-nums">{formatNumber(item.unit_price)}</td>
                  <td className="py-1 text-right tabular-nums font-medium">
                    {formatNumber(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-border my-2" />

          {/* Totals Section */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Subtotal:</span>
              <span className="tabular-nums">{formatINR(bill.subtotal)}</span>
            </div>
            {bill.discount > 0 && (
              <div className="flex justify-between text-success">
                <span>
                  Discount{' '}
                  {bill.subtotal > 0
                    ? `(${Math.round((bill.discount / bill.subtotal) * 100)}%)`
                    : ''}:
                </span>
                <span className="tabular-nums">- {formatINR(bill.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-1 border-t border-border">
              <span>Grand Total:</span>
              <span className="tabular-nums text-accent">{formatINR(bill.total)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-text-muted">
              <span>Payment Mode:</span>
              <span className="uppercase font-medium">{bill.payment_mode}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-border my-2" />

          {/* Footer message */}
          <div className="text-center text-[10px] text-text-muted">
            <p>{settings.receipt_footer}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-4 pt-3 border-t border-border flex flex-col gap-2 print:hidden">
          {/* Edit window indicator */}
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-text-muted">Staff Edit Window:</span>
            <span
              className={`font-mono font-medium ${
                editPermission.canEdit ? 'text-accent' : 'text-danger'
              }`}
            >
              {formatRemainingTime(editPermission.remainingMs)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="primary" onClick={handlePrint} size="sm">
              <Printer size={16} />
              <span>Print</span>
            </Button>

            <Button
              variant="secondary"
              onClick={onEditBill}
              size="sm"
              disabled={!editPermission.canEdit}
              disabledReason={editPermission.reason}
            >
              <Edit3 size={16} />
              <span>Edit</span>
            </Button>

            <Button variant="secondary" onClick={onNewBill} size="sm">
              <PlusCircle size={16} />
              <span>New Bill</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
