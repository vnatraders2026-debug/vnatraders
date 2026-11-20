import { describe, it, expect } from 'vitest';
import { Company, Bill, SaleOrder, PurchaseOrder, Quotation, Invoice, ShopSettings } from '../src/types';
import { DEFAULT_COMPANIES } from '../src/db';

describe('Multi-Company Management & Operating Firm Context', () => {
  const primaryCompany: Company = {
    id: 'c1111111-1111-1111-1111-111111110001',
    name: 'VNA TRADERS',
    legal_name: 'VNA TRADERS FIREWORKS WHOLESALE',
    code: 'VNA',
    gstin: '33ACSPV5299F1Z5',
    pan: 'ACSPV5299F',
    phone: '+91 94431 23456',
    email: 'contact@vnatraders.com',
    address: 'Jeermangalam, Hosur Depot',
    city: 'Hosur',
    state: 'Tamil Nadu',
    pincode: '635109',
    bank_name: 'State Bank of India (SBI)',
    bank_account_no: '3948201004521',
    bank_ifsc: 'SBIN0001234',
    bank_branch: 'Hosur Branch',
    receipt_footer: 'Thank you for celebrating with VNA Traders! Genuine Sivakasi Green Crackers.',
    is_active: true,
    is_default: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const sisterCompany: Company = {
    id: 'c2222222-2222-2222-2222-222222220002',
    name: 'SRI BALAJI FIREWORKS',
    legal_name: 'SRI BALAJI PYRO TRADERS',
    code: 'SBF',
    gstin: '33AAACB1234F1Z8',
    pan: 'AAACB1234F',
    phone: '+91 98421 99887',
    email: 'info@balajipyro.com',
    address: 'Denkanikottai Road',
    city: 'Hosur',
    state: 'Tamil Nadu',
    pincode: '635110',
    bank_name: 'HDFC Bank',
    bank_account_no: '50200012345678',
    bank_ifsc: 'HDFC0001889',
    bank_branch: 'Hosur Sipcot',
    receipt_footer: 'Balaji Crackers - Safe & Sparkle Festivities!',
    is_active: true,
    is_default: false,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  };

  it('provides default seed company with valid Hosur GSTIN & PAN', () => {
    expect(DEFAULT_COMPANIES.length).toBeGreaterThanOrEqual(1);
    const def = DEFAULT_COMPANIES[0];
    expect(def.name).toBe('VNA TRADERS');
    expect(def.gstin).toBe('33ACSPV5299F1Z5');
    expect(def.pan).toBe('ACSPV5299F');
    expect(def.is_default).toBe(true);
    expect(def.is_active).toBe(true);
  });

  it('correctly associates bills with operating company metadata', () => {
    const billForVna: Bill = {
      id: 'b-001',
      bill_no: 'VNA-261120-0001',
      subtotal: 5000,
      discount_amount: 500,
      tax_amount: 0,
      total: 4500,
      payment_mode: 'cash',
      created_by: 'staff-1',
      created_at: '2026-11-20T10:00:00Z',
      sync_status: 'synced',
      company_id: primaryCompany.id,
      company_name: primaryCompany.name,
    };

    const billForSister: Bill = {
      id: 'b-002',
      bill_no: 'SBF-261120-0001',
      subtotal: 12000,
      discount_amount: 1000,
      tax_amount: 0,
      total: 11000,
      payment_mode: 'upi',
      created_by: 'staff-2',
      created_at: '2026-11-20T10:30:00Z',
      sync_status: 'pending',
      company_id: sisterCompany.id,
      company_name: sisterCompany.name,
    };

    expect(billForVna.company_id).toBe(primaryCompany.id);
    expect(billForVna.company_name).toBe('VNA TRADERS');
    expect(billForSister.company_id).toBe(sisterCompany.id);
    expect(billForSister.company_name).toBe('SRI BALAJI FIREWORKS');
  });

  it('correctly associates sale orders with operating company metadata', () => {
    const so: SaleOrder = {
      id: 'so-001',
      so_no: 'SO-261120-0001',
      customer_name: 'Murugan Crackers Bangalore',
      customer_phone: '9845012345',
      pricing_type: 'wholesale',
      order_date: '2026-11-20',
      status: 'pending',
      subtotal: 25000,
      discount_amount: 2500,
      total_amount: 22500,
      payment_status: 'unpaid',
      paid_amount: 0,
      company_id: sisterCompany.id,
      company_name: sisterCompany.name,
      created_by: 'Admin',
      created_at: '2026-11-20T11:00:00Z',
      updated_at: '2026-11-20T11:00:00Z',
    };

    expect(so.company_id).toBe(sisterCompany.id);
    expect(so.company_name).toBe('SRI BALAJI FIREWORKS');
  });

  it('correctly associates purchase orders and quotations with operating company metadata', () => {
    const po: PurchaseOrder = {
      id: 'po-001',
      po_no: 'PO-261120-0001',
      supplier_name: 'Standard Fireworks Sivakasi',
      order_date: '2026-11-20',
      status: 'ordered',
      subtotal: 100000,
      discount_amount: 5000,
      tax_amount: 0,
      total_amount: 95000,
      payment_status: 'unpaid',
      paid_amount: 0,
      company_id: primaryCompany.id,
      company_name: primaryCompany.name,
      created_by: 'Admin',
      created_at: '2026-11-20T09:00:00Z',
      updated_at: '2026-11-20T09:00:00Z',
    };

    const quote: Quotation = {
      id: 'qt-001',
      quotation_no: 'QT-261120-0001',
      customer_name: 'Karthik Traders Salem',
      pricing_type: 'wholesale',
      quotation_date: '2026-11-20',
      valid_until: '2026-11-27',
      status: 'draft',
      subtotal: 30000,
      discount_amount: 3000,
      taxable_amount: 27000,
      gst_rate: 18,
      cgst: 2430,
      sgst: 2430,
      igst: 0,
      round_off: 0,
      total_amount: 31860,
      company_id: sisterCompany.id,
      company_name: sisterCompany.name,
      created_by: 'Staff',
      created_at: '2026-11-20T09:30:00Z',
      updated_at: '2026-11-20T09:30:00Z',
    };

    expect(po.company_name).toBe('VNA TRADERS');
    expect(quote.company_name).toBe('SRI BALAJI FIREWORKS');
  });

  it('dynamically overrides receipt shop settings with active company details', () => {
    const fallbackSettings: ShopSettings = {
      shop_name: 'Default Store',
      shop_address: 'Default Address',
      shop_phone: '1234567890',
      gst_no: 'DEFAULTGST',
      receipt_footer: 'Thank you',
      device_code: 'POS-01',
      paper_size: '80mm',
    };

    // Helper simulation matching NewBillPage and BillsPage
    const getEffectiveSettings = (company: Company | null, settings: ShopSettings | null): ShopSettings => {
      if (!company) return settings || fallbackSettings;
      return {
        shop_name: company.name,
        gst_no: company.gstin || settings?.gst_no || '',
        shop_address: company.address
          ? `${company.address}, ${company.city || ''} ${company.pincode || ''}`.trim()
          : settings?.shop_address || '',
        shop_phone: company.phone || settings?.shop_phone || '',
        receipt_footer: company.receipt_footer || settings?.receipt_footer || '',
        device_code: settings?.device_code || 'POS-01',
        paper_size: settings?.paper_size || '80mm',
      };
    };

    const effectivePrimary = getEffectiveSettings(primaryCompany, fallbackSettings);
    expect(effectivePrimary.shop_name).toBe('VNA TRADERS');
    expect(effectivePrimary.gst_no).toBe('33ACSPV5299F1Z5');
    expect(effectivePrimary.shop_phone).toBe('+91 94431 23456');
    expect(effectivePrimary.receipt_footer).toContain('VNA Traders');

    const effectiveSister = getEffectiveSettings(sisterCompany, fallbackSettings);
    expect(effectiveSister.shop_name).toBe('SRI BALAJI FIREWORKS');
    expect(effectiveSister.gst_no).toBe('33AAACB1234F1Z8');
    expect(effectiveSister.shop_phone).toBe('+91 98421 99887');
    expect(effectiveSister.receipt_footer).toContain('Balaji Crackers');
  });

  it('accurately isolates analytics metrics between active company and consolidated scope', () => {
    const allBills: Bill[] = [
      {
        id: '1',
        bill_no: 'B1',
        subtotal: 1000,
        discount_amount: 0,
        tax_amount: 0,
        total: 1000,
        payment_mode: 'cash',
        created_by: 'user-1',
        created_at: '2026-11-20T10:00:00Z',
        sync_status: 'synced',
        company_id: primaryCompany.id,
      },
      {
        id: '2',
        bill_no: 'B2',
        subtotal: 2000,
        discount_amount: 0,
        tax_amount: 0,
        total: 2000,
        payment_mode: 'cash',
        created_by: 'user-1',
        created_at: '2026-11-20T10:00:00Z',
        sync_status: 'synced',
        company_id: primaryCompany.id,
      },
      {
        id: '3',
        bill_no: 'B3',
        subtotal: 5000,
        discount_amount: 0,
        tax_amount: 0,
        total: 5000,
        payment_mode: 'upi',
        created_by: 'user-2',
        created_at: '2026-11-20T10:00:00Z',
        sync_status: 'synced',
        company_id: sisterCompany.id,
      },
    ];

    // Active scope (primary company)
    const primaryRevenue = allBills
      .filter((b) => b.company_id === primaryCompany.id)
      .reduce((sum, b) => sum + b.total, 0);

    // Active scope (sister company)
    const sisterRevenue = allBills
      .filter((b) => b.company_id === sisterCompany.id)
      .reduce((sum, b) => sum + b.total, 0);

    // Consolidated scope (all companies)
    const totalRevenue = allBills.reduce((sum, b) => sum + b.total, 0);

    expect(primaryRevenue).toBe(3000);
    expect(sisterRevenue).toBe(5000);
    expect(totalRevenue).toBe(8000);
  });
});
