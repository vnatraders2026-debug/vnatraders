import React, { useState, useEffect } from 'react';
import { Bill, BillItem, ShopSettings, Profile } from '@/types';
import { checkBillEditPermission, formatRemainingTime } from '@/lib/permissions';
import { Printer, PlusCircle, Edit3, X, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ReceiptCard } from './ReceiptCard';
import { WhatsAppModal } from './WhatsAppModal';

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
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);

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
    <>
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
          <div className="flex-1 overflow-y-auto p-2 bg-background border border-border rounded flex justify-center">
            <ReceiptCard
              bill={bill}
              items={items}
              settings={settings}
              id="receipt-print-area"
              className="w-full"
            />
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

            <div className="grid grid-cols-4 gap-2">
              <Button variant="primary" onClick={handlePrint} size="sm">
                <Printer size={15} />
                <span>Print</span>
              </Button>

              <Button
                variant="secondary"
                onClick={onEditBill}
                size="sm"
                disabled={!editPermission.canEdit}
                disabledReason={editPermission.reason}
              >
                <Edit3 size={15} />
                <span>Edit</span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => setIsWhatsAppOpen(true)}
                size="sm"
                className="text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                title="Send bill image to WhatsApp"
              >
                <MessageSquare size={15} />
                <span>WhatsApp</span>
              </Button>

              <Button variant="secondary" onClick={onNewBill} size="sm">
                <PlusCircle size={15} />
                <span>New Bill</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {isWhatsAppOpen && (
        <WhatsAppModal
          isOpen={isWhatsAppOpen}
          onClose={() => setIsWhatsAppOpen(false)}
          bill={bill}
          items={items}
          settings={settings}
        />
      )}
    </>
  );
};
