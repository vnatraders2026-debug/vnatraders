import { create } from 'zustand';
import { Product, PaymentMode, Bill, BillItem, OutboxItem, Profile } from '@/types';
import { calculateBillTotals } from '@/lib/format';
import { db, generateNextBillNo } from '@/db';
import { syncService } from '@/sync/syncService';

export interface CartItem {
  id: string; // client temporary or bill_item id
  product_id: string;
  code: string;
  product_name: string;
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
  discount: number;
  payment_mode: PaymentMode;
  editingBillId: string | null;
  editingBillNo: string | null;

  // Actions
  addItem: (product: Product, quantity?: number) => void;
  updateQty: (itemId: string, qty: number) => void;
  updatePrice: (itemId: string, unit_price: number) => void;
  removeItem: (itemId: string) => void;
  setCustomerName: (name: string) => void;
  setCustomerPhone: (phone: string) => void;
  setDiscount: (discount: number) => void;
  setPaymentMode: (mode: PaymentMode) => void;
  clearCart: () => void;
  loadBillForEdit: (bill: Bill, items: BillItem[]) => void;

  // Derived totals
  getTotals: () => { subtotal: number; discount: number; total: number };

  // Save bill
  saveBill: (currentUser: Profile) => Promise<{ bill: Bill; items: BillItem[] }>;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customer_name: '',
  customer_phone: '',
  discount: 0,
  payment_mode: 'cash',
  editingBillId: null,
  editingBillNo: null,

  addItem: (product: Product, quantity: number = 1) => {
    set((state) => {
      const existingIndex = state.items.findIndex((item) => item.product_id === product.id);
      if (existingIndex > -1) {
        const updatedItems = [...state.items];
        const existing = updatedItems[existingIndex];
        const newQty = existing.qty + quantity;
        updatedItems[existingIndex] = {
          ...existing,
          qty: newQty,
          line_total: Math.round(newQty * existing.unit_price * 100) / 100,
        };
        return { items: updatedItems };
      } else {
        const newItem: CartItem = {
          id: crypto.randomUUID(),
          product_id: product.id,
          code: product.code,
          product_name: product.name,
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
  setDiscount: (discount: number) => set({ discount: Math.max(0, discount) }),
  setPaymentMode: (mode: PaymentMode) => set({ payment_mode: mode }),

  clearCart: () =>
    set({
      items: [],
      customer_name: '',
      customer_phone: '',
      discount: 0,
      payment_mode: 'cash',
      editingBillId: null,
      editingBillNo: null,
    }),

  loadBillForEdit: (bill: Bill, billItems: BillItem[]) => {
    const loadedItems: CartItem[] = billItems.map((bi) => ({
      id: bi.id,
      product_id: bi.product_id || '',
      code: '',
      product_name: bi.product_name,
      unit: 'box',
      unit_price: bi.unit_price,
      qty: bi.qty,
      line_total: bi.line_total,
      stock: 999,
    }));

    set({
      items: loadedItems,
      customer_name: bill.customer_name || '',
      customer_phone: bill.customer_phone || '',
      discount: bill.discount,
      payment_mode: bill.payment_mode,
      editingBillId: bill.id,
      editingBillNo: bill.bill_no,
    });
  },

  getTotals: () => {
    const { items, discount } = get();
    return calculateBillTotals(items, discount);
  },

  saveBill: async (currentUser: Profile) => {
    const {
      items,
      customer_name,
      customer_phone,
      payment_mode,
      editingBillId,
      editingBillNo,
    } = get();

    if (items.length === 0) {
      throw new Error('Cannot save an empty bill. Add at least one item.');
    }

    const { subtotal, discount, total } = get().getTotals();
    const nowIso = new Date().toISOString();

    const isEditing = Boolean(editingBillId);
    const billId = editingBillId || crypto.randomUUID();
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
      created_by: currentUser.id,
      created_at: nowIso,
      updated_at: nowIso,
      sync_status: 'pending',
    };

    if (isEditing) {
      billRecord.edited_at = nowIso;
      billRecord.edited_by = currentUser.id;
    }

    const billItemsRecords: BillItem[] = items.map((item) => ({
      id: crypto.randomUUID(),
      bill_id: billId,
      product_id: item.product_id || null,
      product_name: item.product_name,
      qty: item.qty,
      unit_price: item.unit_price,
      line_total: item.line_total,
    }));

    const outboxRecord: OutboxItem = {
      id: crypto.randomUUID(),
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
        // Delete old items for this bill first
        await db.bill_items.where('bill_id').equals(billId).delete();
      }
      await db.bills.put(billRecord);
      await db.bill_items.bulkPut(billItemsRecords);
      await db.outbox.put(outboxRecord);

      // Decrement local product stock
      for (const item of items) {
        if (item.product_id) {
          const prod = await db.products.get(item.product_id);
          if (prod) {
            const newStock = Math.max(0, prod.stock - item.qty);
            await db.products.update(item.product_id, { stock: newStock });
          }
        }
      }
    });

    // Reset cart
    get().clearCart();

    // Trigger sync in background without waiting
    syncService.updatePendingCount().then(() => {
      if (navigator.onLine) {
        syncService.triggerSync();
      }
    });

    return { bill: billRecord, items: billItemsRecords };
  },
}));
