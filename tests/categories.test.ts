import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/db';
import { formatBillForWhatsApp } from '../src/features/billing/WhatsAppModal';
import { Bill, BillItem, ShopSettings } from '../src/types';

describe('Cracker Categories & WhatsApp Integration', () => {
  it('includes all standard Sivakasi cracker categories', () => {
    expect(DEFAULT_CATEGORIES).toContain('Sparklers');
    expect(DEFAULT_CATEGORIES).toContain('Ground Chakkars');
    expect(DEFAULT_CATEGORIES).toContain('Flower Pots');
    expect(DEFAULT_CATEGORIES).toContain('Rockets');
    expect(DEFAULT_CATEGORIES).toContain('Bombs & Sound Crackers');
    expect(DEFAULT_CATEGORIES).toContain('Bijili Crackers');
    expect(DEFAULT_CATEGORIES).toContain('Single & Multi Shots');
    expect(DEFAULT_CATEGORIES).toContain('Fancy Sky Shots');
    expect(DEFAULT_CATEGORIES).toContain('Fancy Novelties');
    expect(DEFAULT_CATEGORIES).toContain('Twinkling Stars');
    expect(DEFAULT_CATEGORIES).toContain('Fountains & Cones');
    expect(DEFAULT_CATEGORIES).toContain('Garlands (Wala Crackers)');
    expect(DEFAULT_CATEGORIES).toContain('Roll Caps & Ring Caps');
    expect(DEFAULT_CATEGORIES).toContain('Gift Boxes');
    expect(DEFAULT_CATEGORIES).toContain('Party Poppers');
    expect(DEFAULT_CATEGORIES).toContain('Kids Special Crackers');
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThanOrEqual(16);
  });

  it('validates 10-digit mobile number cleaning logic', () => {
    const cleanPhoneDigits = (raw: string) => {
      const digits = raw.replace(/\D/g, '');
      return digits.length > 10 ? digits.slice(-10) : digits;
    };

    expect(cleanPhoneDigits('+91 98421 23456')).toBe('9842123456');
    expect(cleanPhoneDigits('09842123456')).toBe('9842123456');
    expect(cleanPhoneDigits('9842123456')).toBe('9842123456');
    expect(cleanPhoneDigits('98421-23456')).toBe('9842123456');
    expect(cleanPhoneDigits('123')).toBe('123');
  });

  it('formats complete WhatsApp message with all purchased items and brand discounts', () => {
    const mockBill: Bill = {
      id: 'b-1',
      bill_no: '261012-A-0005',
      customer_name: 'Murugan',
      customer_phone: '9842123456',
      subtotal: 500,
      discount: 50,
      total: 450,
      payment_mode: 'cash',
      created_by: 'u-1',
      created_at: '2026-10-12T10:00:00Z',
      updated_at: '2026-10-12T10:00:00Z',
      brand_discounts: { Standard: 10 },
    };

    const mockItems: BillItem[] = [
      {
        id: 'bi-1',
        bill_id: 'b-1',
        product_name: '10 cm Electric Sparklers',
        brand: 'Standard',
        qty: 2,
        unit_price: 150,
        line_total: 300,
      },
      {
        id: 'bi-2',
        bill_id: 'b-1',
        product_name: 'Hydro Bombs 2 inch',
        brand: 'General',
        qty: 1,
        unit_price: 200,
        line_total: 200,
      },
    ];

    const mockSettings: ShopSettings = {
      shop_name: 'VNA Traders',
      shop_address: '142 Kakkan Road, Sivakasi',
      shop_phone: '+91 94431 23456',
      gst_no: '33VNACK0000A1Z5',
      receipt_footer: 'Wishing you a bright celebration!',
      device_code: 'A',
      paper_size: '80mm',
    };

    const text = formatBillForWhatsApp(mockBill, mockItems, mockSettings);

    // Verifies all items are present in the text
    expect(text).toContain('VNA TRADERS');
    expect(text).toContain('261012-A-0005');
    expect(text).toContain('Murugan (9842123456)');
    expect(text).toContain('1. *10 cm Electric Sparklers* [Standard]');
    expect(text).toContain('2 pcs × ₹150.00 = *₹300.00*');
    expect(text).toContain('2. *Hydro Bombs 2 inch* [General]');
    expect(text).toContain('1 pcs × ₹200.00 = *₹200.00*');
    expect(text).toContain('Subtotal: ₹500.00');
    expect(text).toContain('Standard Discount (10% off)');
    expect(text).toContain('Total Discount: -₹50.00');
    expect(text).toContain('GRAND TOTAL: ₹450.00');
  });
});
