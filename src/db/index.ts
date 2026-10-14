import Dexie, { Table } from 'dexie';
import {
  Product,
  Brand,
  Category,
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
import { generateUUID } from '@/lib/uuid';
import { supabase, isConfigured } from '@/lib/supabase';

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
  { id: 'brand-standard', name: 'Standard', is_active: true, created_at: new Date().toISOString() },
  { id: 'brand-general', name: 'General', is_active: true, created_at: new Date().toISOString() },
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

  // Ensure default brands (Standard, General) exist
  const brandCount = await db.brands.count();
  if (brandCount === 0) {
    await db.brands.bulkPut(DEFAULT_BRANDS);
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

  // Automatically remove any legacy pre-filled / demo products from previous sessions
  const legacyDemoProducts = await db.products
    .filter((p) => p.id.startsWith('11111111-') || p.id.startsWith('demo-'))
    .toArray();
  if (legacyDemoProducts.length > 0) {
    await db.products.bulkDelete(legacyDemoProducts.map((p) => p.id));
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
