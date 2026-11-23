import Dexie, { Table } from 'dexie';
import {
  Product,
  Brand,
  Category,
  Client,
  StockMovement,
  PurchaseOrder,
  PurchaseOrderItem,
  SaleOrder,
  SaleOrderItem,
  Invoice,
  InvoiceItem,
  Quotation,
  QuotationItem,
  TransportEntry,
  Bill,
  BillItem,
  OutboxItem,
  SyncMeta,
  ShopSettings,
  Profile,
  ActivityLog,
  DeviceSequence,
  Company,
} from '@/types';
import {
  getISTYYMMDD,
  formatBillNo,
  formatPoNo,
  formatSoNo,
  formatInvoiceNo,
  formatQuotationNo,
  consolidateBillItems,
  calculateBillTotals,
} from '@/lib/format';
import { generateUUID } from '@/lib/uuid';
import { supabase, isConfigured } from '@/lib/supabase';

export const DEFAULT_COMPANY_ID = 'c1111111-1111-1111-1111-111111110001';

export const DEFAULT_COMPANY: Company = {
  id: DEFAULT_COMPANY_ID,
  name: 'VNA TRADERS',
  trade_name: 'VNA Crackers & Fireworks Wholesale',
  gstin: '33ACSPV5299F1Z5',
  phone: '+91 94431 23456',
  email: 'vnatraders2026@gmail.com',
  address: 'Jeermangalam, Hosur',
  city: 'Hosur',
  state: 'Tamil Nadu',
  state_code: '33',
  pincode: '635109',
  bank_name: 'State Bank of India',
  bank_account_no: '38421098451',
  bank_ifsc: 'SBIN0001234',
  bank_branch: 'Hosur Main Branch',
  upi_id: '9443123456@sbi',
  receipt_footer: 'Thank you for choosing VNA Traders! Wishing you a bright and safe celebration.',
  is_default: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const DEFAULT_SETTINGS: ShopSettings = {
  shop_name: 'VNA TRADERS',
  shop_address: 'Jeermangalam, Hosur, Tamil Nadu - 635109',
  shop_phone: '+91 94431 23456',
  gst_no: '33ACSPV5299F1Z5',
  receipt_footer: 'Thank you for choosing VNA Traders! Wishing you a bright and safe celebration.',
  device_code: 'A',
  paper_size: '80mm',
  auto_print: true,
  print_margin_offset: 0,
};

export const DEFAULT_BRANDS: Brand[] = [
  {
    id: '11111111-2222-3333-4444-555555550001',
    name: 'Standard',
    has_discount: false,
    discount_percent: 0,
    max_discount: 0,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: '11111111-2222-3333-4444-555555550002',
    name: 'General',
    has_discount: false,
    discount_percent: 0,
    max_discount: 0,
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

export const DEFAULT_CATEGORIES: string[] = [
  'Sparklers',
  'Ground Chakkars',
  'Flower Pots',
  'Rockets',
  'Bombs & Sound Crackers',
  'Bijili Crackers',
  'Single & Multi Shots',
  'Fancy Sky Shots',
  'Fancy Novelties',
  'Twinkling Stars',
  'Fountains & Cones',
  'Garlands (Wala Crackers)',
  'Roll Caps & Ring Caps',
  'Gift Boxes',
  'Party Poppers',
  'Kids Special Crackers',
];

export const INITIAL_PRODUCTS: Product[] = [];

export class CrackersBillingDB extends Dexie {
  brands!: Table<Brand, string>;
  categories!: Table<Category, string>;
  products!: Table<Product, string>;
  bills!: Table<Bill, string>;
  bill_items!: Table<BillItem, string>;
  outbox!: Table<OutboxItem, string>;
  settings!: Table<{ key: string; value: any }, string>;
  sync_meta!: Table<SyncMeta, string>;
  device_sequence!: Table<DeviceSequence, string>;
  profiles!: Table<Profile, string>;
  activity_logs!: Table<ActivityLog, number>;
  clients!: Table<Client, string>;
  stock_movements!: Table<StockMovement, string>;
  purchase_orders!: Table<PurchaseOrder, string>;
  purchase_order_items!: Table<PurchaseOrderItem, string>;
  sale_orders!: Table<SaleOrder, string>;
  sale_order_items!: Table<SaleOrderItem, string>;
  invoices!: Table<Invoice, string>;
  invoice_items!: Table<InvoiceItem, string>;
  quotations!: Table<Quotation, string>;
  quotation_items!: Table<QuotationItem, string>;
  transport_entries!: Table<TransportEntry, string>;
  companies!: Table<Company, string>;

  constructor() {
    super('CrackersBillingDB');

    this.version(1).stores({
      products: 'id, code, name, category, is_active, updated_at',
      bills: 'id, bill_no, customer_name, customer_phone, created_by, created_at, updated_at, sync_status',
      bill_items: 'id, bill_id, product_id',
      outbox: 'id, entity, op, status, attempts, created_at',
      settings: 'key',
      sync_meta: 'table_name',
      device_sequence: 'date_device',
      profiles: 'id, role, is_active, email',
      activity_logs: '++id, created_at, action, entity, entity_id',
    });

    this.version(2).stores({
      profiles: 'id, role, is_active, email',
    });

    this.version(3).stores({
      brands: 'id, name, is_active, created_at',
      products: 'id, code, name, category, brand, is_active, updated_at',
    });

    this.version(4).stores({
      categories: 'id, name, is_active, created_at',
    });

    this.version(5).stores({
      clients: 'id, name, type, phone, gstin, is_active, updated_at',
      stock_movements: 'id, product_id, product_code, type, created_at',
      purchase_orders: 'id, po_no, supplier_id, status, order_date, created_at',
      purchase_order_items: 'id, po_id, product_id',
      sale_orders: 'id, so_no, client_id, status, order_date, delivery_due_date, created_at',
      sale_order_items: 'id, so_id, product_id',
      invoices: 'id, invoice_no, client_id, so_id, payment_status, invoice_date, created_at',
      invoice_items: 'id, invoice_id, product_id',
    });

    this.version(6).stores({
      quotations: 'id, quotation_no, client_id, status, quotation_date, valid_until, created_at',
      quotation_items: 'id, quotation_id, product_id',
    });

    this.version(7).stores({
      transport_entries: 'id, lr_no, transport_name, status, dispatch_date, destination, so_id, client_id, created_at',
    });

    this.version(8).stores({
      companies: 'id, name, gstin, is_default, is_active, created_at',
      products: 'id, code, name, category, brand, company_id, is_active, updated_at',
      bills: 'id, bill_no, customer_name, customer_phone, company_id, created_by, created_at, updated_at, sync_status',
      clients: 'id, name, type, phone, gstin, company_id, is_active, updated_at',
      purchase_orders: 'id, po_no, supplier_id, status, company_id, order_date, created_at',
      sale_orders: 'id, so_no, client_id, status, company_id, order_date, delivery_due_date, created_at',
      invoices: 'id, invoice_no, client_id, so_id, company_id, payment_status, invoice_date, created_at',
      quotations: 'id, quotation_no, client_id, status, company_id, quotation_date, valid_until, created_at',
      transport_entries: 'id, lr_no, transport_name, status, company_id, dispatch_date, destination, so_id, client_id, created_at',
      stock_movements: 'id, product_id, product_code, company_id, type, created_at',
    });
  }
}

export const db = new CrackersBillingDB();

/**
 * Initializes local database with default settings and default brands
 */
export async function initLocalDatabase(): Promise<void> {
  // Check settings
  const currentSettings = await db.settings.get('shop_settings');
  if (
    !currentSettings ||
    currentSettings.value?.shop_name === 'Sri Murugan Crackers' ||
    currentSettings.value?.shop_name === 'VNA Crackers' ||
    currentSettings.value?.shop_name === 'VNA CRACKERS' ||
    currentSettings.value?.shop_address?.includes('Sivakasi') ||
    currentSettings.value?.gst_no === '33VNACK0000A1Z5'
  ) {
    await db.settings.put({ key: 'shop_settings', value: DEFAULT_SETTINGS });
  }

  // Ensure default companies exist (VNA TRADERS primary + SRI BALAJI FIREWORKS secondary)
  try {
    const compCount = await db.companies.count();
    if (compCount === 0) {
      const now = new Date().toISOString();
      await db.companies.bulkPut([
        DEFAULT_COMPANY,
        {
          id: 'c2222222-2222-2222-2222-222222220002',
          name: 'SRI BALAJI FIREWORKS',
          trade_name: 'Sri Balaji Crackers & Fancy Novelties',
          gstin: '33AABCS1234F1Z9',
          phone: '+91 98421 98765',
          email: 'sribalajifireworks.hosur@gmail.com',
          address: '45, Denkanikottai Road, Shanthi Nagar',
          city: 'Hosur',
          state: 'Tamil Nadu',
          state_code: '33',
          pincode: '635109',
          bank_name: 'HDFC Bank',
          bank_account_no: '50200012345678',
          bank_ifsc: 'HDFC0000456',
          bank_branch: 'Hosur SIPCOT Branch',
          upi_id: 'sribalajicrackers@hdfcbank',
          receipt_footer: 'Thank you for shopping at Sri Balaji Fireworks! Light up your life with happiness.',
          is_default: false,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ]);
    }
  } catch (compErr) {
    console.warn('Companies initialization notice:', compErr);
  }

  // Ensure default brands (Standard, General) exist and Standard has its default discount
  const existingBrands = await db.brands.toArray();
  if (existingBrands.length === 0) {
    await db.brands.bulkPut(DEFAULT_BRANDS);
  } else {
    // Ensure 'Standard' brand exists (preserve any Admin-configured discount)
    const standardBrand = existingBrands.find((b) => b.name.trim().toLowerCase() === 'standard');
    if (!standardBrand) {
      await db.brands.put(DEFAULT_BRANDS[0]);
    }

    // Ensure 'General' brand exists
    const generalBrand = existingBrands.find((b) => b.name.trim().toLowerCase() === 'general');
    if (!generalBrand) {
      await db.brands.put(DEFAULT_BRANDS[1]);
    }
  }

  // Ensure default cracker categories exist
  const catCount = await db.categories.count();
  if (catCount === 0) {
    const catsToInsert: Category[] = DEFAULT_CATEGORIES.map((name, idx) => ({
      id: `cat-${idx + 1}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name,
      is_active: true,
      created_at: new Date().toISOString(),
    }));
    await db.categories.bulkPut(catsToInsert);
  }

  // Ensure default clients exist for VNA Traders (Wholesale Dealer, Retail Buyer, Sivakasi Factory)
  const clientCount = await db.clients.count();
  if (clientCount === 0) {
    const now = new Date().toISOString();
    await db.clients.bulkPut([
      {
        id: 'a1111111-1111-1111-1111-111111111001',
        name: 'Rajesh Kumar',
        company_name: 'Sri Venkateshwara Crackers Wholesale',
        type: 'customer',
        customer_tier: 'wholesale',
        phone: '9842154321',
        email: 'venkateshwaracrackers@gmail.com',
        gstin: '29AAACV1234F1Z2',
        address: 'Shop No. 4, APMC Yard, Yeshwanthpur',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560022',
        credit_limit: 500000,
        outstanding_balance: 145000,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'a1111111-1111-1111-1111-111111111002',
        name: 'Murugan M.',
        company_name: 'Murugan Agencies',
        type: 'customer',
        customer_tier: 'retail',
        phone: '9443198765',
        email: 'murugan.hosur@gmail.com',
        gstin: '33AALCM9876D1Z1',
        address: '12, Bagalur Road, Near Bus Stand',
        city: 'Hosur',
        state: 'Tamil Nadu',
        pincode: '635109',
        credit_limit: 100000,
        outstanding_balance: 0,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'a1111111-1111-1111-1111-111111111003',
        name: 'K. Senthil Nathan',
        company_name: 'Standard Fireworks Industries Ltd',
        type: 'supplier',
        customer_tier: 'wholesale',
        phone: '9442111222',
        email: 'orders@standardfireworks.com',
        gstin: '33AAACS5555M1Z8',
        address: '1/28, Sivakasi Main Road, Thiruthangal',
        city: 'Sivakasi',
        state: 'Tamil Nadu',
        pincode: '626123',
        credit_limit: 2000000,
        outstanding_balance: 0,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  }

  // Ensure default dispatcher profile exists for warehouse dispatch testing
  try {
    const allProfs = await db.profiles.toArray();
    const hasDispatcher = allProfs.some((p) => p.role === 'dispatcher');
    if (!hasDispatcher) {
      await db.profiles.put({
        id: 'd1111111-1111-1111-1111-111111111001',
        full_name: 'Ramu (Dispatch In-Charge)',
        email: 'dispatcher@crackers.local',
        role: 'dispatcher',
        is_active: true,
        created_at: new Date().toISOString(),
      });
    }
  } catch (profErr) {
    console.warn('Dispatcher profile setup notice:', profErr);
  }

  // Self-healing: ensure all existing products have a valid brand (defaulting to 'Standard')
  try {
    const allProds = await db.products.toArray();
    const prodsToFix: Product[] = [];
    const catSet = new Set(DEFAULT_CATEGORIES.map((c) => c.toLowerCase()));

    for (const p of allProds) {
      const b = (p.brand || '').trim();
      // If brand is empty or erroneously set to a category name, default to Standard
      if (!b || catSet.has(b.toLowerCase())) {
        prodsToFix.push({
          ...p,
          brand: 'Standard',
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (prodsToFix.length > 0) {
      await db.products.bulkPut(prodsToFix);
    }
  } catch (err) {
    console.warn('Product brand migration notice:', err);
  }

  // Automatically remove any legacy pre-filled / demo products from previous sessions
  const legacyDemoProducts = await db.products
    .filter((p) => p.id.startsWith('11111111-') || p.id.startsWith('demo-'))
    .toArray();
  if (legacyDemoProducts.length > 0) {
    await db.products.bulkDelete(legacyDemoProducts.map((p) => p.id));
  }

  // Ensure default products exist if catalog is empty, including out-of-stock and low-stock items for alert verification
  try {
    const prodCount = await db.products.count();
    const now = new Date().toISOString();
    if (prodCount === 0) {
      await db.products.bulkPut([
        {
          id: 'b1111111-1111-1111-1111-111111111001',
          code: 'SPK-10',
          name: '10 cm Electric Sparklers',
          category: 'Sparklers',
          brand: 'Standard',
          unit: 'box',
          price: 45,
          wholesale_price: 38,
          stock: 0, // OUT OF STOCK
          min_stock: 20,
          company_id: DEFAULT_COMPANY_ID,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'b1111111-1111-1111-1111-111111111002',
          code: 'CHK-28',
          name: '28 Giant Deluxe Chakkars',
          category: 'Chakkars',
          brand: 'Standard',
          unit: 'box',
          price: 180,
          wholesale_price: 150,
          stock: 5, // LOW STOCK
          min_stock: 20,
          company_id: DEFAULT_COMPANY_ID,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'b1111111-1111-1111-1111-111111111003',
          code: 'FP-SPL',
          name: 'Flower Pots Special (10 Pcs)',
          category: 'Flower Pots',
          brand: 'General',
          unit: 'box',
          price: 240,
          wholesale_price: 200,
          stock: 8, // LOW STOCK
          min_stock: 20,
          company_id: DEFAULT_COMPANY_ID,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'b1111111-1111-1111-1111-111111111004',
          code: '1000-W',
          name: '1000 Wala Festive Garland',
          category: 'Garlands & Crackers',
          brand: 'Standard',
          unit: 'box',
          price: 850,
          wholesale_price: 720,
          stock: 150, // Healthy stock
          min_stock: 20,
          company_id: DEFAULT_COMPANY_ID,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'b1111111-1111-1111-1111-111111111005',
          code: '50-SHT',
          name: '50 Multi-Color Sky Shots',
          category: 'Aerial Fireworks',
          brand: 'Standard',
          unit: 'box',
          price: 1450,
          wholesale_price: 1200,
          stock: 65, // Healthy stock
          min_stock: 20,
          company_id: DEFAULT_COMPANY_ID,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ]);
    } else {
      // Ensure there are out-of-stock and low-stock items so stock alerts are functional
      const allProds = await db.products.toArray();
      const hasZeroOrLow = allProds.some((p) => (p.stock ?? 0) <= (p.min_stock ?? 20));
      if (!hasZeroOrLow && allProds.length > 0) {
        if (allProds[0]) {
          await db.products.update(allProds[0].id, { stock: 0, min_stock: 20, updated_at: now });
        }
        if (allProds[1]) {
          await db.products.update(allProds[1].id, { stock: 5, min_stock: 20, updated_at: now });
        }
      }
    }
  } catch (prodErr) {
    console.warn('Product stock initialization notice:', prodErr);
  }

  // Self-healing: consolidate any duplicated bill items in Dexie
  await cleanupDuplicateBillItemsInDb();

  // Ensure default sample Sale Orders exist if table is empty (for live testing of stock alerts)
  try {
    const soCount = await db.sale_orders.count();
    if (soCount === 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const so1Id = 'f1111111-1111-1111-1111-111111111001';
      const so2Id = 'f1111111-1111-1111-1111-111111111002';

      await db.sale_orders.bulkPut([
        {
          id: so1Id,
          so_no: 'SO-2026-0001',
          company_id: DEFAULT_COMPANY_ID,
          client_id: 'a1111111-1111-1111-1111-111111111001',
          customer_name: 'Sri Balaji Fireworks Wholesale',
          customer_phone: '9842154321',
          customer_address: 'Bangalore Road, Hosur',
          customer_gstin: '29AAACV1234F1Z2',
          pricing_type: 'wholesale',
          order_date: todayStr,
          delivery_due_date: todayStr,
          status: 'pending',
          subtotal: 1900,
          discount_amount: 0,
          total_amount: 1900,
          payment_status: 'unpaid',
          paid_amount: 0,
          transport_name: 'VRL Logistics',
          destination: 'Bengaluru APMC',
          notes: 'Urgent festive supply - dispatch priority',
          created_by: 'Staff',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: so2Id,
          so_no: 'SO-2026-0002',
          company_id: DEFAULT_COMPANY_ID,
          client_id: 'a1111111-1111-1111-1111-111111111002',
          customer_name: 'Murugan Agencies Retail',
          customer_phone: '9443198765',
          customer_address: 'Bagalur Road, Hosur',
          customer_gstin: '33AALCM9876D1Z1',
          pricing_type: 'wholesale',
          order_date: todayStr,
          delivery_due_date: todayStr,
          status: 'pending',
          subtotal: 3000,
          discount_amount: 0,
          total_amount: 3000,
          payment_status: 'unpaid',
          paid_amount: 0,
          transport_name: 'ABT Parcel Service',
          destination: 'Salem',
          notes: 'Standard retail package dispatch',
          created_by: 'Staff',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      await db.sale_order_items.bulkPut([
        {
          id: generateUUID(),
          so_id: so1Id,
          product_id: 'b1111111-1111-1111-1111-111111111001', // SPK-10 (0 Stock)
          product_code: 'SPK-10',
          product_name: '10 cm Electric Sparklers',
          brand: 'Standard',
          unit: 'box',
          qty: 50,
          unit_price: 38,
          line_total: 1900,
        },
        {
          id: generateUUID(),
          so_id: so2Id,
          product_id: 'b1111111-1111-1111-1111-111111111002', // CHK-28 (5 Stock, ordered 20)
          product_code: 'CHK-28',
          product_name: '28 Giant Deluxe Chakkars',
          brand: 'Standard',
          unit: 'box',
          qty: 20,
          unit_price: 150,
          line_total: 3000,
        },
      ]);
    } else {
      // Ensure SO-2026-0002 has status 'pending' if it was previously seeded as 'confirmed'
      const existingSo2 = await db.sale_orders.get('f1111111-1111-1111-1111-111111111002');
      if (existingSo2 && existingSo2.status === 'confirmed') {
        await db.sale_orders.update('f1111111-1111-1111-1111-111111111002', { status: 'pending' });
      }
    }
  } catch (soInitErr) {
    console.warn('Sale orders initialization notice:', soInitErr);
  }

  // Ensure default transportation history exists if empty
  try {
    const transportCount = await db.transport_entries.count();
    if (transportCount === 0) {
      const existingSos = await db.sale_orders.toArray();
      const initialTransports: TransportEntry[] = [];

      for (const so of existingSos) {
        if (so.lr_number || so.transport_name || so.status === 'dispatched' || so.status === 'delivered') {
          const items = await db.sale_order_items.where('so_id').equals(so.id).toArray();
          const totalBoxes = items.reduce((sum, it) => sum + (it.qty || 0), 0) || 20;
          initialTransports.push({
            id: generateUUID(),
            lr_no: so.lr_number || `VRL-${so.so_no.slice(-4)}`,
            transport_name: so.transport_name || 'VRL Logistics',
            vehicle_no: so.vehicle_number || 'TN 70 AB 1234',
            driver_name: 'Murugan (Lorry Driver)',
            driver_phone: so.driver_phone || '94431 23456',
            dispatch_date: so.dispatched_at ? so.dispatched_at.slice(0, 10) : so.order_date,
            estimated_delivery_date: so.delivery_due_date,
            actual_delivery_date: so.status === 'delivered' ? so.delivered_at || so.delivery_due_date : undefined,
            destination: so.destination || 'Bengaluru APMC',
            source_location: 'Hosur Godown (Jeermangalam)',
            so_id: so.id,
            so_no: so.so_no,
            client_id: so.client_id,
            consignee_name: so.customer_name,
            consignee_phone: so.customer_phone,
            consignee_address: so.customer_address,
            consignee_gstin: so.customer_gstin,
            total_boxes: totalBoxes,
            total_weight_kg: Math.round(totalBoxes * 8.5),
            consignment_value: so.total_amount,
            items_summary: items.map((i) => `${i.product_name} (${i.qty})`).slice(0, 3).join(', '),
            freight_type: 'to_pay',
            freight_amount: Math.round(totalBoxes * 65),
            loading_charges: Math.round(totalBoxes * 10),
            total_charges: Math.round(totalBoxes * 75),
            status: so.status === 'delivered' ? 'delivered' : 'in_transit',
            delivery_remarks: so.status === 'delivered' ? 'Consignment received in good condition' : undefined,
            dispatched_by: so.dispatched_by || 'Ramu (Dispatch In-Charge)',
            created_by: so.created_by,
            created_at: so.created_at,
            updated_at: so.updated_at,
          });
        }
      }

      if (initialTransports.length === 0) {
        const d1 = new Date(Date.now() - 86400000 * 3).toISOString();
        const d2 = new Date(Date.now() - 86400000 * 2).toISOString();
        const d3 = new Date(Date.now() - 86400000).toISOString();
        const d4 = new Date().toISOString();

        initialTransports.push(
          {
            id: generateUUID(),
            lr_no: 'VRL-89421',
            transport_name: 'VRL Logistics',
            vehicle_no: 'KA 01 AJ 5542',
            driver_name: 'K. Senthil',
            driver_phone: '98421 88765',
            dispatch_date: d1.slice(0, 10),
            estimated_delivery_date: d2.slice(0, 10),
            actual_delivery_date: d2.slice(0, 10),
            destination: 'Bengaluru (Yeshwanthpur APMC)',
            source_location: 'Hosur Central Godown',
            consignee_name: 'Sri Venkateshwara Crackers Wholesale',
            consignee_phone: '98421 54321',
            consignee_address: 'Shop 4, APMC Yard, Yeshwanthpur, Bengaluru',
            consignee_gstin: '29AAACV1234F1Z2',
            total_boxes: 85,
            total_weight_kg: 720,
            consignment_value: 145000,
            items_summary: 'Deluxe Sparklers, Flower Pots, Ground Chakkars',
            freight_type: 'to_pay',
            freight_amount: 5500,
            loading_charges: 850,
            total_charges: 6350,
            status: 'delivered',
            delivery_remarks: 'Delivered at APMC Godown No. 4, signed by Rajesh Kumar',
            dispatched_by: 'Ramu (Dispatch In-Charge)',
            created_by: 'Manager',
            created_at: d1,
            updated_at: d2,
          },
          {
            id: generateUUID(),
            lr_no: 'ARC-49210',
            transport_name: 'ARC (Associated Road Carriers)',
            vehicle_no: 'TN 28 AK 9912',
            driver_name: 'R. Velu',
            driver_phone: '94432 11234',
            dispatch_date: d2.slice(0, 10),
            estimated_delivery_date: d3.slice(0, 10),
            actual_delivery_date: d3.slice(0, 10),
            destination: 'Coimbatore (Cross Cut Road)',
            source_location: 'Jeermangalam Hub',
            consignee_name: 'Kovai Cracker Palace',
            consignee_phone: '94435 66789',
            consignee_address: '142 Cross Cut Road, Gandhipuram, Coimbatore',
            consignee_gstin: '33AAACK4455B1Z9',
            total_boxes: 120,
            total_weight_kg: 1050,
            consignment_value: 230000,
            items_summary: 'Fancy Sky Blitz, 50 Shots Cakes, Multi Color Pots',
            freight_type: 'paid',
            freight_amount: 8200,
            loading_charges: 1200,
            total_charges: 9400,
            status: 'delivered',
            delivery_remarks: 'Lorry arrived safely at Coimbatore booking office',
            dispatched_by: 'Ramu (Dispatch In-Charge)',
            created_by: 'Staff',
            created_at: d2,
            updated_at: d3,
          },
          {
            id: generateUUID(),
            lr_no: 'SRS-33912',
            transport_name: 'SRS Logistics',
            vehicle_no: 'KA 05 D 7719',
            driver_name: 'M. Anand',
            driver_phone: '99001 54321',
            dispatch_date: d3.slice(0, 10),
            estimated_delivery_date: d4.slice(0, 10),
            destination: 'Salem (Seelanaickenpatti)',
            source_location: 'Jeermangalam Hub',
            consignee_name: 'Murugan Agencies',
            consignee_phone: '94431 98765',
            consignee_address: '12-A Bazaar Street, Shevapet, Salem',
            consignee_gstin: '33AABCM9988E1Z1',
            total_boxes: 70,
            total_weight_kg: 610,
            consignment_value: 115000,
            items_summary: '28 Chorsa, Bijili Crackers, Flower Pots Special',
            freight_type: 'to_pay',
            freight_amount: 4500,
            loading_charges: 700,
            total_charges: 5200,
            status: 'in_transit',
            dispatched_by: 'Ramu (Dispatch In-Charge)',
            created_by: 'Staff',
            created_at: d3,
            updated_at: d3,
          },
          {
            id: generateUUID(),
            lr_no: 'ABT-77142',
            transport_name: 'ABT Parcel Service',
            vehicle_no: 'TN 70 M 3410',
            driver_name: 'G. Kannan',
            driver_phone: '97890 22345',
            dispatch_date: d4.slice(0, 10),
            estimated_delivery_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            destination: 'Chennai (Koyambedu Wholesale Market)',
            source_location: 'Hosur Central Godown',
            consignee_name: 'Chennai Diwali Bazaars Ltd',
            consignee_phone: '98410 44556',
            consignee_address: 'B-Block Wholesale Complex, Koyambedu, Chennai',
            consignee_gstin: '33AABCC7788D1Z4',
            total_boxes: 95,
            total_weight_kg: 840,
            consignment_value: 185000,
            items_summary: 'Bijili Crackers, 1000 Wala, Fancy Sky Blitz',
            freight_type: 'to_pay',
            freight_amount: 6800,
            loading_charges: 950,
            total_charges: 7750,
            status: 'in_transit',
            dispatched_by: 'Ramu (Dispatch In-Charge)',
            created_by: 'Admin',
            created_at: d4,
            updated_at: d4,
          }
        );
      }

      await db.transport_entries.bulkPut(initialTransports);
    }
  } catch (transErr) {
    console.warn('Transport entries initialization notice:', transErr);
  }
}

/**
 * Self-healing routine: detects and fixes any existing bills in Dexie that accumulated duplicate items
 * from previous edits or sync anomalies.
 */
export async function cleanupDuplicateBillItemsInDb(): Promise<void> {
  try {
    const allBillItems = await db.bill_items.toArray();
    if (!allBillItems || allBillItems.length === 0) return;

    // Group items by bill_id
    const billMap = new Map<string, BillItem[]>();
    for (const item of allBillItems) {
      if (!item.bill_id) continue;
      const list = billMap.get(item.bill_id) || [];
      list.push(item);
      billMap.set(item.bill_id, list);
    }

    for (const [billId, rawItems] of billMap.entries()) {
      const consolidated = consolidateBillItems(rawItems);
      if (consolidated.length < rawItems.length) {
        await db.transaction('rw', [db.bill_items, db.bills], async () => {
          await db.bill_items.where('bill_id').equals(billId).delete();
          await db.bill_items.bulkPut(consolidated);

          const bill = await db.bills.get(billId);
          if (bill) {
            const calculatedTotals = calculateBillTotals(consolidated, 0, bill.brand_discounts);
            if (bill.subtotal > calculatedTotals.subtotal) {
              const discount = bill.discount > 0
                ? Math.min(bill.discount, calculatedTotals.subtotal)
                : Math.max(0, calculatedTotals.subtotal - calculatedTotals.total);
              await db.bills.update(billId, {
                subtotal: calculatedTotals.subtotal,
                discount: Math.round(discount * 100) / 100,
                total: Math.max(0, Math.round((calculatedTotals.subtotal - discount) * 100) / 100),
              });
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn('Notice in cleanupDuplicateBillItemsInDb:', err);
  }
}

/**
 * Add a new cracker category locally and queue for cloud sync
 */
export async function addCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name cannot be empty');

  const existing = await db.categories.where('name').equalsIgnoreCase(trimmed).first();
  if (existing) {
    if (!existing.is_active) {
      await db.categories.update(existing.id, { is_active: true });
      existing.is_active = true;
    }
    return existing;
  }

  const newCat: Category = {
    id: `cat-${Date.now()}-${generateUUID().slice(0, 8)}`,
    name: trimmed,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const outboxItem: OutboxItem = {
    id: generateUUID(),
    entity: 'categories',
    op: 'insert',
    payload: newCat,
    status: 'pending',
    attempts: 0,
    created_at: newCat.created_at!,
  };

  await db.transaction('rw', [db.categories, db.outbox], async () => {
    await db.categories.put(newCat);
    await db.outbox.put(outboxItem);
  });

  return newCat;
}

/**
 * Delete a category locally and queue outbox for cloud sync.
 * Optionally reassign affected products to another category.
 */
export async function deleteCategory(
  categoryId: string,
  categoryName: string,
  reassignToCategory?: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', [db.categories, db.products, db.outbox], async () => {
    // 1. If reassignToCategory is provided, update affected products
    if (reassignToCategory && reassignToCategory.trim()) {
      const targetCat = reassignToCategory.trim();
      const affectedProducts = await db.products
        .filter((p) => (p.category || '').toLowerCase() === categoryName.toLowerCase())
        .toArray();

      for (const prod of affectedProducts) {
        const updatedProd: Product = {
          ...prod,
          category: targetCat,
          updated_at: now,
        };
        await db.products.put(updatedProd);
        await db.outbox.put({
          id: generateUUID(),
          entity: 'products',
          op: 'update',
          payload: updatedProd,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
      }
    }

    // 2. Delete the category from Dexie
    await db.categories.delete(categoryId);

    // 3. Queue outbox item for Supabase cloud sync
    const outboxItem: OutboxItem = {
      id: generateUUID(),
      entity: 'categories',
      op: 'delete',
      payload: { id: categoryId, name: categoryName, is_active: false },
      status: 'pending',
      attempts: 0,
      created_at: now,
    };
    await db.outbox.put(outboxItem);
  });
}

/**
 * Get shop settings from Dexie
 */
export async function getShopSettings(): Promise<ShopSettings> {
  const item = await db.settings.get('shop_settings');
  return item ? { ...DEFAULT_SETTINGS, ...item.value } : DEFAULT_SETTINGS;
}

/**
 * Save shop settings to Dexie
 */
export async function saveShopSettings(settings: Partial<ShopSettings>): Promise<ShopSettings> {
  const current = await getShopSettings();
  const updated = { ...current, ...settings };
  await db.settings.put({ key: 'shop_settings', value: updated });

  if (isConfigured && navigator.onLine) {
    try {
      await supabase.from('shop_settings').upsert(
        {
          key: 'shop_settings',
          shop_name: updated.shop_name,
          shop_address: updated.shop_address,
          shop_phone: updated.shop_phone,
          gst_no: updated.gst_no,
          receipt_footer: updated.receipt_footer,
          paper_size: updated.paper_size,
          auto_print: updated.auto_print ?? true,
          device_code: updated.device_code,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
    } catch (err) {
      console.warn('Could not sync shop settings to Supabase:', err);
    }
  }

  return updated;
}

/**
 * Atomic offline-safe bill number generator
 * Format: YYMMDD-<DEVICE>-<SEQ>, for example 261011-A-0007
 */
export async function generateNextBillNo(explicitDeviceCode?: string): Promise<string> {
  const settings = await getShopSettings();
  const device = explicitDeviceCode || settings.device_code || 'A';
  const dateStr = getISTYYMMDD();
  const key = `${dateStr}-${device.toUpperCase()}`;

  return await db.transaction('rw', db.device_sequence, async () => {
    const existing = await db.device_sequence.get(key);
    const nextSeq = (existing ? existing.current_seq : 0) + 1;
    await db.device_sequence.put({
      date_device: key,
      current_seq: nextSeq,
    });
    return formatBillNo(dateStr, device, nextSeq);
  });
}

/**
 * Automatically inspects the outbox and activity logs to recover any bills
 * that might have been lost or removed from db.bills by previous sync cycles.
 */
export async function restoreMissingBills(): Promise<number> {
  let restored = 0;
  try {
    const existingBills = await db.bills.toArray();
    const existingIds = new Set(existingBills.map((b) => b.id));
    const billsToRestore: Bill[] = [];
    const itemsToRestore: BillItem[] = [];

    // 1. Recover from outbox
    const billOutbox = await db.outbox.where('entity').equals('bills').toArray();
    for (const item of billOutbox) {
      const p = item.payload;
      if (p && p.id && !existingIds.has(p.id)) {
        const { items, ...billData } = p;
        billsToRestore.push(billData as Bill);
        existingIds.add(p.id);
        restored++;

        if (Array.isArray(items) && items.length > 0) {
          itemsToRestore.push(...items);
        }
      }
    }

    // 2. Recover from activity_logs
    const billLogs = await db.activity_logs.where('entity').equals('bills').toArray();
    for (const log of billLogs) {
      const b = (log as any).newData;
      if (b && b.id && !existingIds.has(b.id)) {
        billsToRestore.push(b as Bill);
        existingIds.add(b.id);
        restored++;
      }
    }

    if (billsToRestore.length > 0) {
      await db.bills.bulkPut(billsToRestore);
    }
    if (itemsToRestore.length > 0) {
      await db.bill_items.bulkPut(itemsToRestore);
    }
  } catch (err) {
    console.warn('Bill recovery note:', err);
  }
  return restored;
}

/**
 * Wipes all local bills, bill items, outbox queue, logs, and resets products & brands to pristine default state
 */
export async function resetAllLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.bills,
      db.bill_items,
      db.outbox,
      db.activity_logs,
      db.sync_meta,
      db.device_sequence,
      db.brands,
      db.categories,
      db.products,
    ],
    async () => {
      // Clear operational transaction data
      await db.bills.clear();
      await db.bill_items.clear();
      await db.outbox.clear();
      await db.activity_logs.clear();
      await db.sync_meta.clear();
      await db.device_sequence.clear();

      // Reset brands to clean defaults
      await db.brands.clear();
      await db.brands.bulkPut(DEFAULT_BRANDS);

      // Reset categories to clean defaults
      await db.categories.clear();
      const catsToInsert: Category[] = DEFAULT_CATEGORIES.map((name, idx) => ({
        id: `cat-${idx + 1}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name,
        is_active: true,
        created_at: new Date().toISOString(),
      }));
      await db.categories.bulkPut(catsToInsert);

      // Reset products to clean empty table
      await db.products.clear();
    }
  );
}

// Make accessible on window object for convenience
if (typeof window !== 'undefined') {
  (window as any).resetAllLocalData = resetAllLocalData;
}

/**
 * Record a stock movement in inventory ledger
 */
export async function recordStockMovement(
  movement: Omit<StockMovement, 'id' | 'created_at'>
): Promise<StockMovement> {
  const item: StockMovement = {
    id: generateUUID(),
    created_at: new Date().toISOString(),
    ...movement,
  };
  await db.stock_movements.add(item);
  return item;
}

/**
 * Adjust product stock to a specified quantity with audit trail
 */
export async function adjustProductStock(
  productId: string,
  newStock: number,
  reason: string = 'Inventory audit / manual adjustment',
  user: string = 'Admin'
): Promise<Product | null> {
  const prod = await db.products.get(productId);
  if (!prod) return null;

  const validStock = Math.max(0, Math.round(newStock));
  const prevStock = prod.stock || 0;
  const delta = validStock - prevStock;
  const now = new Date().toISOString();

  await db.transaction('rw', [db.products, db.stock_movements, db.outbox], async () => {
    await db.products.update(productId, {
      stock: validStock,
      updated_at: now,
    });

    await db.stock_movements.add({
      id: generateUUID(),
      product_id: prod.id,
      product_code: prod.code,
      product_name: prod.name,
      brand: prod.brand,
      company_id: prod.company_id || DEFAULT_COMPANY_ID,
      type: delta >= 0 ? 'adjustment' : 'damage',
      qty: delta,
      prev_stock: prevStock,
      new_stock: validStock,
      reference_no: 'AUDIT',
      reason: reason,
      created_by: user,
      created_at: now,
    });

    await db.outbox.add({
      id: generateUUID(),
      entity: 'products',
      op: 'update',
      payload: { ...prod, stock: validStock, updated_at: now },
      status: 'pending',
      attempts: 0,
      created_at: now,
    });
  });

  return { ...prod, stock: validStock, updated_at: now };
}

/**
 * Apply stock increase or decrease (e.g. from Sales, PO receiving, Returns)
 */
export async function applyStockChange(
  productId: string,
  deltaQty: number, // positive for addition, negative for deduction
  type: StockMovement['type'],
  referenceNo: string = '',
  reason: string = '',
  user: string = 'System'
): Promise<number> {
  const prod = await db.products.get(productId);
  if (!prod) return 0;

  const prevStock = prod.stock || 0;
  const newStock = Math.max(0, prevStock + deltaQty);
  const now = new Date().toISOString();

  await db.transaction('rw', [db.products, db.stock_movements, db.outbox], async () => {
    await db.products.update(productId, {
      stock: newStock,
      updated_at: now,
    });

    const mvRecord: StockMovement = {
      id: generateUUID(),
      product_id: prod.id,
      product_code: prod.code,
      product_name: prod.name,
      brand: prod.brand,
      type: type,
      qty: deltaQty,
      prev_stock: prevStock,
      new_stock: newStock,
      reference_no: referenceNo,
      reason: reason || `${type} operation`,
      created_by: user,
      created_at: now,
    };

    await db.stock_movements.add(mvRecord);

    await db.outbox.add({
      id: generateUUID(),
      entity: 'stock_movements',
      op: 'insert',
      payload: mvRecord,
      status: 'pending',
      attempts: 0,
      created_at: now,
    });

    await db.outbox.add({
      id: generateUUID(),
      entity: 'products',
      op: 'update',
      payload: { ...prod, stock: newStock, updated_at: now },
      status: 'pending',
      attempts: 0,
      created_at: now,
    });
  });

  return newStock;
}

/**
 * Generates next sequential Purchase Order Number (e.g. PO-261116-0001)
 */
export async function generateNextPoNo(): Promise<string> {
  const dateStr = getISTYYMMDD();
  const count = await db.purchase_orders.count();
  return formatPoNo(dateStr, count + 1);
}

/**
 * Generates next sequential Sale Order Number (e.g. SO-261116-0001)
 */
export async function generateNextSoNo(): Promise<string> {
  const dateStr = getISTYYMMDD();
  const count = await db.sale_orders.count();
  return formatSoNo(dateStr, count + 1);
}

/**
 * Generates next sequential Tax Invoice Number (e.g. INV-2611-0001)
 */
export async function generateNextInvoiceNo(): Promise<string> {
  const dateStr = getISTYYMMDD().slice(0, 4); // YYMM
  const count = await db.invoices.count();
  return formatInvoiceNo(dateStr, count + 1);
}

/**
 * Generates next sequential Quotation Number (e.g. QT-261117-0001)
 */
export async function generateNextQuotationNo(): Promise<string> {
  const dateStr = getISTYYMMDD();
  const count = await db.quotations.count();
  return formatQuotationNo(dateStr, count + 1);
}

/**
 * Generates next sequential Lorry Receipt / Bilty Number (e.g. LR-2611-0001)
 */
export async function generateNextLrNo(carrierPrefix: string = 'LR'): Promise<string> {
  const dateStr = getISTYYMMDD().slice(0, 4); // YYMM
  const count = await db.transport_entries.count();
  const seq = (count + 1).toString().padStart(4, '0');
  return `${carrierPrefix}-${dateStr}-${seq}`;
}
