import { create } from 'zustand';
import { Product, PaymentMode, Bill, BillItem, OutboxItem, Profile, Brand } from '@/types';
import { calculateBillTotals, BillTotalsResult, consolidateBillItems } from '@/lib/format';
import { db, generateNextBillNo } from '@/db';
import { syncService } from '@/sync/syncService';
import { generateUUID } from '@/lib/uuid';
import { logActivity } from '@/lib/activityLogger';

export interface CartItem {
  id: string; // client temporary or bill_item id
  product_id: string;
  code: string;
  product_name: string;
  brand: string;
  unit: string;
  unit_price: number;
  qty: number;
  line_total: number;
  stock: number;
}

interface CartState {
  items: CartItem[];
  customer_name: string;
  customer_phone: string;
  discount_percent: number;
  defaultBrandDiscounts: Record<string, number>;
  brand_discounts: Record<string, number>;
  payment_mode: PaymentMode;
  editingBillId: string | null;
  editingBillNo: string | null;
  editingBillCreatedAt: string | null;
  editingBillCreatedBy: string | null;

  // Actions
  addItem: (product: Product, quantity?: number) => void;
  updateQty: (itemId: string, qty: number) => void;
  updatePrice: (itemId: string, unit_price: number) => void;
  removeItem: (itemId: string) => void;
  setCustomerName: (name: string) => void;
  setCustomerPhone: (phone: string) => void;
  setDiscountPercent: (percent: number) => void;
  setBrandDiscount: (brand: string, percent: number) => void;
  clearBrandDiscounts: () => void;
  initializeBrandDiscounts: (brands: Brand[], force?: boolean) => void;
  syncCartBrands: (products: Product[]) => void;
  setPaymentMode: (mode: PaymentMode) => void;
  clearCart: (brands?: Brand[]) => void;
  cancelEdit: (brands?: Brand[]) => void;
  loadBillForEdit: (bill: Bill, items: BillItem[]) => void;

  // Derived totals
  getTotals: () => BillTotalsResult;

  // Save bill
  saveBill: (currentUser: Profile) => Promise<{ bill: Bill; items: BillItem[] }>;
}

const CRACKER_CATEGORIES_LOWER = new Set([
  'sparklers',
  'ground chakkars',
  'flower pots',
  'rockets',
  'bombs & sound crackers',
  'bijili crackers',
  'single & multi shots',
  'fancy sky shots',
]);

function resolveItemBrand(brand?: string | null, category?: string | null): string {
  const b = (brand || '').trim();
  const c = (category || '').trim();

  // If brand is explicitly set and not mistakenly equal to a category name
  if (b && !CRACKER_CATEGORIES_LOWER.has(b.toLowerCase())) {
    return b;
  }

  // Check category hint
  if (c && (c.toLowerCase() === 'general' || c.toLowerCase() === 'net')) {
    return 'General';
  }
  return 'Standard';
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customer_name: '',
  customer_phone: '',
  discount_percent: 0,
  defaultBrandDiscounts: {},
  brand_discounts: {},
  payment_mode: 'cash',
  editingBillId: null,
  editingBillNo: null,
  editingBillCreatedAt: null,
  editingBillCreatedBy: null,

  addItem: (product: Product, quantity: number = 1) => {
    const brand = resolveItemBrand(product.brand, product.category);
    set((state) => {
      // Find existing item by product_id, code, or exact name + unit price
      const existingIndex = state.items.findIndex(
        (item) =>
          (product.id && item.product_id && item.product_id === product.id) ||
          (product.code && item.code && item.code.toUpperCase() === product.code.toUpperCase()) ||
          (item.product_name.trim().toLowerCase() === product.name.trim().toLowerCase() &&
            Number(item.unit_price) === Number(product.price))
      );
      if (existingIndex > -1) {
        const updatedItems = [...state.items];
        const existing = updatedItems[existingIndex];
        const newQty = existing.qty + quantity;
        updatedItems[existingIndex] = {
          ...existing,
          brand: brand,
          product_id: existing.product_id || product.id,
          code: existing.code || product.code,
          qty: newQty,
          line_total: Math.round(newQty * existing.unit_price * 100) / 100,
        };
        return { items: updatedItems };
      } else {
        const newItem: CartItem = {
          id: generateUUID(),
          product_id: product.id,
          code: product.code,
          product_name: product.name,
          brand: brand,
          unit: product.unit || 'box',
          unit_price: product.price,
          qty: quantity,
          line_total: Math.round(quantity * product.price * 100) / 100,
          stock: product.stock,
        };
        return { items: [newItem, ...state.items] };
      }
    });
  },

  syncCartBrands: (products: Product[]) => {
    if (!products || products.length === 0) return;
    const prodMap = new Map<string, Product>();
    const nameMap = new Map<string, Product>();
    products.forEach((p) => {
      prodMap.set(p.id, p);
      if (p.code) prodMap.set(p.code.toUpperCase(), p);
      if (p.name) nameMap.set(p.name.trim().toLowerCase(), p);
    });

    set((state) => ({
      items: state.items.map((item) => {
        const prod =
          prodMap.get(item.product_id) ||
          (item.code ? prodMap.get(item.code.toUpperCase()) : null) ||
          nameMap.get(item.product_name.trim().toLowerCase());
        if (prod) {
          const effectiveBrand = resolveItemBrand(prod.brand, prod.category);
          if (effectiveBrand && effectiveBrand !== item.brand) {
            return { ...item, brand: effectiveBrand, product_id: prod.id, code: prod.code };
          }
        }
        return item;
      }),
    }));
  },

  updateQty: (itemId: string, qty: number) => {
    const validQty = Math.max(1, qty);
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              qty: validQty,
              line_total: Math.round(validQty * item.unit_price * 100) / 100,
            }
          : item
      ),
    }));
  },

  updatePrice: (itemId: string, unit_price: number) => {
    const validPrice = Math.max(0, unit_price);
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              unit_price: validPrice,
              line_total: Math.round(item.qty * validPrice * 100) / 100,
            }
          : item
      ),
    }));
  },

  removeItem: (itemId: string) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== itemId),
    }));
  },

  setCustomerName: (name: string) => set({ customer_name: name }),
  setCustomerPhone: (phone: string) => set({ customer_phone: phone }),
  setDiscountPercent: (percent: number) => set({ discount_percent: Math.max(0, Math.min(100, percent)) }),

  setBrandDiscount: (brand: string, percent: number) => {
    const validPct = Math.max(0, Math.min(100, Math.round(percent * 100) / 100));
    set((state) => {
      const updated = { ...state.brand_discounts };
      const target = brand.trim().toLowerCase();
      // Remove any case variation key
      for (const k of Object.keys(updated)) {
        if (k.trim().toLowerCase() === target && k !== brand) {
          delete updated[k];
        }
      }
      updated[brand] = validPct;
      return { brand_discounts: updated };
    });
  },

  clearBrandDiscounts: () => set({ brand_discounts: {} }),

  initializeBrandDiscounts: (brands: Brand[], force: boolean = false) => {
    if (!brands || brands.length === 0) return;
    set((state) => {
      const defaults: Record<string, number> = {};
      brands.forEach((b) => {
        const brandName = (b.name || '').trim();
        if (!brandName) return;
        if (b.is_active && b.has_discount) {
          defaults[brandName] = Number(b.discount_percent) || 0;
        } else {
          defaults[brandName] = 0;
        }
      });

      // Ensure Standard & General exist with default 0 if unconfigured
      if (defaults['Standard'] === undefined) {
        defaults['Standard'] = 0;
      }
      if (defaults['General'] === undefined) {
        defaults['General'] = 0;
      }

      // If force or when starting/creating a clean new bill, strictly apply brand defaults configured by admin
      const updated = (force || !state.editingBillId)
        ? { ...defaults }
        : { ...defaults, ...state.brand_discounts };

      return {
        defaultBrandDiscounts: defaults,
        brand_discounts: updated,
      };
    });
  },

  setPaymentMode: (mode: PaymentMode) => set({ payment_mode: mode }),

  clearCart: (brands?: Brand[]) => {
    const state = get();
    const defaults: Record<string, number> = {};
    if (brands && brands.length > 0) {
      brands.forEach((b) => {
        const brandName = (b.name || '').trim();
        if (!brandName) return;
        defaults[brandName] = b.is_active && b.has_discount ? Number(b.discount_percent) || 0 : 0;
      });
    } else {
      Object.assign(defaults, state.defaultBrandDiscounts);
    }
    if (defaults['Standard'] === undefined) {
      defaults['Standard'] = 0;
    }
    if (defaults['General'] === undefined) {
      defaults['General'] = 0;
    }

    set({
      items: [],
      customer_name: '',
      customer_phone: '',
      discount_percent: 0,
      defaultBrandDiscounts: defaults,
      brand_discounts: { ...defaults },
      payment_mode: 'cash',
      editingBillId: null,
      editingBillNo: null,
      editingBillCreatedAt: null,
      editingBillCreatedBy: null,
    });
  },

  cancelEdit: (brands?: Brand[]) => {
    get().clearCart(brands);
  },

  loadBillForEdit: (bill: Bill, billItems: BillItem[]) => {
    const state = get();
    const defaults: Record<string, number> = { ...state.defaultBrandDiscounts };
    if (defaults['Standard'] === undefined) {
      defaults['Standard'] = 0;
    }
    if (defaults['General'] === undefined) {
      defaults['General'] = 0;
    }

    // Populate with bill's saved brand discounts if present; fallback to default brand discount
    const mergedDiscounts: Record<string, number> = { ...defaults };
    if (bill.brand_discounts && typeof bill.brand_discounts === 'object') {
      for (const [k, v] of Object.entries(bill.brand_discounts)) {
        if (v !== undefined && v !== null) {
          mergedDiscounts[k] = Number(v) || 0;
        }
      }
    }

    // Consolidate duplicate items if any existed in the loaded bill
    const consolidated = consolidateBillItems(billItems);
    const loadedItems: CartItem[] = consolidated.map((bi) => {
      const uPrice = Number(bi.unit_price) || 0;
      const q = Number(bi.qty) || 0;
      return {
        id: bi.id || generateUUID(),
        product_id: bi.product_id || '',
        code: '',
        product_name: bi.product_name,
        brand: resolveItemBrand(bi.brand),
        unit: 'box',
        unit_price: uPrice,
        qty: q,
        line_total: Math.round(q * uPrice * 100) / 100,
        stock: 999,
      };
    });

    const calculatedPct =
      bill.subtotal > 0 ? Math.round((bill.discount / bill.subtotal) * 100) : 0;

    set({
      items: loadedItems,
      customer_name: bill.customer_name || '',
      customer_phone: bill.customer_phone || '',
      discount_percent: calculatedPct,
      brand_discounts: mergedDiscounts,
      payment_mode: bill.payment_mode,
      editingBillId: bill.id,
      editingBillNo: bill.bill_no,
      editingBillCreatedAt: bill.created_at || null,
      editingBillCreatedBy: bill.created_by || null,
    });
  },

  getTotals: () => {
    const { items, discount_percent, brand_discounts } = get();
    return calculateBillTotals(items, discount_percent, brand_discounts);
  },

  saveBill: async (currentUser: Profile) => {
    const {
      items,
      customer_name,
      customer_phone,
      payment_mode,
      brand_discounts,
      editingBillId,
      editingBillNo,
      editingBillCreatedAt,
      editingBillCreatedBy,
    } = get();

    if (items.length === 0) {
      throw new Error('Cannot save an empty bill. Add at least one item.');
    }

    // For non-admin (staff, cashier, etc.), strictly enforce that brand discounts match Admin defaults
    let effectiveBrandDiscounts = { ...brand_discounts };
    if (currentUser.role !== 'admin') {
      effectiveBrandDiscounts = { ...get().defaultBrandDiscounts };
    }

    const { subtotal, discount, total } = calculateBillTotals(items, 0, effectiveBrandDiscounts);
    const nowIso = new Date().toISOString();

    const isEditing = Boolean(editingBillId);
    const billId = editingBillId || generateUUID();
    const billNo = isEditing && editingBillNo ? editingBillNo : await generateNextBillNo();

    const billRecord: Bill = {
      id: billId,
      bill_no: billNo,
      customer_name: customer_name.trim() || null,
      customer_phone: customer_phone.trim() || null,
      subtotal,
      discount,
      total,
      payment_mode,
      created_by: isEditing && editingBillCreatedBy ? editingBillCreatedBy : currentUser.id,
      created_at: isEditing && editingBillCreatedAt ? editingBillCreatedAt : nowIso,
      updated_at: nowIso,
      sync_status: 'pending',
      brand_discounts: effectiveBrandDiscounts,
    };

    if (isEditing) {
      billRecord.edited_at = nowIso;
      billRecord.edited_by = currentUser.id;
    }

    // Consolidate duplicate items so each product only has ONE clean record
    const consolidatedItems = consolidateBillItems(items);
    const billItemsRecords: BillItem[] = consolidatedItems.map((item) => ({
      id: generateUUID(),
      bill_id: billId,
      product_id: item.product_id || null,
      product_name: item.product_name,
      brand: resolveItemBrand(item.brand),
      qty: item.qty,
      unit_price: item.unit_price,
      line_total: item.line_total,
    }));

    const outboxRecord: OutboxItem = {
      id: generateUUID(),
      entity: 'bills',
      op: isEditing ? 'update' : 'insert',
      payload: {
        ...billRecord,
        items: billItemsRecords,
      },
      status: 'pending',
      attempts: 0,
      created_at: nowIso,
    };

    // Dexie transaction: Atomic write bill + bill_items + outbox
    await db.transaction('rw', [db.bills, db.bill_items, db.outbox, db.products], async () => {
      if (isEditing) {
        // 1. Restore stock for old items that were on this bill
        const oldItems = await db.bill_items.where('bill_id').equals(billId).toArray();
        for (const oldItem of oldItems) {
          if (oldItem.product_id) {
            const prod = await db.products.get(oldItem.product_id);
            if (prod) {
              const restoredStock = prod.stock + (oldItem.qty || 0);
              await db.products.update(oldItem.product_id, { stock: restoredStock, updated_at: nowIso });
            }
          }
        }
        // 2. Delete old items for this bill in Dexie
        await db.bill_items.where('bill_id').equals(billId).delete();
      }

      await db.bills.put(billRecord);
      await db.bill_items.bulkPut(billItemsRecords);
      await db.outbox.put(outboxRecord);

      // Decrement product stock for the new items
      for (const item of billItemsRecords) {
        if (item.product_id) {
          const prod = await db.products.get(item.product_id);
          if (prod) {
            const newStock = Math.max(0, prod.stock - item.qty);
            const updatedProd: Product = { ...prod, stock: newStock, updated_at: nowIso };
            await db.products.update(item.product_id, { stock: newStock, updated_at: nowIso });
            await db.outbox.put({
              id: generateUUID(),
              entity: 'products',
              op: 'update',
              payload: updatedProd,
              status: 'pending',
              attempts: 0,
              created_at: nowIso,
            });
          }
        }
      }
    });

    // Record activity audit log
    logActivity({
      userId: currentUser?.id,
      userName: currentUser?.full_name || currentUser?.email,
      action: isEditing ? 'UPDATE' : 'INSERT',
      entity: 'bills',
      entityId: billId,
      summary: `${isEditing ? 'Edited' : 'Created'} bill ${billNo} for ₹${total} (${payment_mode.toUpperCase()})`,
      newData: billRecord,
    }).catch(console.warn);

    // Reset cart
    get().clearCart();

    // Trigger sync immediately in background
    if (navigator.onLine) {
      syncService.triggerSync().catch((err) => {
        console.warn('Immediate bill sync notice:', err);
      });
    }
    syncService.updatePendingCount().catch(console.warn);

    return { bill: billRecord, items: billItemsRecords };
  },
}));
