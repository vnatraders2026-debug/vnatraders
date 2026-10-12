import { Bill, BillItem, ShopSettings } from '@/types';
import { formatISTDate } from '@/lib/format';

/**
 * ESC/POS Command Constants for Thermal Receipt Printers
 */
export const ESCPOS = {
  INIT: [0x1b, 0x40], // Initialize printer
  ALIGN_LEFT: [0x1b, 0x61, 0x00],
  ALIGN_CENTER: [0x1b, 0x61, 0x01],
  ALIGN_RIGHT: [0x1b, 0x61, 0x02],
  BOLD_ON: [0x1b, 0x45, 0x01],
  BOLD_OFF: [0x1b, 0x45, 0x00],
  DOUBLE_HEIGHT_ON: [0x1b, 0x21, 0x10],
  DOUBLE_WIDTH_ON: [0x1b, 0x21, 0x20],
  DOUBLE_SIZE_ON: [0x1b, 0x21, 0x30],
  NORMAL_SIZE: [0x1b, 0x21, 0x00],
  FEED_LINES: (n: number) => [0x1b, 0x64, n],
  CUT_FULL: [0x1d, 0x56, 0x41, 0x00], // Full cut
  CUT_PARTIAL: [0x1d, 0x56, 0x42, 0x00], // Partial cut
};

function textToBytes(str: string): number[] {
  // Replace rupee symbol or special chars with compatible representation for POS printers
  const sanitized = str
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x00-\x7F]/g, ''); // Standard ASCII
  const bytes: number[] = [];
  for (let i = 0; i < sanitized.length; i++) {
    bytes.push(sanitized.charCodeAt(i));
  }
  return bytes;
}

function line(text: string): number[] {
  return [...textToBytes(text), 0x0a];
}

function padColumns(left: string, right: string, width = 48): string {
  const leftClean = left.slice(0, width - right.length - 1);
  const spaces = Math.max(1, width - leftClean.length - right.length);
  return leftClean + ' '.repeat(spaces) + right;
}

function tableRow(item: string, qty: string, rate: string, total: string, width = 48): string {
  if (width === 32) {
    // 58mm compact layout (32 chars)
    // Item (14) | Qty (3) | Rate (6) | Total (7)
    const it = item.slice(0, 14).padEnd(14);
    const q = qty.padStart(4);
    const r = rate.padStart(6);
    const t = total.padStart(7);
    return `${it} ${q} ${r} ${t}`;
  } else {
    // 80mm standard layout (48 chars)
    // Item (24) | Qty (6) | Rate (8) | Total (10)
    const it = item.slice(0, 22).padEnd(22);
    const q = qty.padStart(6);
    const r = rate.padStart(9);
    const t = total.padStart(10);
    return `${it} ${q} ${r} ${t}`;
  }
}

/**
 * Builds raw ESC/POS byte sequence for a bill
 */
export function buildEscPosReceipt(
  bill: Bill,
  items: BillItem[],
  settings: ShopSettings
): Uint8Array {
  const is58mm = settings.paper_size === '58mm';
  const width = is58mm ? 32 : 48;
  const divider = '-'.repeat(width);

  const bytes: number[] = [];

  // 1. Initialize printer
  bytes.push(...ESCPOS.INIT);

  // 2. Shop Header (Centered, bold title)
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...ESCPOS.DOUBLE_SIZE_ON);
  bytes.push(...line(settings.shop_name || 'VNA CRACKERS'));
  bytes.push(...ESCPOS.NORMAL_SIZE);

  if (settings.shop_address) {
    bytes.push(...line(settings.shop_address));
  }
  if (settings.shop_phone) {
    bytes.push(...line(`Ph: ${settings.shop_phone}`));
  }
  if (settings.gst_no) {
    bytes.push(...line(`GST: ${settings.gst_no}`));
  }

  // 3. Divider
  bytes.push(...line(divider));

  // 4. Bill Meta (Bill No & Date)
  bytes.push(...ESCPOS.ALIGN_LEFT);
  bytes.push(...line(padColumns(`Bill: ${bill.bill_no}`, formatISTDate(bill.created_at), width)));
  if (bill.customer_name || bill.customer_phone) {
    const cust = [bill.customer_name, bill.customer_phone ? `(${bill.customer_phone})` : '']
      .filter(Boolean)
      .join(' ');
    bytes.push(...line(`Customer: ${cust}`));
  }

  // 5. Divider
  bytes.push(...line(divider));

  // 6. Column Headers
  bytes.push(...ESCPOS.BOLD_ON);
  bytes.push(...line(tableRow('Item', 'Qty', 'Rate', 'Total', width)));
  bytes.push(...ESCPOS.BOLD_OFF);
  bytes.push(...line(divider));

  // 7. Bill Items
  for (const it of items) {
    const totalStr = it.line_total.toFixed(2);
    const rateStr = it.unit_price.toFixed(2);
    const qtyStr = it.qty.toString();

    bytes.push(...line(tableRow(it.product_name, qtyStr, rateStr, totalStr, width)));
    if (it.brand && it.brand !== 'Standard') {
      bytes.push(...line(`  [${it.brand}]`));
    }
  }

  // 8. Divider
  bytes.push(...line(divider));

  // 9. Totals
  bytes.push(...line(padColumns('Subtotal:', `Rs. ${bill.subtotal.toFixed(2)}`, width)));

  if (bill.discount > 0) {
    bytes.push(...line(padColumns('Total Discount:', `- Rs. ${bill.discount.toFixed(2)}`, width)));
  }

  // Grand Total (Big Bold)
  bytes.push(...line(divider));
  bytes.push(...ESCPOS.BOLD_ON);
  bytes.push(...ESCPOS.DOUBLE_HEIGHT_ON);
  bytes.push(...line(padColumns('GRAND TOTAL:', `Rs. ${bill.total.toFixed(2)}`, width)));
  bytes.push(...ESCPOS.NORMAL_SIZE);
  bytes.push(...ESCPOS.BOLD_OFF);
  bytes.push(...line(divider));

  // Payment Mode
  bytes.push(...ESCPOS.ALIGN_LEFT);
  bytes.push(...line(padColumns('Payment Mode:', bill.payment_mode.toUpperCase(), width)));

  // Footer Message
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(0x0a);
  bytes.push(...line(settings.receipt_footer || 'Thank you for choosing VNA Crackers!'));
  bytes.push(...line('Wishing you a bright and safe celebration.'));

  // Feed & Cut
  bytes.push(...ESCPOS.FEED_LINES(4));
  bytes.push(...ESCPOS.CUT_PARTIAL);

  return new Uint8Array(bytes);
}

/**
 * Builds a small test receipt for printer testing
 */
export function buildTestReceipt(settings: ShopSettings): Uint8Array {
  const is58mm = settings.paper_size === '58mm';
  const width = is58mm ? 32 : 48;
  const divider = '-'.repeat(width);

  const bytes: number[] = [];
  bytes.push(...ESCPOS.INIT);
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...ESCPOS.DOUBLE_SIZE_ON);
  bytes.push(...line(settings.shop_name || 'VNA CRACKERS'));
  bytes.push(...ESCPOS.NORMAL_SIZE);
  bytes.push(...line('DIRECT THERMAL PRINTER TEST'));
  bytes.push(...line(divider));
  bytes.push(...ESCPOS.ALIGN_LEFT);
  bytes.push(...line(`Date: ${new Date().toLocaleString()}`));
  bytes.push(...line(`Printer Paper: ${settings.paper_size}`));
  bytes.push(...line('Direct POS Communication: OK!'));
  bytes.push(...line('Hardware Cut & Print: SUCCESS!'));
  bytes.push(...line(divider));
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...line('*** TEST PRINT COMPLETED ***'));
  bytes.push(...ESCPOS.FEED_LINES(4));
  bytes.push(...ESCPOS.CUT_PARTIAL);

  return new Uint8Array(bytes);
}
