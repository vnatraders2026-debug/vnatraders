import { db } from '@/db';
import { supabase, isConfigured } from '@/lib/supabase';
import {
  OutboxItem,
  Product,
  Brand,
  Category,
  BillItem,
  Profile,
  Client,
  Quotation,
  QuotationItem,
  SaleOrder,
  SaleOrderItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Invoice,
  InvoiceItem,
  StockMovement,
  TransportEntry,
} from '@/types';
import { createProductSearchIndex } from '@/db/search';
import { generateUUID } from '@/lib/uuid';

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

    // Run interval every 15 seconds to sync bills across all devices in near real-time
    if (!this.intervalTimer) {
      this.intervalTimer = window.setInterval(() => {
        if (navigator.onLine) {
          this.triggerSync();
        }
      }, 15000);
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
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Auto-authenticate with terminal credentials if session is not active
          try {
            let { data: authData } = await supabase.auth.signInWithPassword({
              email: 'admin@vnatraders.com',
              password: 'Admin@12345',
            });
            if (!authData?.session) {
              const retry = await supabase.auth.signInWithPassword({
                email: 'admin@vnacrackers.com',
                password: 'Admin@12345',
              });
              authData = retry.data;
            }
            session = authData?.session || null;
          } catch (loginErr) {
            console.warn('Auto cloud authentication notice:', loginErr);
          }
        }

        // Reconcile un-queued local Dexie records first so nothing is left behind
        await this.reconcileLocalRecordsToOutbox();

        await this.processOutbox();
        await this.pullUpdates();
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
        console.warn(`Sync item notice (${item.entity} - ${item.id}):`, errorMsg);
        await db.outbox.update(item.id, {
          status: 'failed',
          attempts: item.attempts + 1,
          last_error: errorMsg,
        });
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
      // Ensure created_by links to active cloud authenticated user or null
      let createdBy = rawBill.created_by;
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        createdBy = user.id;
      } else if (createdBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdBy)) {
        // Keep valid UUID
      } else {
        createdBy = null;
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
        brand_discounts: rawBill.brand_discounts || {},
      };

      if (rawBill.edited_at) {
        cleanBillData.edited_at = rawBill.edited_at;
      }
      if (rawBill.edited_by) {
        cleanBillData.edited_by = user?.id || rawBill.edited_by;
      }

      // 1. Upsert bill (with unique bill_no collision protection)
      let { error: billError } = await supabase.from('bills').upsert(cleanBillData, { onConflict: 'id' });
      
      if (billError && billError.message?.includes('bills_bill_no_key')) {
        cleanBillData.bill_no = `${rawBill.bill_no}-${Date.now().toString().slice(-4)}`;
        await db.bills.update(rawBill.id, { bill_no: cleanBillData.bill_no });
        const retry = await supabase.from('bills').upsert(cleanBillData, { onConflict: 'id' });
        billError = retry.error;
      }

      if (billError) throw new Error(`Bill sync error: ${billError.message}`);

      // 2. If this is an update (edited bill), delete old items in Supabase first to prevent duplicates!
      if (item.op === 'update' || rawBill.edited_at) {
        const { error: delError } = await supabase.from('bill_items').delete().eq('bill_id', rawBill.id);
        if (delError) {
          console.warn('Notice deleting old bill_items for update in cloud:', delError.message);
        }
      }

      // 3. If items are bundled, upsert bill items
      if (items && Array.isArray(items) && items.length > 0) {
        const sanitizedItems = items.map((it: any) => ({
          id: it.id,
          bill_id: it.bill_id,
          product_id: (it.product_id && !it.product_id.startsWith('11111111') && !it.product_id.startsWith('00000000') && !it.product_id.startsWith('demo-')) ? it.product_id : null,
          product_name: it.product_name,
          brand: it.brand || 'General',
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
      const { id, code, name, brand, category, unit, price, wholesale_price, stock, is_active } = item.payload;
      const cleanProd: Record<string, any> = {
        code: (code || '').toUpperCase().trim(),
        name: (name || '').trim(),
        brand: (brand || 'Standard').trim(),
        category: (category || 'General').trim(),
        unit: unit || 'box',
        price: Math.max(0, Number(price) || 0),
        wholesale_price: Math.max(0, Number(wholesale_price) || 0),
        stock: Math.max(0, Number(stock) || 0),
        is_active: is_active ?? true,
        updated_at: new Date().toISOString(),
      };

      if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        cleanProd.id = id;
      }

      // Upsert by onConflict: code (business unique key)
      let { error } = await supabase.from('products').upsert(cleanProd, { onConflict: 'code' });

      // Fallback: update by code directly if onConflict had constraint mismatch
      if (error) {
        const { error: updateErr } = await supabase
          .from('products')
          .update(cleanProd)
          .eq('code', cleanProd.code);
        error = updateErr;
      }

      if (error) throw new Error(`Product sync error: ${error.message}`);
    } else if (item.entity === 'brands') {
      const { id, name, has_discount, discount_percent, max_discount, is_active } = item.payload;
      try {
        let validId = id;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(validId)) {
          const lowerName = (name || '').trim().toLowerCase();
          if (lowerName === 'standard') validId = '11111111-2222-3333-4444-555555550001';
          else if (lowerName === 'general') validId = '11111111-2222-3333-4444-555555550002';
          else validId = generateUUID();
        }

        if (item.op === 'delete') {
          const { error: delErr } = await supabase.from('brands').delete().eq('id', validId);
          if (delErr) {
            console.warn('Brands cloud delete notice:', delErr.message);
          }
        } else {
          await supabase.from('brands').upsert({
            id: validId,
            name,
            has_discount: has_discount ?? false,
            discount_percent: discount_percent ?? 0,
            max_discount: max_discount ?? 0,
            is_active,
          }, { onConflict: 'id' });
        }
      } catch (err: any) {
        console.warn('Brands table sync notice:', err?.message);
      }
    } else if (item.entity === 'categories') {
      const { id, name, is_active } = item.payload;
      try {
        if (item.op === 'delete') {
          const { error: delErr } = await supabase.from('categories').delete().eq('id', id);
          if (delErr) {
            console.warn('Categories cloud delete notice, falling back to inactive:', delErr?.message);
            await supabase.from('categories').update({ is_active: false }).eq('id', id);
          }
        } else {
          await supabase.from('categories').upsert({ id, name, is_active }, { onConflict: 'id' });
        }
      } catch (err: any) {
        console.warn('Categories table sync notice:', err?.message);
      }
    } else if (item.entity === 'clients') {
      const cl = item.payload;
      try {
        if (item.op === 'delete') {
          const { error: delErr } = await supabase.from('clients').delete().eq('id', cl.id);
          if (delErr) console.warn('Clients cloud delete notice:', delErr.message);
        } else {
          const cleanClient: Record<string, any> = {
            id: cl.id,
            name: (cl.name || '').trim(),
            company_name: cl.company_name?.trim() || null,
            type: cl.type || 'customer',
            customer_tier: cl.customer_tier || 'wholesale',
            phone: (cl.phone || '').trim(),
            email: cl.email?.trim() || null,
            gstin: cl.gstin?.trim()?.toUpperCase() || null,
            address: cl.address?.trim() || null,
            city: cl.city?.trim() || 'Hosur',
            state: cl.state?.trim() || 'Tamil Nadu',
            pincode: cl.pincode?.trim() || '635109',
            credit_limit: Math.max(0, Number(cl.credit_limit) || 0),
            outstanding_balance: Number(cl.outstanding_balance ?? cl.current_balance) || 0,
            notes: cl.notes?.trim() || null,
            is_active: cl.is_active ?? true,
            created_at: cl.created_at || new Date().toISOString(),
            updated_at: cl.updated_at || new Date().toISOString(),
          };
          const { error } = await supabase.from('clients').upsert(cleanClient, { onConflict: 'id' });
          if (error) throw new Error(`Client sync error: ${error.message}`);
        }
      } catch (err: any) {
        console.warn('Clients sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'quotations') {
      const q = item.payload;
      try {
        if (item.op === 'delete') {
          await supabase.from('quotation_items').delete().eq('quotation_id', q.id);
          const { error: delErr } = await supabase.from('quotations').delete().eq('id', q.id);
          if (delErr) console.warn('Quotation cloud delete notice:', delErr.message);
        } else {
          const cleanQuote: Record<string, any> = {
            id: q.id,
            quotation_no: q.quotation_no,
            client_id: (q.client_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.client_id)) ? q.client_id : null,
            customer_name: (q.customer_name || '').trim(),
            customer_phone: q.customer_phone?.trim() || null,
            customer_address: q.customer_address?.trim() || null,
            customer_gstin: q.customer_gstin?.trim()?.toUpperCase() || null,
            pricing_type: q.pricing_type || 'wholesale',
            quotation_date: q.quotation_date || new Date().toISOString().slice(0, 10),
            valid_until: q.valid_until || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
            status: q.status || 'draft',
            converted_to: q.converted_to || null,
            converted_id: q.converted_id || null,
            subtotal: Number(q.subtotal) || 0,
            discount_amount: Number(q.discount_amount) || 0,
            taxable_amount: Number(q.taxable_amount) || 0,
            gst_rate: Number(q.gst_rate) || 18,
            cgst: Number(q.cgst) || 0,
            sgst: Number(q.sgst) || 0,
            igst: Number(q.igst) || 0,
            round_off: Number(q.round_off) || 0,
            total_amount: Number(q.total_amount) || 0,
            terms_and_conditions: q.terms_and_conditions || null,
            notes: q.notes?.trim() || null,
            created_by: q.created_by || 'Staff',
            created_at: q.created_at || new Date().toISOString(),
            updated_at: q.updated_at || new Date().toISOString(),
          };

          const { error: quoteErr } = await supabase.from('quotations').upsert(cleanQuote, { onConflict: 'id' });
          if (quoteErr) throw new Error(`Quotation sync error: ${quoteErr.message}`);

          // Sync bundled quotation items if present
          if (q.items && Array.isArray(q.items) && q.items.length > 0) {
            await supabase.from('quotation_items').delete().eq('quotation_id', q.id);
            const cleanItems = q.items.map((it: any) => ({
              id: (it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.id)) ? it.id : generateUUID(),
              quotation_id: q.id,
              product_id: (it.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.product_id)) ? it.product_id : null,
              product_code: it.product_code || null,
              product_name: (it.product_name || '').trim(),
              brand: it.brand || 'Standard',
              hsn_code: it.hsn_code || '3604',
              unit: it.unit || 'box',
              qty: Math.max(1, Number(it.qty) || 1),
              unit_price: Number(it.unit_price) || 0,
              discount_percent: Number(it.discount_percent) || 0,
              taxable_value: Number(it.taxable_value) || 0,
              line_total: Number(it.line_total) || 0,
            }));
            const { error: itemsErr } = await supabase.from('quotation_items').upsert(cleanItems, { onConflict: 'id' });
            if (itemsErr) throw new Error(`Quotation items sync error: ${itemsErr.message}`);
          }
        }
      } catch (err: any) {
        console.warn('Quotations sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'quotation_items') {
      const it = item.payload;
      try {
        if (item.op === 'delete') {
          await supabase.from('quotation_items').delete().eq('id', it.id);
        } else {
          const cleanItem = {
            id: (it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.id)) ? it.id : generateUUID(),
            quotation_id: it.quotation_id,
            product_id: (it.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.product_id)) ? it.product_id : null,
            product_code: it.product_code || null,
            product_name: (it.product_name || '').trim(),
            brand: it.brand || 'Standard',
            hsn_code: it.hsn_code || '3604',
            unit: it.unit || 'box',
            qty: Math.max(1, Number(it.qty) || 1),
            unit_price: Number(it.unit_price) || 0,
            discount_percent: Number(it.discount_percent) || 0,
            taxable_value: Number(it.taxable_value) || 0,
            line_total: Number(it.line_total) || 0,
          };
          const { error } = await supabase.from('quotation_items').upsert(cleanItem, { onConflict: 'id' });
          if (error) throw new Error(`Quotation item sync error: ${error.message}`);
        }
      } catch (err: any) {
        console.warn('Quotation item sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'sale_orders') {
      const so = item.payload;
      try {
        if (item.op === 'delete') {
          await supabase.from('sale_order_items').delete().eq('so_id', so.id);
          const { error: delErr } = await supabase.from('sale_orders').delete().eq('id', so.id);
          if (delErr) console.warn('Sale order delete notice:', delErr.message);
        } else {
          const cleanSo: Record<string, any> = {
            id: so.id,
            so_no: so.so_no,
            client_id: (so.client_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(so.client_id)) ? so.client_id : null,
            customer_name: (so.customer_name || '').trim(),
            customer_phone: so.customer_phone?.trim() || null,
            customer_address: so.customer_address?.trim() || null,
            customer_gstin: so.customer_gstin?.trim()?.toUpperCase() || null,
            order_date: so.order_date || new Date().toISOString().slice(0, 10),
            delivery_due_date: so.delivery_due_date || null,
            status: so.status || 'pending',
            pricing_type: so.pricing_type || 'wholesale',
            subtotal: Number(so.subtotal) || 0,
            discount_amount: Number(so.discount_amount) || 0,
            total_amount: Number(so.total_amount) || 0,
            payment_status: so.payment_status || 'unpaid',
            paid_amount: Number(so.paid_amount) || 0,
            transport_name: so.transport_name || null,
            lr_number: so.lr_number || null,
            vehicle_number: so.vehicle_number || null,
            driver_phone: so.driver_phone || null,
            destination: so.destination || null,
            dispatched_at: so.dispatched_at || null,
            dispatched_by: so.dispatched_by || null,
            assigned_dispatcher_id: so.assigned_dispatcher_id || null,
            assigned_dispatcher_name: so.assigned_dispatcher_name || null,
            dispatch_assigned_at: so.dispatch_assigned_at || null,
            verified_items: so.verified_items || [],
            notes: so.notes || null,
            created_by: so.created_by || 'Staff',
            created_at: so.created_at || new Date().toISOString(),
            updated_at: so.updated_at || new Date().toISOString(),
          };
          const { error: soErr } = await supabase.from('sale_orders').upsert(cleanSo, { onConflict: 'id' });
          if (soErr) throw new Error(`Sale order sync error: ${soErr.message}`);

          if (so.items && Array.isArray(so.items) && so.items.length > 0) {
            await supabase.from('sale_order_items').delete().eq('so_id', so.id);
            const cleanItems = so.items.map((it: any) => ({
              id: (it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.id)) ? it.id : generateUUID(),
              so_id: so.id,
              product_id: (it.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.product_id)) ? it.product_id : null,
              product_code: it.product_code || null,
              product_name: (it.product_name || '').trim(),
              brand: it.brand || 'Standard',
              unit: it.unit || 'box',
              qty: Math.max(1, Number(it.qty) || 1),
              unit_price: Number(it.unit_price) || 0,
              line_total: Number(it.line_total) || 0,
            }));
            const { error: itemsErr } = await supabase.from('sale_order_items').upsert(cleanItems, { onConflict: 'id' });
            if (itemsErr) throw new Error(`Sale order items sync error: ${itemsErr.message}`);
          }
        }
      } catch (err: any) {
        console.warn('Sale order sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'sale_order_items') {
      const it = item.payload;
      try {
        if (item.op === 'delete') {
          await supabase.from('sale_order_items').delete().eq('id', it.id);
        } else {
          const cleanItem = {
            id: (it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.id)) ? it.id : generateUUID(),
            so_id: it.so_id,
            product_id: (it.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.product_id)) ? it.product_id : null,
            product_code: it.product_code || null,
            product_name: (it.product_name || '').trim(),
            brand: it.brand || 'Standard',
            unit: it.unit || 'box',
            qty: Math.max(1, Number(it.qty) || 1),
            unit_price: Number(it.unit_price) || 0,
            line_total: Number(it.line_total) || 0,
          };
          const { error } = await supabase.from('sale_order_items').upsert(cleanItem, { onConflict: 'id' });
          if (error) throw new Error(`Sale order item sync error: ${error.message}`);
        }
      } catch (err: any) {
        console.warn('Sale order item sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'purchase_orders') {
      const po = item.payload;
      try {
        if (item.op === 'delete') {
          await supabase.from('purchase_order_items').delete().eq('po_id', po.id);
          const { error: delErr } = await supabase.from('purchase_orders').delete().eq('id', po.id);
          if (delErr) console.warn('Purchase order delete notice:', delErr.message);
        } else {
          const cleanPo: Record<string, any> = {
            id: po.id,
            po_no: po.po_no,
            supplier_id: (po.supplier_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(po.supplier_id)) ? po.supplier_id : null,
            supplier_name: (po.supplier_name || '').trim(),
            supplier_phone: po.supplier_phone?.trim() || null,
            supplier_gstin: po.supplier_gstin?.trim()?.toUpperCase() || null,
            order_date: po.order_date || new Date().toISOString().slice(0, 10),
            expected_date: po.expected_date || null,
            status: po.status || 'draft',
            subtotal: Number(po.subtotal) || 0,
            tax_amount: Number(po.tax_amount) || 0,
            total_amount: Number(po.total_amount) || 0,
            payment_status: po.payment_status || 'unpaid',
            paid_amount: Number(po.paid_amount) || 0,
            notes: po.notes || null,
            created_by: po.created_by || 'Staff',
            created_at: po.created_at || new Date().toISOString(),
            updated_at: po.updated_at || new Date().toISOString(),
          };
          const { error: poErr } = await supabase.from('purchase_orders').upsert(cleanPo, { onConflict: 'id' });
          if (poErr) throw new Error(`Purchase order sync error: ${poErr.message}`);

          if (po.items && Array.isArray(po.items) && po.items.length > 0) {
            await supabase.from('purchase_order_items').delete().eq('po_id', po.id);
            const cleanItems = po.items.map((it: any) => ({
              id: (it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.id)) ? it.id : generateUUID(),
              po_id: po.id,
              product_id: (it.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.product_id)) ? it.product_id : null,
              product_code: it.product_code || null,
              product_name: (it.product_name || '').trim(),
              brand: it.brand || 'Standard',
              unit: it.unit || 'box',
              qty: Math.max(1, Number(it.qty) || 1),
              unit_cost: Number(it.unit_cost) || 0,
              line_total: Number(it.line_total) || 0,
            }));
            const { error: itemsErr } = await supabase.from('purchase_order_items').upsert(cleanItems, { onConflict: 'id' });
            if (itemsErr) throw new Error(`Purchase order items sync error: ${itemsErr.message}`);
          }
        }
      } catch (err: any) {
        console.warn('Purchase order sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'purchase_order_items') {
      const it = item.payload;
      try {
        if (item.op === 'delete') {
          await supabase.from('purchase_order_items').delete().eq('id', it.id);
        } else {
          const cleanItem = {
            id: (it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.id)) ? it.id : generateUUID(),
            po_id: it.po_id,
            product_id: (it.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.product_id)) ? it.product_id : null,
            product_code: it.product_code || null,
            product_name: (it.product_name || '').trim(),
            brand: it.brand || 'Standard',
            unit: it.unit || 'box',
            qty: Math.max(1, Number(it.qty) || 1),
            unit_cost: Number(it.unit_cost) || 0,
            line_total: Number(it.line_total) || 0,
          };
          const { error } = await supabase.from('purchase_order_items').upsert(cleanItem, { onConflict: 'id' });
          if (error) throw new Error(`Purchase order item sync error: ${error.message}`);
        }
      } catch (err: any) {
        console.warn('Purchase order item sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'invoices') {
      const inv = item.payload;
      try {
        if (item.op === 'delete') {
          await supabase.from('invoice_items').delete().eq('invoice_id', inv.id);
          const { error: delErr } = await supabase.from('invoices').delete().eq('id', inv.id);
          if (delErr) console.warn('Invoice delete notice:', delErr.message);
        } else {
          const cleanInv: Record<string, any> = {
            id: inv.id,
            invoice_no: inv.invoice_no,
            so_id: (inv.so_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inv.so_id)) ? inv.so_id : null,
            client_id: (inv.client_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inv.client_id)) ? inv.client_id : null,
            customer_name: (inv.customer_name || '').trim(),
            customer_phone: inv.customer_phone?.trim() || null,
            customer_address: inv.customer_address?.trim() || null,
            customer_gstin: inv.customer_gstin?.trim()?.toUpperCase() || null,
            invoice_date: inv.invoice_date || new Date().toISOString().slice(0, 10),
            due_date: inv.due_date || null,
            pricing_type: inv.pricing_type || 'wholesale',
            subtotal: Number(inv.subtotal) || 0,
            discount_amount: Number(inv.discount_amount) || 0,
            taxable_amount: Number(inv.taxable_amount) || 0,
            gst_rate: Number(inv.gst_rate) || 18,
            cgst: Number(inv.cgst) || 0,
            sgst: Number(inv.sgst) || 0,
            igst: Number(inv.igst) || 0,
            round_off: Number(inv.round_off) || 0,
            total_amount: Number(inv.total_amount) || 0,
            payment_status: inv.payment_status || 'unpaid',
            paid_amount: Number(inv.paid_amount) || 0,
            payment_mode: inv.payment_mode || null,
            transport_name: inv.transport_name || null,
            lr_number: inv.lr_number || null,
            vehicle_number: inv.vehicle_number || null,
            notes: inv.notes || null,
            created_by: inv.created_by || 'Staff',
            created_at: inv.created_at || new Date().toISOString(),
            updated_at: inv.updated_at || new Date().toISOString(),
          };
          const { error: invErr } = await supabase.from('invoices').upsert(cleanInv, { onConflict: 'id' });
          if (invErr) throw new Error(`Invoice sync error: ${invErr.message}`);

          if (inv.items && Array.isArray(inv.items) && inv.items.length > 0) {
            await supabase.from('invoice_items').delete().eq('invoice_id', inv.id);
            const cleanItems = inv.items.map((it: any) => ({
              id: (it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.id)) ? it.id : generateUUID(),
              invoice_id: inv.id,
              product_id: (it.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.product_id)) ? it.product_id : null,
              product_code: it.product_code || null,
              product_name: (it.product_name || '').trim(),
              brand: it.brand || 'Standard',
              hsn_code: it.hsn_code || '3604',
              unit: it.unit || 'box',
              qty: Math.max(1, Number(it.qty) || 1),
              unit_price: Number(it.unit_price) || 0,
              discount_percent: Number(it.discount_percent) || 0,
              taxable_value: Number(it.taxable_value) || 0,
              line_total: Number(it.line_total) || 0,
            }));
            const { error: itemsErr } = await supabase.from('invoice_items').upsert(cleanItems, { onConflict: 'id' });
            if (itemsErr) throw new Error(`Invoice items sync error: ${itemsErr.message}`);
          }
        }
      } catch (err: any) {
        console.warn('Invoices sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'invoice_items') {
      const it = item.payload;
      try {
        if (item.op === 'delete') {
          await supabase.from('invoice_items').delete().eq('id', it.id);
        } else {
          const cleanItem = {
            id: (it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.id)) ? it.id : generateUUID(),
            invoice_id: it.invoice_id,
            product_id: (it.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.product_id)) ? it.product_id : null,
            product_code: it.product_code || null,
            product_name: (it.product_name || '').trim(),
            brand: it.brand || 'Standard',
            hsn_code: it.hsn_code || '3604',
            unit: it.unit || 'box',
            qty: Math.max(1, Number(it.qty) || 1),
            unit_price: Number(it.unit_price) || 0,
            discount_percent: Number(it.discount_percent) || 0,
            taxable_value: Number(it.taxable_value) || 0,
            line_total: Number(it.line_total) || 0,
          };
          const { error } = await supabase.from('invoice_items').upsert(cleanItem, { onConflict: 'id' });
          if (error) throw new Error(`Invoice item sync error: ${error.message}`);
        }
      } catch (err: any) {
        console.warn('Invoice item sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'stock_movements') {
      const mv = item.payload;
      try {
        const cleanMv: Record<string, any> = {
          id: (mv.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mv.id)) ? mv.id : generateUUID(),
          product_id: (mv.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mv.product_id)) ? mv.product_id : null,
          product_code: mv.product_code || null,
          product_name: (mv.product_name || '').trim(),
          brand: mv.brand || 'Standard',
          type: mv.type || 'adjustment',
          qty: Number(mv.qty) || 0,
          prev_stock: Number(mv.prev_stock) || 0,
          new_stock: Number(mv.new_stock) || 0,
          reference_no: mv.reference_no || null,
          reason: mv.reason || null,
          created_by: mv.created_by || 'Staff',
          created_at: mv.created_at || new Date().toISOString(),
        };
        const { error } = await supabase.from('stock_movements').upsert(cleanMv, { onConflict: 'id' });
        if (error) throw new Error(`Stock movement sync error: ${error.message}`);
      } catch (err: any) {
        console.warn('Stock movement sync encounter:', err?.message);
        throw err;
      }
    } else if (item.entity === 'transport_entries') {
      const t = item.payload;
      try {
        if (item.op === 'delete') {
          const { error: delErr } = await supabase.from('transport_entries').delete().eq('id', t.id);
          if (delErr) console.warn('Transport entry delete notice:', delErr.message);
        } else {
          const cleanTransport: Record<string, any> = {
            id: t.id,
            lr_no: (t.lr_no || '').trim(),
            transport_name: (t.transport_name || 'VRL Logistics').trim(),
            vehicle_no: t.vehicle_no?.trim()?.toUpperCase() || null,
            driver_name: t.driver_name?.trim() || null,
            driver_phone: t.driver_phone?.trim() || null,
            dispatch_date: t.dispatch_date || new Date().toISOString().slice(0, 10),
            estimated_delivery_date: t.estimated_delivery_date || null,
            actual_delivery_date: t.actual_delivery_date || null,
            destination: (t.destination || 'Hosur').trim(),
            source_location: (t.source_location || 'Hosur Warehouse').trim(),
            so_id: (t.so_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.so_id)) ? t.so_id : null,
            so_no: t.so_no || null,
            invoice_id: (t.invoice_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.invoice_id)) ? t.invoice_id : null,
            invoice_no: t.invoice_no || null,
            client_id: (t.client_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.client_id)) ? t.client_id : null,
            consignee_name: (t.consignee_name || '').trim(),
            consignee_phone: t.consignee_phone?.trim() || null,
            consignee_address: t.consignee_address?.trim() || null,
            consignee_gstin: t.consignee_gstin?.trim()?.toUpperCase() || null,
            total_boxes: Number(t.total_boxes) || 0,
            total_weight_kg: Number(t.total_weight_kg) || 0,
            consignment_value: Number(t.consignment_value) || 0,
            items_summary: t.items_summary || null,
            freight_type: t.freight_type || 'to_pay',
            freight_amount: Number(t.freight_amount) || 0,
            loading_charges: Number(t.loading_charges) || 0,
            total_charges: Number(t.total_charges) || 0,
            status: t.status || 'booked',
            delivery_remarks: t.delivery_remarks || null,
            dispatched_by: t.dispatched_by || null,
            created_by: t.created_by || 'Staff',
            created_at: t.created_at || new Date().toISOString(),
            updated_at: t.updated_at || new Date().toISOString(),
          };
          const { error: tErr } = await supabase.from('transport_entries').upsert(cleanTransport, { onConflict: 'id' });
          if (tErr) throw new Error(`Transport entry sync error: ${tErr.message}`);
        }
      } catch (err: any) {
        console.warn('Transport entry sync notice:', err?.message);
        throw err;
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

    // 2. Pull Bills from Cloud (safely merge into local IndexedDB without deleting local bills)
    try {
      const { data: serverBills, error: billErr } = await supabase
        .from('bills')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!billErr && serverBills && serverBills.length > 0) {
        const mapped = serverBills.map((b: any) => ({ ...b, sync_status: 'synced' as const }));
        // Merge cloud bills into local Dexie database (never delete local bills)
        await db.bills.bulkPut(mapped);

        // Fetch items for pulled bills in batches of 30 to avoid URL length overflow
        const billIds = serverBills.map((b: any) => b.id);
        const CHUNK_SIZE = 30;
        const allItems: BillItem[] = [];
        for (let i = 0; i < billIds.length; i += CHUNK_SIZE) {
          const chunk = billIds.slice(i, i + CHUNK_SIZE);
          const { data: chunkItems, error: chunkErr } = await supabase
            .from('bill_items')
            .select('*')
            .in('bill_id', chunk);
          if (chunkItems && chunkItems.length > 0) {
            allItems.push(...(chunkItems as BillItem[]));
          }
          if (chunkErr) {
            console.warn('Sync chunk bill_items warning:', chunkErr.message);
          }
        }
        if (allItems.length > 0) {
          await db.bill_items.bulkPut(allItems);
        }

        // Notify UI screens that bills have synced from cloud
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bills-synced'));
        }
      }
    } catch (bErr) {
      console.warn('Bills background sync notice:', bErr);
    }

    // 3. Pull Profiles
    const { data: profiles } = await supabase.from('profiles').select('*');
    if (profiles && profiles.length > 0) {
      await db.profiles.bulkPut(profiles as Profile[]);
    }

    // 4. Pull Shop Settings (if migration 008 table exists)
    try {
      const { data: remoteSettings } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('key', 'shop_settings')
        .maybeSingle();

      if (remoteSettings) {
        const local = await db.settings.get('shop_settings');
        const merged = { ...local?.value, ...remoteSettings };
        await db.settings.put({ key: 'shop_settings', value: merged });
      }
    } catch {
      // Table might not exist yet if migration 008 has not been applied
    }

    // 5. Pull Activity Logs from Cloud
    try {
      const { data: remoteLogs, error: logsErr } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!logsErr && remoteLogs && remoteLogs.length > 0) {
        await db.activity_logs.bulkPut(remoteLogs);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('activity-logs-synced'));
        }
      }
    } catch (logsErr) {
      console.warn('Activity logs background sync notice:', logsErr);
    }

    // 6. Pull Brands from Cloud
    try {
      const { data: serverBrands, error: bErr } = await supabase.from('brands').select('*');
      if (!bErr && serverBrands && serverBrands.length > 0) {
        await db.brands.bulkPut(serverBrands as Brand[]);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('brands-synced'));
        }
      }
    } catch (bErr) {
      console.warn('Brands background sync notice:', bErr);
    }

    // 7. Pull Categories from Cloud
    try {
      const { data: serverCats, error: cErr } = await supabase.from('categories').select('*');
      if (!cErr && serverCats && serverCats.length > 0) {
        const activeOnly = serverCats.filter((c: any) => c.is_active !== false);
        await db.categories.bulkPut(activeOnly as Category[]);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('categories-synced'));
        }
      }
    } catch (cErr) {
      console.warn('Categories background sync notice:', cErr);
    }

    // 8. Pull Clients from Cloud
    try {
      const { data: serverClients, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1000);

      if (!clientErr && serverClients && serverClients.length > 0) {
        const mappedClients: Client[] = serverClients.map((c: any) => ({
          ...c,
          current_balance: c.outstanding_balance ?? c.current_balance,
        }));
        await db.clients.bulkPut(mappedClients);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('clients-synced'));
        }
      }
    } catch (clientErr) {
      console.warn('Clients background sync notice:', clientErr);
    }

    // 9. Pull Quotations & Quotation Items from Cloud
    try {
      const { data: serverQuotes, error: qErr } = await supabase
        .from('quotations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!qErr && serverQuotes && serverQuotes.length > 0) {
        await db.quotations.bulkPut(serverQuotes as Quotation[]);
        const quoteIds = serverQuotes.map((q: any) => q.id);
        const CHUNK = 30;
        const allQItems: QuotationItem[] = [];
        for (let i = 0; i < quoteIds.length; i += CHUNK) {
          const chunk = quoteIds.slice(i, i + CHUNK);
          const { data: qItems, error: qiErr } = await supabase
            .from('quotation_items')
            .select('*')
            .in('quotation_id', chunk);
          if (qItems && qItems.length > 0) {
            allQItems.push(...(qItems as QuotationItem[]));
          }
          if (qiErr) {
            console.warn('Quotation items chunk notice:', qiErr.message);
          }
        }
        if (allQItems.length > 0) {
          await db.quotation_items.bulkPut(allQItems);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('quotations-synced'));
        }
      }
    } catch (quoteErr) {
      console.warn('Quotations background sync notice:', quoteErr);
    }

    // 10. Pull Sale Orders & Items from Cloud
    try {
      const { data: serverSos, error: soErr } = await supabase
        .from('sale_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!soErr && serverSos && serverSos.length > 0) {
        await db.sale_orders.bulkPut(serverSos as SaleOrder[]);
        const soIds = serverSos.map((so: any) => so.id);
        const CHUNK = 30;
        const allSoItems: SaleOrderItem[] = [];
        for (let i = 0; i < soIds.length; i += CHUNK) {
          const chunk = soIds.slice(i, i + CHUNK);
          const { data: soItems, error: soiErr } = await supabase
            .from('sale_order_items')
            .select('*')
            .in('so_id', chunk);
          if (soItems && soItems.length > 0) {
            allSoItems.push(...(soItems as SaleOrderItem[]));
          }
          if (soiErr) {
            console.warn('Sale order items chunk notice:', soiErr.message);
          }
        }
        if (allSoItems.length > 0) {
          await db.sale_order_items.bulkPut(allSoItems);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sale-orders-synced'));
        }
      }
    } catch (soErr) {
      console.warn('Sale orders background sync notice:', soErr);
    }

    // 11. Pull Purchase Orders & Items from Cloud
    try {
      const { data: serverPos, error: poErr } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!poErr && serverPos && serverPos.length > 0) {
        await db.purchase_orders.bulkPut(serverPos as PurchaseOrder[]);
        const poIds = serverPos.map((po: any) => po.id);
        const CHUNK = 30;
        const allPoItems: PurchaseOrderItem[] = [];
        for (let i = 0; i < poIds.length; i += CHUNK) {
          const chunk = poIds.slice(i, i + CHUNK);
          const { data: poItems, error: poiErr } = await supabase
            .from('purchase_order_items')
            .select('*')
            .in('po_id', chunk);
          if (poItems && poItems.length > 0) {
            allPoItems.push(...(poItems as PurchaseOrderItem[]));
          }
          if (poiErr) {
            console.warn('Purchase order items chunk notice:', poiErr.message);
          }
        }
        if (allPoItems.length > 0) {
          await db.purchase_order_items.bulkPut(allPoItems);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('purchase-orders-synced'));
        }
      }
    } catch (poErr) {
      console.warn('Purchase orders background sync notice:', poErr);
    }

    // 12. Pull Invoices & Items from Cloud
    try {
      const { data: serverInvs, error: invErr } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!invErr && serverInvs && serverInvs.length > 0) {
        await db.invoices.bulkPut(serverInvs as Invoice[]);
        const invIds = serverInvs.map((inv: any) => inv.id);
        const CHUNK = 30;
        const allInvItems: InvoiceItem[] = [];
        for (let i = 0; i < invIds.length; i += CHUNK) {
          const chunk = invIds.slice(i, i + CHUNK);
          const { data: invItems, error: inviErr } = await supabase
            .from('invoice_items')
            .select('*')
            .in('invoice_id', chunk);
          if (invItems && invItems.length > 0) {
            allInvItems.push(...(invItems as InvoiceItem[]));
          }
          if (inviErr) {
            console.warn('Invoice items chunk notice:', inviErr.message);
          }
        }
        if (allInvItems.length > 0) {
          await db.invoice_items.bulkPut(allInvItems);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('invoices-synced'));
        }
      }
    } catch (invErr) {
      console.warn('Invoices background sync notice:', invErr);
    }

    // 13. Pull Stock Movements from Cloud
    try {
      const { data: serverMoves, error: mvErr } = await supabase
        .from('stock_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!mvErr && serverMoves && serverMoves.length > 0) {
        await db.stock_movements.bulkPut(serverMoves as StockMovement[]);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('stock-movements-synced'));
        }
      }
    } catch (mvErr) {
      console.warn('Stock movements background sync notice:', mvErr);
    }

    // 14. Pull Transport Entries from Cloud
    try {
      const { data: serverTransports, error: transErr } = await supabase
        .from('transport_entries')
        .select('*')
        .order('dispatch_date', { ascending: false })
        .limit(500);

      if (!transErr && serverTransports && serverTransports.length > 0) {
        await db.transport_entries.bulkPut(serverTransports as TransportEntry[]);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('transport-entries-synced'));
        }
      }
    } catch (transErr) {
      console.warn('Transport entries background sync notice:', transErr);
    }
  }

  /**
   * Scans local Dexie database for any clients, quotations, orders, invoices, or stock movements
   * that do not yet have an outbox entry, and queues them so they are immediately synced to Supabase.
   */
  public async reconcileLocalRecordsToOutbox(): Promise<void> {
    try {
      const allOutbox = await db.outbox.toArray();
      const existingEntityIds = new Set<string>();
      allOutbox.forEach((item) => {
        if (item.payload?.id) {
          existingEntityIds.add(`${item.entity}:${item.payload.id}`);
        }
      });

      // 1. Reconcile Clients
      const localClients = await db.clients.toArray();
      for (const client of localClients) {
        const key = `clients:${client.id}`;
        if (!existingEntityIds.has(key)) {
          await db.outbox.add({
            id: generateUUID(),
            entity: 'clients',
            op: 'upsert',
            payload: client,
            status: 'pending',
            attempts: 0,
            created_at: client.created_at || new Date().toISOString(),
          });
          existingEntityIds.add(key);
        }
      }

      // 2. Reconcile Quotations (with items)
      const localQuotes = await db.quotations.toArray();
      for (const quote of localQuotes) {
        const key = `quotations:${quote.id}`;
        if (!existingEntityIds.has(key)) {
          const items = await db.quotation_items.where('quotation_id').equals(quote.id).toArray();
          await db.outbox.add({
            id: generateUUID(),
            entity: 'quotations',
            op: 'upsert',
            payload: { ...quote, items },
            status: 'pending',
            attempts: 0,
            created_at: quote.created_at || new Date().toISOString(),
          });
          existingEntityIds.add(key);
        }
      }

      // 3. Reconcile Sale Orders (with items)
      const localSos = await db.sale_orders.toArray();
      for (const so of localSos) {
        const key = `sale_orders:${so.id}`;
        if (!existingEntityIds.has(key)) {
          const items = await db.sale_order_items.where('so_id').equals(so.id).toArray();
          await db.outbox.add({
            id: generateUUID(),
            entity: 'sale_orders',
            op: 'upsert',
            payload: { ...so, items },
            status: 'pending',
            attempts: 0,
            created_at: so.created_at || new Date().toISOString(),
          });
          existingEntityIds.add(key);
        }
      }

      // 4. Reconcile Purchase Orders (with items)
      const localPos = await db.purchase_orders.toArray();
      for (const po of localPos) {
        const key = `purchase_orders:${po.id}`;
        if (!existingEntityIds.has(key)) {
          const items = await db.purchase_order_items.where('po_id').equals(po.id).toArray();
          await db.outbox.add({
            id: generateUUID(),
            entity: 'purchase_orders',
            op: 'upsert',
            payload: { ...po, items },
            status: 'pending',
            attempts: 0,
            created_at: po.created_at || new Date().toISOString(),
          });
          existingEntityIds.add(key);
        }
      }

      // 5. Reconcile Invoices (with items)
      const localInvs = await db.invoices.toArray();
      for (const inv of localInvs) {
        const key = `invoices:${inv.id}`;
        if (!existingEntityIds.has(key)) {
          const items = await db.invoice_items.where('invoice_id').equals(inv.id).toArray();
          await db.outbox.add({
            id: generateUUID(),
            entity: 'invoices',
            op: 'upsert',
            payload: { ...inv, items },
            status: 'pending',
            attempts: 0,
            created_at: inv.created_at || new Date().toISOString(),
          });
          existingEntityIds.add(key);
        }
      }

      // 6. Reconcile Transport Entries
      const localTransports = await db.transport_entries.toArray();
      for (const t of localTransports) {
        const key = `transport_entries:${t.id}`;
        if (!existingEntityIds.has(key)) {
          await db.outbox.add({
            id: generateUUID(),
            entity: 'transport_entries',
            op: 'upsert',
            payload: t,
            status: 'pending',
            attempts: 0,
            created_at: t.created_at || new Date().toISOString(),
          });
          existingEntityIds.add(key);
        }
      }
    } catch (err) {
      console.warn('Reconcile local records notice:', err);
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
      // 1. Clear cached local products, sync metadata, and categories (never wipe bills!)
      await db.transaction('rw', [db.products, db.sync_meta, db.categories, db.outbox], async () => {
        await db.products.clear();
        await db.sync_meta.clear();
        await db.categories.clear();
        await db.outbox.where('entity').equals('categories').delete();
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
          const activeOnly = serverCategories.filter((c: any) => c.is_active !== false);
          await db.categories.bulkPut(activeOnly as Category[]);
        }
      } catch (cErr) {
        console.warn('Categories fresh pull warning:', cErr);
      }

      // 5. Fetch fresh bills from Supabase
      let billCount = 0;
      try {
        const { data: serverBills, error: billFetchErr } = await supabase
          .from('bills')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (!billFetchErr && serverBills && serverBills.length > 0) {
          const mapped = serverBills.map((b: any) => ({ ...b, sync_status: 'synced' as const }));
          await db.bills.bulkPut(mapped);
          billCount = serverBills.length;

          const billIds = serverBills.map((b: any) => b.id);
          const CHUNK_SIZE = 30;
          const allItems: BillItem[] = [];
          for (let i = 0; i < billIds.length; i += CHUNK_SIZE) {
            const chunk = billIds.slice(i, i + CHUNK_SIZE);
            const { data: chunkItems, error: chunkErr } = await supabase
              .from('bill_items')
              .select('*')
              .in('bill_id', chunk);
            if (chunkItems && chunkItems.length > 0) {
              allItems.push(...(chunkItems as BillItem[]));
            }
            if (chunkErr) {
              console.warn('Force fresh pull bill_items chunk warning:', chunkErr.message);
            }
          }
          if (allItems.length > 0) {
            await db.bill_items.bulkPut(allItems);
          }
        }
      } catch (billsErr) {
        console.warn('Bills fresh pull warning:', billsErr);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bills-synced'));
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
        message: `Successfully cleared cache and pulled fresh data from Supabase! (Products: ${productCount}, Bills: ${billCount})`,
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
