import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bill, BillItem, ShopSettings, Profile } from '@/types';
import { checkBillEditPermission, formatRemainingTime } from '@/lib/permissions';
import { Printer, PlusCircle, Edit3, X, MessageSquare, Bluetooth, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { directPrinterService, PrinterStatus } from '@/lib/printer/directPrinterService';
import { ReceiptCard } from './ReceiptCard';
import { WhatsAppModal } from './WhatsAppModal';

interface ReceiptModalProps {
  bill: Bill;
  items: BillItem[];
  settings: ShopSettings;
  currentUser: Profile;
  billedBy?: string;
  autoPrint?: boolean;
  onNewBill: () => void;
  onEditBill: () => void;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  bill,
  items,
  settings,
  currentUser,
  billedBy,
  autoPrint = false,
  onNewBill,
  onEditBill,
  onClose,
}) => {
  const { toast } = useToast();
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>(directPrinterService.getStatus());
  const [isDirectPrinting, setIsDirectPrinting] = useState(false);

  useEffect(() => {
    return directPrinterService.subscribe((s) => {
      setPrinterStatus(s);
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const billedUserName = currentUser?.full_name || currentUser?.email || 'Admin';

  const handlePrint = async () => {
    if (directPrinterService.isConnected()) {
      setIsDirectPrinting(true);
      try {
        const res = await directPrinterService.printBillDirect(bill, items, settings, billedUserName);
        toast(`Directly printed to ${res.printerName || 'Thermal POS'}!`, 'success');
        return;
      } catch (err: any) {
        toast(`Direct printer error: ${err.message}. Falling back to browser print dialog.`, 'warning');
      } finally {
        setIsDirectPrinting(false);
      }
    }
    // Fallback to standard browser print if no direct printer is active
    window.print();
  };

  // Automatic thermal print on save
  useEffect(() => {
    if (autoPrint) {
      const printTimer = setTimeout(() => {
        handlePrint();
      }, 350);
      return () => clearTimeout(printTimer);
    }
  }, [autoPrint]);

  const handleConnectDirectBluetooth = async () => {
    try {
      const name = await directPrinterService.connectBluetooth();
      toast(`Connected to ${name}! Ready for direct print.`, 'success');
    } catch (err: any) {
      if (!err.message?.includes('User cancelled')) {
        toast(err.message || 'Bluetooth connection failed', 'error');
      }
    }
  };

  const editPermission = checkBillEditPermission(bill, currentUser, currentTimeMs);

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 print-modal-overlay print:static print:p-0 print:m-0 print:block">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 print:hidden" onClick={onClose} aria-hidden="true" />

        {/* Main Container */}
        <div className="relative w-full max-w-lg bg-surface border border-border rounded shadow-subtle p-4 sm:p-6 z-10 max-h-[95dvh] flex flex-col print-modal-overlay print:border-none print:p-0 print:m-0 print:shadow-none print:max-h-none print:bg-transparent">
          {/* Header Action Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-border mb-4 print:hidden">
            <div>
              <h2 className="text-base font-bold text-text">Bill Receipt</h2>
              <p className="text-xs text-text-muted">{bill.bill_no}</p>
            </div>
            <div className="flex items-center gap-2">
              {printerStatus.isConnected ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="truncate max-w-[140px]">Direct: {printerStatus.deviceName}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectDirectBluetooth}
                  className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent-hover bg-accent-light px-2 py-0.5 rounded border border-accent/30 transition-colors"
                  title="Connect wireless Bluetooth thermal printer for instant direct print"
                >
                  <Bluetooth size={12} />
                  <span>Connect Direct</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-text-muted hover:text-text rounded hover:bg-background"
                aria-label="Close receipt"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Printable Receipt Paper Container */}
          <div className="flex-1 overflow-y-auto p-2 bg-background border border-border rounded flex justify-center print:border-none print:p-0 print:m-0 print:overflow-visible print:bg-transparent">
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
              <Button
                variant="primary"
                onClick={handlePrint}
                size="sm"
                disabled={isDirectPrinting}
                className={printerStatus.isConnected ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                title={printerStatus.isConnected ? 'Direct instant thermal print (Zero dialog)' : 'Print receipt'}
              >
                {printerStatus.isConnected ? <Zap size={15} /> : <Printer size={15} />}
                <span>{isDirectPrinting ? 'Printing...' : printerStatus.isConnected ? 'Direct Print' : 'Print'}</span>
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
    </>,
    document.body
  );
};
