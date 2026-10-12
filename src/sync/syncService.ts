import { db } from '@/db';
import { supabase, isConfigured } from '@/lib/supabase';
import { OutboxItem, Product, Brand, Category, BillItem, Profile } from '@/types';
import { createProductSearchIndex } from '@/db/search';

export type SyncStatusState = 'online' | 'offline' | 'syncing' | 'error';

class SyncService {
  private isProcessing = false;
  private intervalTimer: number | null = null;
  private listeners = new Set<(status: { state: SyncStatusState; pendingCount: number; lastError?: string }) => void>();
  private currentStatus: { state: SyncStatusState; pendingCount: number; lastError?: string } = {
    state: navigator.onLine ? 'online' : 'offline',
    pendingCount: 0,
  };

  constructor() {
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
  }

  public init() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Initial state check
    this.updatePendingCount();

    // Trigger sync on start
    if (navigator.onLine) {
      this.triggerSync();
    }

    // Run interval every 30 seconds
    if (!this.intervalTimer) {
      this.intervalTimer = window.setInterval(() => {
        if (navigator.onLine) {
          this.triggerSync();
        }
      }, 30000);
    }
  }

  public destroy() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public subscribe(callback: (status: { state: SyncStatusState; pendingCount: number; lastError?: string }) => void) {
    this.listeners.add(callback);
    callback(this.currentStatus);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.currentStatus);
    }
  }

  private handleOnline() {
    this.currentStatus.state = 'online';
    this.notify();
    this.triggerSync();
  }

  private handleOffline() {
    this.currentStatus.state = 'offline';
    this.notify();
  }

  public async updatePendingCount() {
    const pending = await db.outbox.where('status').equals('pending').or('status').equals('failed').count();
    this.currentStatus.pendingCount = pending;
    if (!navigator.onLine) {
      this.currentStatus.state = 'offline';
    } else if (this.isProcessing) {
      this.currentStatus.state = 'syncing';
    } else if (this.currentStatus.lastError && pending > 0) {
      this.currentStatus.state = 'error';
    } else {
      this.currentStatus.state = 'online';
    }
    this.notify();
    return pending;
  }

  /**
   * Main sync trigger (push outbox + pull fresh products/bills)
   */
  public async triggerSync(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) return;
    this.isProcessing = true;
    this.currentStatus.state = 'syncing';
    this.notify();

    try {
      if (isConfigured) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await this.processOutbox();
          await this.pullUpdates();
        } else {
          // Without active Supabase session, items stay safely buffered in local IndexedDB outbox
          console.info('Supabase configured; outbox buffered until cloud login.');
        }
      } else {
        // In local demo mode with dummy credentials, simulate successful outbox processing
        await this.simulateLocalOutboxSync();
      }
      this.currentStatus.lastError = undefined;
    } catch (err: any) {
      console.warn('Sync cycle encounter:', err?.message || err);
      this.currentStatus.lastError = err?.message || 'Sync failed';
    } finally {
      this.isProcessing = false;
      await this.updatePendingCount();
    }
  }

  /**
   * Process pending outbox entries in FIFO order
   */
  public async processOutbox(): Promise<void> {
    const pendingItems = await db.outbox
      .where('status')
      .anyOf('pending', 'failed')
      .sortBy('created_at');

    for (const item of pendingItems) {
      // Exponential backoff check: delay = min(2^(attempts-1) * 2000, 60000)
      if (item.attempts > 0) {
        const delayMs = Math.min(Math.pow(2, item.attempts - 1) * 2000, 60000);
        const lastAttemptMs = new Date(item.created_at).getTime();
        if (Date.now() - lastAttemptMs < delayMs && item.status === 'failed') {
          continue; // Backoff not expired yet
        }
      }

      await db.outbox.update(item.id, { status: 'syncing' });

      try {
        await this.syncOutboxItem(item);
        await db.outbox.update(item.id, { status: 'done', last_error: null });

        // Update corresponding bill's sync_status in Dexie
        if (item.entity === 'bills') {
          await db.bills.update(item.payload.id, { sync_status: 'synced' });
        }
      } catch (err: any) {
        const errorMsg = err?.message || 'Unknown network error';
        await db.outbox.update(item.id, {
          status: 'failed',
          attempts: item.attempts + 1,
          last_error: errorMsg,
        });
        throw err;
      }
    }
  }

  /**
   * Sync single outbox record idempotently using upsert
   */
  private async syncOutboxItem(item: OutboxItem): Promise<void> {
    if (!isConfigured) return;

    if (item.entity === 'bills') {
      const { items, sync_status, ...rawBill } = item.payload;
      // Ensure created_by links to active cloud authenticated user if bill was drafted offline
      const { data: { user } } = await supabase.auth.getUser();
      let createdBy = rawBill.created_by;
      if (user && (!createdBy || createdBy.startsWith('00000000'))) {
        createdBy = user.id;
      }

      // Explicitly construct clean payload matching Supabase public.bills columns
      const cleanBillData: Record<string, any> = {
        id: rawBill.id,
        bill_no: rawBill.bill_no,
        customer_name: rawBill.customer_name || null,
        customer_phone: rawBill.customer_phone || null,
        subtotal: rawBill.subtotal,
        discount: rawBill.discount,
        total: rawBill.total,
        payment_mode: rawBill.payment_mode || 'cash',
        created_by: createdBy,
        created_at: rawBill.created_at,
        updated_at: rawBill.updated_at || rawBill.created_at,
      };

      if (rawBill.edited_at) {
        cleanBillData.edited_at = rawBill.edited_at;
      }
      if (rawBill.edited_by && !rawBill.edited_by.startsWith('00000000')) {
        cleanBillData.edited_by = rawBill.edited_by;
      }

      // 1. Upsert bill (without client-only sync_status field)
      const { error: billError } = await supabase.from('bills').upsert(cleanBillData, { onConflict: 'id' });
      if (billError) throw new Error(`Bill sync error: ${billError.message}`);

      // 2. If items are bundled, upsert bill items
      if (items && Array.isArray(items) && items.length > 0) {
        const sanitizedItems = items.map((it: any) => ({
          id: it.id,
          bill_id: it.bill_id,
          product_id: (it.product_id && !it.product_id.startsWith('11111111') && !it.product_id.startsWith('00000000')) ? it.product_id : null,
          product_name: it.product_name,
          qty: it.qty,
          unit_price: it.unit_price,
          line_total: it.line_total,
        }));
        const { error: itemsError } = await supabase.from('bill_items').upsert(sanitizedItems, { onConflict: 'id' });
        if (itemsError) throw new Error(`Bill items sync error: ${itemsError.message}`);
      }
    } else if (item.entity === 'bill_items') {
      const it = item.payload;
      const sanitized = {
        id: it.id,
        bill_id: it.bill_id,
        product_id: (it.product_id && !it.product_id.startsWith('11111111') && !it.product_id.startsWith('00000000')) ? it.product_id : null,
        product_name: it.product_name,
        qty: it.qty,
        unit_price: it.unit_price,
        line_total: it.line_total,
      };
      const { error } = await supabase.from('bill_items').upsert(sanitized, { onConflict: 'id' });
      if (error) throw new Error(`Bill item sync error: ${error.message}`);
    } else if (item.entity === 'products') {
      const { id, code, name, category, unit, price, stock, is_active } = item.payload;
      const { error } = await supabase.from('products').upsert({ id, code, name, category, unit, price, stock, is_active }, { onConflict: 'id' });
      if (error) throw new Error(`Product sync error: ${error.message}`);
    } else if (item.entity === 'brands') {
      const { id, name, is_active } = item.payload;
      try {
        await supabase.from('brands').upsert({ id, name, is_active }, { onConflict: 'id' });
      } catch (err: any) {
        console.warn('Brands table sync notice:', err?.message);
      }
    } else if (item.entity === 'categories') {
      const { id, name, is_active } = item.payload;
      try {
        await supabase.from('categories').upsert({ id, name, is_active }, { onConflict: 'id' });
      } catch (err: any) {
        console.warn('Categories table sync notice:', err?.message);
      }
    }
  }

  /**
   * In offline demo mode when no real backend is configured, mark pending items as done
   */
  private async simulateLocalOutboxSync(): Promise<void> {
    const pendingItems = await db.outbox
      .where('status')
      .anyOf('pending', 'failed')
      .toArray();

    for (const item of pendingItems) {
      await db.outbox.update(item.id, { status: 'done', last_error: null });
      if (item.entity === 'bills') {
        await db.bills.update(item.payload.id, { sync_status: 'synced' });
      }
    }
  }

  /**
   * Pull delta updates for products and bills from Supabase
   */
  public async pullUpdates(): Promise<void> {
    if (!isConfigured || !navigator.onLine) return;

    // 1. Pull Products
    const prodMeta = await db.sync_meta.get('products');
    let prodQuery = supabase.from('products').select('*');
    if (prodMeta?.last_synced_at) {
      prodQuery = prodQuery.gt('updated_at', prodMeta.last_synced_at);
    }
    const { data: serverProducts, error: prodErr } = await prodQuery;

    if (!prodErr && serverProducts && serverProducts.length > 0) {
      await db.products.bulkPut(serverProducts as Product[]);
      // Re-index search
      const allProds = await db.products.toArray();
      const allActive = allProds.filter((p) => p.is_active);
      createProductSearchIndex(allActive);

      const latestProdDate = serverProducts.reduce((max, p) => (p.updated_at > max ? p.updated_at : max), prodMeta?.last_synced_at || new Date().toISOString());
      await db.sync_meta.put({ table_name: 'products', last_synced_at: latestProdDate });
    }

    // 2. Pull Bills
    const billMeta = await db.sync_meta.get('bills');
    let billQuery = supabase.from('bills').select('*').order('created_at', { ascending: false }).limit(200);
    if (billMeta?.last_synced_at) {
      billQuery = billQuery.gt('updated_at', billMeta.last_synced_at);
    }
    const { data: serverBills, error: billErr } = await billQuery;

    if (!billErr && serverBills && serverBills.length > 0) {
      const mapped = serverBills.map((b: any) => ({ ...b, sync_status: 'synced' as const }));
      await db.bills.bulkPut(mapped);

      // Fetch items for newly pulled bills
      const billIds = serverBills.map((b) => b.id);
      const { data: serverItems } = await supabase.from('bill_items').select('*').in('bill_id', billIds);
      if (serverItems && serverItems.length > 0) {
        await db.bill_items.bulkPut(serverItems as BillItem[]);
      }

      const latestBillDate = serverBills.reduce((max, b) => (b.updated_at > max ? b.updated_at : max), billMeta?.last_synced_at || new Date().toISOString());
      await db.sync_meta.put({ table_name: 'bills', last_synced_at: latestBillDate });
    }

    // 3. Pull Profiles
    const { data: profiles } = await supabase.from('profiles').select('*');
    if (profiles && profiles.length > 0) {
      await db.profiles.bulkPut(profiles as Profile[]);
    }
  }

  /**
   * Clears cached products, brands, categories from local IndexedDB and pulls fresh data from Supabase
   */
  public async forceFreshPullFromSupabase(): Promise<{ success: boolean; message: string; count: number }> {
    if (!isConfigured) {
      throw new Error('Supabase is not configured. Please check cloud connection.');
    }
    if (!navigator.onLine) {
      throw new Error('You are currently offline. Check your internet connection.');
    }

    this.isProcessing = true;
    this.currentStatus.state = 'syncing';
    this.notify();

    try {
      // 1. Clear cached local products & sync metadata
      await db.transaction('rw', [db.products, db.sync_meta], async () => {
        await db.products.clear();
        await db.sync_meta.clear();
      });

      // 2. Fetch fresh products from Supabase
      const { data: serverProducts, error: prodErr } = await supabase.from('products').select('*');
      if (prodErr) throw new Error(`Products pull failed: ${prodErr.message}`);

      let productCount = 0;
      if (serverProducts && serverProducts.length > 0) {
        await db.products.bulkPut(serverProducts as Product[]);
        const activeProds = serverProducts.filter((p: any) => p.is_active);
        createProductSearchIndex(activeProds);
        productCount = serverProducts.length;
      }

      // 3. Fetch fresh brands from Supabase
      try {
        const { data: serverBrands } = await supabase.from('brands').select('*');
        if (serverBrands && serverBrands.length > 0) {
          await db.brands.bulkPut(serverBrands as Brand[]);
        }
      } catch (bErr) {
        console.warn('Brands fresh pull warning:', bErr);
      }

      // 4. Fetch fresh categories from Supabase
      try {
        const { data: serverCategories } = await supabase.from('categories').select('*');
        if (serverCategories && serverCategories.length > 0) {
          await db.categories.bulkPut(serverCategories as Category[]);
        }
      } catch (cErr) {
        console.warn('Categories fresh pull warning:', cErr);
      }

      // 5. Fetch fresh bills from Supabase
      try {
        const { data: serverBills } = await supabase
          .from('bills')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);

        if (serverBills && serverBills.length > 0) {
          const mapped = serverBills.map((b: any) => ({ ...b, sync_status: 'synced' as const }));
          await db.bills.bulkPut(mapped);

          const billIds = serverBills.map((b) => b.id);
          const { data: serverItems } = await supabase.from('bill_items').select('*').in('bill_id', billIds);
          if (serverItems && serverItems.length > 0) {
            await db.bill_items.bulkPut(serverItems as BillItem[]);
          }
        }
      } catch (billsErr) {
        console.warn('Bills fresh pull warning:', billsErr);
      }

      // 6. Fetch profiles from Supabase
      try {
        const { data: profiles } = await supabase.from('profiles').select('*');
        if (profiles && profiles.length > 0) {
          await db.profiles.bulkPut(profiles as Profile[]);
        }
      } catch (pErr) {
        console.warn('Profiles fresh pull warning:', pErr);
      }

      // Dispatch global window event so UI screens can immediately re-render with fresh data
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('supabase-data-refreshed'));
      }

      this.currentStatus.state = 'online';
      this.currentStatus.lastError = undefined;
      return {
        success: true,
        message: `Successfully cleared cache and pulled fresh data from Supabase!`,
        count: productCount,
      };
    } catch (err: any) {
      this.currentStatus.state = 'error';
      this.currentStatus.lastError = err?.message || 'Refresh failed';
      throw err;
    } finally {
      this.isProcessing = false;
      this.notify();
    }
  }
}

export const syncService = new SyncService();
