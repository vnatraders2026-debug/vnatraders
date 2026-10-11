import Dexie, { Table } from 'dexie';
import {
  Product,
  Bill,
  BillItem,
  OutboxItem,
  SyncMeta,
  ShopSettings,
  Profile,
  ActivityLog,
  DeviceSequence,
} from '@/types';
import { getISTYYMMDD, formatBillNo } from '@/lib/format';

export const DEFAULT_SETTINGS: ShopSettings = {
  shop_name: 'VNA Crackers',
  shop_address: '142 Kakkan Road, Sivakasi, Tamil Nadu - 626123',
  shop_phone: '+91 94431 23456',
  gst_no: '33VNACK0000A1Z5',
  receipt_footer: 'Thank you for choosing VNA Crackers! Wishing you a bright and safe celebration.',
  device_code: 'A',
  paper_size: '80mm',
};

export const INITIAL_PRODUCTS: Product[] = [
  { id: '11111111-1111-1111-1111-111111110001', code: 'SPK-01', name: '10 cm Electric Sparklers', category: 'Sparklers', unit: 'box', price: 45, stock: 250, is_active: true },
  { id: '11111111-1111-1111-1111-111111110002', code: 'SPK-02', name: '15 cm Colour Sparklers', category: 'Sparklers', unit: 'box', price: 75, stock: 180, is_active: true },
  { id: '11111111-1111-1111-1111-111111110003', code: 'SPK-03', name: '30 cm Green Sparklers', category: 'Sparklers', unit: 'box', price: 140, stock: 120, is_active: true },
  { id: '11111111-1111-1111-1111-111111110004', code: 'SPK-04', name: '50 cm Deluxe Sparklers', category: 'Sparklers', unit: 'box', price: 260, stock: 90, is_active: true },
  { id: '11111111-1111-1111-1111-111111110005', code: 'FLP-01', name: 'Flower Pots Small', category: 'Flower Pots', unit: 'box', price: 110, stock: 150, is_active: true },
  { id: '11111111-1111-1111-1111-111111110006', code: 'FLP-02', name: 'Flower Pots Special', category: 'Flower Pots', unit: 'box', price: 180, stock: 130, is_active: true },
  { id: '11111111-1111-1111-1111-111111110007', code: 'FLP-03', name: 'Flower Pots Asoka', category: 'Flower Pots', unit: 'box', price: 250, stock: 100, is_active: true },
  { id: '11111111-1111-1111-1111-111111110008', code: 'FLP-04', name: 'Colour Koti Pots', category: 'Flower Pots', unit: 'box', price: 320, stock: 75, is_active: true },
  { id: '11111111-1111-1111-1111-111111110009', code: 'CHK-01', name: 'Ground Chakkars Small', category: 'Ground Chakkars', unit: 'box', price: 85, stock: 200, is_active: true },
  { id: '11111111-1111-1111-1111-111111110010', code: 'CHK-02', name: 'Ground Chakkars Big', category: 'Ground Chakkars', unit: 'box', price: 140, stock: 160, is_active: true },
  { id: '11111111-1111-1111-1111-111111110011', code: 'CHK-03', name: 'Ground Chakkars Special Red', category: 'Ground Chakkars', unit: 'box', price: 195, stock: 110, is_active: true },
  { id: '11111111-1111-1111-1111-111111110012', code: 'CHK-04', name: 'Whistling Chakkars', category: 'Ground Chakkars', unit: 'box', price: 240, stock: 80, is_active: true },
  { id: '11111111-1111-1111-1111-111111110013', code: 'RCK-01', name: 'Baby Rockets', category: 'Rockets', unit: 'box', price: 120, stock: 140, is_active: true },
  { id: '11111111-1111-1111-1111-111111110014', code: 'RCK-02', name: 'Bombing Rockets', category: 'Rockets', unit: 'box', price: 190, stock: 100, is_active: true },
  { id: '11111111-1111-1111-1111-111111110015', code: 'RCK-03', name: 'Lunik Whistling Rockets', category: 'Rockets', unit: 'box', price: 280, stock: 60, is_active: true },
  { id: '11111111-1111-1111-1111-111111110016', code: 'BMB-01', name: 'Hydro Bombs 2 inch', category: 'Bombs', unit: 'box', price: 95, stock: 220, is_active: true },
  { id: '11111111-1111-1111-1111-111111110017', code: 'BMB-02', name: 'Classic King Bombs', category: 'Bombs', unit: 'box', price: 160, stock: 150, is_active: true },
  { id: '11111111-1111-1111-1111-111111110018', code: 'BMB-03', name: 'Digital Sound Bombs', category: 'Bombs', unit: 'box', price: 230, stock: 90, is_active: true },
  { id: '11111111-1111-1111-1111-111111110019', code: 'FNC-01', name: '12 Shots Multi Colour', category: 'Fancy Shots', unit: 'piece', price: 350, stock: 85, is_active: true },
  { id: '11111111-1111-1111-1111-111111110020', code: 'FNC-02', name: '30 Shots Sky Thunder', category: 'Fancy Shots', unit: 'piece', price: 780, stock: 50, is_active: true },
  { id: '11111111-1111-1111-1111-111111110021', code: 'FNC-03', name: '60 Shots Royal Display', category: 'Fancy Shots', unit: 'piece', price: 1550, stock: 30, is_active: true },
  { id: '11111111-1111-1111-1111-111111110022', code: 'FNC-04', name: '120 Shots Mega Fireworks', category: 'Fancy Shots', unit: 'piece', price: 2900, stock: 15, is_active: true },
  { id: '11111111-1111-1111-1111-111111110023', code: 'GFT-01', name: 'Standard Family Gift Box 21 Items', category: 'Gift Boxes', unit: 'box', price: 850, stock: 45, is_active: true },
  { id: '11111111-1111-1111-1111-111111110024', code: 'GFT-02', name: 'Deluxe Festive Box 35 Items', category: 'Gift Boxes', unit: 'box', price: 1650, stock: 35, is_active: true },
  { id: '11111111-1111-1111-1111-111111110025', code: 'GFT-03', name: 'Premium VIP Gift Box 52 Items', category: 'Gift Boxes', unit: 'box', price: 3200, stock: 20, is_active: true },
];

export class CrackersBillingDB extends Dexie {
  products!: Table<Product, string>;
  bills!: Table<Bill, string>;
  bill_items!: Table<BillItem, string>;
  outbox!: Table<OutboxItem, string>;
  settings!: Table<{ key: string; value: any }, string>;
  sync_meta!: Table<SyncMeta, string>;
  device_sequence!: Table<DeviceSequence, string>;
  profiles!: Table<Profile, string>;
  activity_logs!: Table<ActivityLog, number>;

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
  }
}

export const db = new CrackersBillingDB();

/**
 * Initializes local database with default settings, seed products, and fallback demo profiles
 */
export async function initLocalDatabase(): Promise<void> {
  // Check settings
  const currentSettings = await db.settings.get('shop_settings');
  if (!currentSettings || currentSettings.value?.shop_name === 'Sri Murugan Crackers') {
    await db.settings.put({ key: 'shop_settings', value: DEFAULT_SETTINGS });
  }

  // Seed default products if empty
  const count = await db.products.count();
  if (count === 0) {
    const now = new Date().toISOString();
    const seeded = INITIAL_PRODUCTS.map((p) => ({
      ...p,
      created_at: now,
      updated_at: now,
    }));
    await db.products.bulkPut(seeded);
  }

  // Guarantee demo admin and staff accounts exist
  const adminProf = await db.profiles.get('00000000-0000-0000-0000-000000000001');
  if (!adminProf) {
    await db.profiles.put({
      id: '00000000-0000-0000-0000-000000000001',
      full_name: 'Admin Manager',
      role: 'admin',
      is_active: true,
      email: 'admin@crackers.local',
    });
  }
  const staffProf = await db.profiles.get('00000000-0000-0000-0000-000000000002');
  if (!staffProf) {
    await db.profiles.put({
      id: '00000000-0000-0000-0000-000000000002',
      full_name: 'Staff Cashier',
      role: 'staff',
      is_active: true,
      email: 'staff@crackers.local',
    });
  }
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
