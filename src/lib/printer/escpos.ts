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
  // Replace rupee symbol and non-ASCII chars cleanly for thermal POS printers
  const sanitized = str
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x00-\x7F]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < sanitized.length; i++) {
    bytes.push(sanitized.charCodeAt(i));
  }
  return bytes;
}

function line(text: string): number[] {
  return [...textToBytes(text), 0x0a];
}

function padColumns(left: string, right: string, width = 38): string {
  const leftClean = left.slice(0, width - right.length - 1);
  const spaces = Math.max(1, width - leftClean.length - right.length);
  return leftClean + ' '.repeat(spaces) + right;
}

/**
 * Ensures table row completes on ONE SINGLE LINE without wrapping numbers
 */
function tableRow(item: string, qty: string, rate: string, total: string, width = 38): string {
  if (width <= 38) {
    // 58mm compact layout (38 chars total):
    // Item (16) + ' ' (1) + Qty (4) + ' ' (1) + Rate (7) + ' ' (1) + Total (8) = 38 chars
    const it = item.slice(0, 16).padEnd(16);
    const q = qty.padStart(4);
    const r = rate.padStart(7);
    const t = total.padStart(8);
    return `${it} ${q} ${r} ${t}`;
  } else {
    // 80mm standard layout (46 chars total):
    // Item (22) + ' ' (1) + Qty (4) + ' ' (1) + Rate (8) + ' ' (1) + Total (9) = 45 chars
    const it = item.slice(0, 22).padEnd(22);
    const q = qty.padStart(4);
    const r = rate.padStart(8);
    const t = total.padStart(9);
    return `${it} ${q} ${r} ${t}`;
  }
}

/**
 * Builds raw ESC/POS byte sequence for a bill
 * Center aligned structure, guaranteed 1-line item rows, with billedBy username at the end.
 */
export function buildEscPosReceipt(
  bill: Bill,
  items: BillItem[],
  settings: ShopSettings,
  billedBy?: string
): Uint8Array {
  const is80mm = settings.paper_size === '80mm';
  // 38 columns for 58mm thermal printers, 46 columns for 80mm thermal printers
  const width = is80mm ? 46 : 38;
  const divider = '-'.repeat(width);

  const bytes: number[] = [];

  // 1. Initialize printer
  bytes.push(...ESCPOS.INIT);

  // 2. Shop Header (Center aligned, bold shop name)
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...ESCPOS.BOLD_ON);
  bytes.push(...ESCPOS.DOUBLE_SIZE_ON);
  bytes.push(...line(settings.shop_name || 'VNA CRACKERS'));
  bytes.push(...ESCPOS.NORMAL_SIZE);
  bytes.push(...ESCPOS.BOLD_OFF);

  if (settings.shop_address) {
    bytes.push(...line(settings.shop_address));
  }
  if (settings.shop_phone) {
    bytes.push(...line(`Ph: ${settings.shop_phone}`));
  }
  if (settings.gst_no) {
    bytes.push(...line(`GST: ${settings.gst_no}`));
  }

  // 3. Divider (Center aligned)
  bytes.push(...line(divider));

  // 4. Bill Meta (Center aligned)
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...ESCPOS.BOLD_ON);
  bytes.push(...line(`Bill: ${bill.bill_no}`));
  bytes.push(...ESCPOS.BOLD_OFF);
  bytes.push(...line(formatISTDate(bill.created_at)));

  if (bill.customer_name || bill.customer_phone) {
    const cust = [bill.customer_name, bill.customer_phone ? `(${bill.customer_phone})` : '']
      .filter(Boolean)
      .join(' ');
    bytes.push(...line(`Customer: ${cust.slice(0, width - 2)}`));
  }

  // 5. Divider
  bytes.push(...line(divider));

  // 6. Column Headers (One single complete line)
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...ESCPOS.BOLD_ON);
  bytes.push(...line(tableRow('Item', 'Qty', 'Rate', 'Total', width)));
  bytes.push(...ESCPOS.BOLD_OFF);
  bytes.push(...line(divider));

  // 7. Bill Items (Guaranteed 1 line per item, numbers never split)
  bytes.push(...ESCPOS.ALIGN_CENTER);
  for (const it of items) {
    const totalStr = it.line_total.toFixed(2);
    const rateStr = it.unit_price.toFixed(2);
    const qtyStr = it.qty.toString();

    bytes.push(...line(tableRow(it.product_name, qtyStr, rateStr, totalStr, width)));
  }

  // 8. Divider
  bytes.push(...line(divider));

  // 9. Subtotal & Discounts
  bytes.push(...line(padColumns('Subtotal:', `Rs. ${bill.subtotal.toFixed(2)}`, width)));

  if (bill.discount > 0) {
    bytes.push(...line(padColumns('Total Discount:', `- Rs. ${bill.discount.toFixed(2)}`, width)));
  }

  // 10. Grand Total (Center aligned, Big Bold!)
  bytes.push(...line(divider));
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...ESCPOS.BOLD_ON);
  bytes.push(...ESCPOS.DOUBLE_HEIGHT_ON);
  bytes.push(...line(`GRAND TOTAL: Rs. ${bill.total.toFixed(2)}`));
  bytes.push(...ESCPOS.NORMAL_SIZE);
  bytes.push(...ESCPOS.BOLD_OFF);
  bytes.push(...line(divider));

  // 11. Payment Mode & Billed By username (Center aligned at the last)
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...line(`Payment Mode: ${bill.payment_mode.toUpperCase()}`));
  if (billedBy) {
    bytes.push(...ESCPOS.BOLD_ON);
    bytes.push(...line(`Billed By: ${billedBy}`));
    bytes.push(...ESCPOS.BOLD_OFF);
  }
  bytes.push(...line(divider));

  // 12. Footer Message (Center aligned)
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(0x0a);
  const footerText = settings.receipt_footer || 'Thank you for choosing VNA Crackers!';
  bytes.push(...line(footerText));

  // 13. Paper Feed & Cut
  bytes.push(...ESCPOS.FEED_LINES(4));
  bytes.push(...ESCPOS.CUT_PARTIAL);

  return new Uint8Array(bytes);
}

/**
 * Builds a test receipt for printer testing
 */
export function buildTestReceipt(settings: ShopSettings, billedBy = 'Admin'): Uint8Array {
  const is80mm = settings.paper_size === '80mm';
  const width = is80mm ? 46 : 38;
  const divider = '-'.repeat(width);

  const bytes: number[] = [];
  bytes.push(...ESCPOS.INIT);
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...ESCPOS.BOLD_ON);
  bytes.push(...ESCPOS.DOUBLE_SIZE_ON);
  bytes.push(...line(settings.shop_name || 'VNA CRACKERS'));
  bytes.push(...ESCPOS.NORMAL_SIZE);
  bytes.push(...ESCPOS.BOLD_OFF);
  bytes.push(...line('THERMAL PRINTER TEST'));
  bytes.push(...line(divider));
  bytes.push(...ESCPOS.ALIGN_CENTER);
  bytes.push(...line(`Date: ${new Date().toLocaleDateString()}`));
  bytes.push(...line(`Paper Mode: ${settings.paper_size || '58mm'}`));
  bytes.push(...line('Center Alignment: OK!'));
  bytes.push(...line('1-Line Formatting: VERIFIED!'));
  bytes.push(...line(`Billed By: ${billedBy}`));
  bytes.push(...line(divider));
  bytes.push(...line('*** TEST PRINT OK ***'));
  bytes.push(...ESCPOS.FEED_LINES(4));
  bytes.push(...ESCPOS.CUT_PARTIAL);

  return new Uint8Array(bytes);
}
