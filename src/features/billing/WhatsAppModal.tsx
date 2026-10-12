import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Bill, BillItem, ShopSettings } from '@/types';
import { db, getShopSettings } from '@/db';
import { formatISTDate, formatNumber } from '@/lib/format';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ReceiptCard } from './ReceiptCard';
import { MessageSquare, Download, Loader2, CheckCircle2, Copy } from 'lucide-react';

export function formatBillForWhatsApp(
  bill: Bill,
  items: BillItem[],
  settings?: ShopSettings | null
): string {
  const shopName = settings?.shop_name || 'VNA Crackers';
  const shopAddress = settings?.shop_address || '142 Kakkan Road, Sivakasi';
  const shopPhone = settings?.shop_phone || '';
  const gstNo = settings?.gst_no || '';
  const footer = settings?.receipt_footer || 'Thank you for choosing VNA Crackers! Wishing you a bright celebration.';

  const lines: string[] = [];

  // Shop Header
  lines.push(`💥 *${shopName.toUpperCase()}* 💥`);
  if (shopAddress) lines.push(`📍 ${shopAddress}`);
  if (shopPhone) lines.push(`📞 Ph: ${shopPhone}`);
  if (gstNo) lines.push(`🏢 GST: ${gstNo}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Bill Metadata
  lines.push(`📄 *Bill No:* ${bill.bill_no}`);
  lines.push(`📅 *Date:* ${formatISTDate(bill.created_at)}`);
  if (bill.customer_name || bill.customer_phone) {
    const custInfo = [bill.customer_name, bill.customer_phone ? `(${bill.customer_phone})` : '']
      .filter(Boolean)
      .join(' ');
    lines.push(`👤 *Customer:* ${custInfo}`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Purchased Items Breakdown
  lines.push(`🛒 *PURCHASED ITEMS:*`);
  items.forEach((item, index) => {
    const brandStr = item.brand ? ` [${item.brand}]` : '';
    lines.push(
      `${index + 1}. *${item.product_name}*${brandStr}\n` +
      `   ${item.qty} pcs × ₹${formatNumber(item.unit_price)} = *₹${formatNumber(item.line_total)}*`
    );
  });
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Subtotal & Discounts
  lines.push(`Subtotal: ₹${formatNumber(bill.subtotal)}`);

  if (bill.brand_discounts && Object.entries(bill.brand_discounts).some(([_, pct]) => pct > 0)) {
    Object.entries(bill.brand_discounts)
      .filter(([_, pct]) => pct > 0)
      .forEach(([bName, bPct]) => {
        lines.push(`• ${bName} Discount (${bPct}% off)`);
      });
    lines.push(`Total Discount: -₹${formatNumber(bill.discount)}`);
  } else if (bill.discount > 0) {
    lines.push(`Discount: -₹${formatNumber(bill.discount)}`);
  }

  // Grand Total & Payment Mode
  lines.push(`💰 *GRAND TOTAL: ₹${formatNumber(bill.total)}*`);
  lines.push(`💳 *Payment Mode:* ${bill.payment_mode.toUpperCase()}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`✨ ${footer}`);

  return lines.join('\n');
}

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: Bill;
  items?: BillItem[];
  settings?: ShopSettings;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  bill,
  items: initialItems,
  settings: initialSettings,
}) => {
  const { toast } = useToast();
  const [phone, setPhone] = useState(bill.customer_phone || '');
  const [openInMode, setOpenInMode] = useState<'web' | 'app'>('web');
  const [items, setItems] = useState<BillItem[]>(initialItems || []);
  const [settings, setSettings] = useState<ShopSettings | null>(initialSettings || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const receiptCaptureRef = useRef<HTMLDivElement>(null);

  // Sync phone if bill changes
  useEffect(() => {
    setPhone(bill.customer_phone || '');
    setIsCopied(false);
    setImageBlobUrl(null);
  }, [bill]);

  // Load items and settings if not passed
  useEffect(() => {
    let isMounted = true;
    async function loadDetails() {
      if (!initialItems || initialItems.length === 0) {
        const loadedItems = await db.bill_items.where('bill_id').equals(bill.id).toArray();
        if (isMounted) setItems(loadedItems);
      } else {
        if (isMounted) setItems(initialItems);
      }

      if (!initialSettings) {
        const loadedSettings = await getShopSettings();
        if (isMounted) setSettings(loadedSettings);
      } else {
        if (isMounted) setSettings(initialSettings);
      }
    }
    if (isOpen) {
      loadDetails();
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, bill.id, initialItems, initialSettings]);

  // Clean and validate 10-digit phone
  const cleanPhoneDigits = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  };

  const handleGenerateAndSend = async () => {
    const digits10 = cleanPhoneDigits(phone);
    if (digits10.length !== 10) {
      toast('Please enter a valid 10-digit mobile number', 'error');
      return;
    }

    const captureElem = receiptCaptureRef.current;
    if (!captureElem) {
      toast('Could not find bill receipt element to capture', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      // 1. High-resolution canvas rendering of the bill receipt
      const canvas = await html2canvas(captureElem, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      // 2. Convert to PNG blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 1.0)
      );

      if (!blob) {
        throw new Error('Failed to render receipt image');
      }

      const blobUrl = URL.createObjectURL(blob);
      setImageBlobUrl(blobUrl);

      // 3. Try to copy the PNG image directly to clipboard
      let clipboardCopied = false;
      try {
        if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          clipboardCopied = true;
          setIsCopied(true);
        }
      } catch (clipErr) {
        console.warn('Clipboard write warning:', clipErr);
      }

      // 4. Generate full bill message including all items, brand discounts, subtotal & grand total
      const messageText = formatBillForWhatsApp(bill, items, settings);

      // Using direct WhatsApp Web / API phone URL opens the entered customer's chat directly
      const waUrl =
        openInMode === 'web'
          ? `https://web.whatsapp.com/send?phone=91${digits10}&text=${encodeURIComponent(messageText)}`
          : `https://api.whatsapp.com/send?phone=91${digits10}&text=${encodeURIComponent(messageText)}`;

      window.open(waUrl, '_blank');

      if (clipboardCopied) {
        toast(`Opening WhatsApp with full items bill! Press Ctrl+V if you also want to paste receipt image.`, 'success');
      } else {
        toast(`Opening WhatsApp chat for +91 ${digits10}...`, 'info');
      }
    } catch (err: any) {
      console.error('WhatsApp bill error:', err);
      toast(err?.message || 'Failed to process WhatsApp bill', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadImage = () => {
    if (!imageBlobUrl) return;
    const a = document.createElement('a');
    a.href = imageBlobUrl;
    a.download = `Bill_${bill.bill_no}.png`;
    a.click();
    toast('Receipt image downloaded', 'success');
  };

  const handleCopyText = async () => {
    const text = formatBillForWhatsApp(bill, items, settings);
    try {
      await navigator.clipboard.writeText(text);
      toast('Complete bill text copied to clipboard!', 'success');
    } catch {
      toast('Failed to copy bill text', 'error');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Send Bill to WhatsApp">
      <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        {/* Mobile Number Entry Prompt */}
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded p-3">
          <label className="block text-xs font-semibold text-text mb-1.5">
            Customer WhatsApp Mobile Number <span className="text-danger">*</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="px-3 py-2 bg-surface text-text-muted text-sm font-medium border border-border rounded">
              +91
            </span>
            <input
              type="tel"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 98421 23456"
              className="flex-1 min-h-[42px] px-3 py-2 text-base font-mono bg-surface text-text border border-border rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2.5 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 text-xs">
            <span className="font-semibold text-text">Direct Chat Target:</span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="openInMode"
                value="web"
                checked={openInMode === 'web'}
                onChange={() => setOpenInMode('web')}
                className="text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium text-text">WhatsApp Web (Browser)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="openInMode"
                value="app"
                checked={openInMode === 'app'}
                onChange={() => setOpenInMode('app')}
                className="text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-text-muted">WhatsApp App</span>
            </label>
          </div>
          <p className="text-[11px] text-text-muted mt-1.5">
            Opens directly in conversation with +91 {cleanPhoneDigits(phone) || 'XXXXXXXXXX'} with zero searching required.
          </p>
        </div>

        {/* Notice on Items and Delivery */}
        <div className="text-xs text-text-muted flex items-start gap-2 bg-surface border border-border p-2.5 rounded">
          <MessageSquare className="text-emerald-600 shrink-0 mt-0.5" size={16} />
          <div>
            <strong className="text-text font-semibold">Sends Complete Bill With Items:</strong>
            <p className="mt-0.5">
              • The full bill with <strong>all items, quantities, brand discounts & totals</strong> will be automatically typed in WhatsApp.
              <br />
              • The <strong>thermal receipt image</strong> is also copied to clipboard so you can press <kbd className="px-1.5 py-0.5 bg-background border border-border rounded font-mono text-[10px]">Ctrl + V</kbd> to paste the image as well.
            </p>
          </div>
        </div>

        {/* Visual Receipt Preview Container */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text">Bill Receipt Preview:</span>
              {isCopied && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} />
                  Image Copied!
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyText}
                className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
              >
                <Copy size={12} />
                <span>Copy Bill Text</span>
              </button>
              {imageBlobUrl && (
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
                >
                  <Download size={12} />
                  <span>Save Image</span>
                </button>
              )}
            </div>
          </div>

          <div className="border border-border rounded p-2 bg-gray-100 dark:bg-gray-900 overflow-x-auto flex justify-center">
            {settings && (
              <div ref={receiptCaptureRef} className="shadow-sm">
                <ReceiptCard
                  bill={bill}
                  items={items}
                  settings={settings}
                  id="whatsapp-receipt-capture"
                />
              </div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>

          <Button
            variant="primary"
            onClick={handleGenerateAndSend}
            disabled={isProcessing || cleanPhoneDigits(phone).length !== 10}
            className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[42px] px-5 font-semibold"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Generating & Sending...</span>
              </>
            ) : (
              <>
                <MessageSquare size={16} />
                <span>Send to WhatsApp</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
