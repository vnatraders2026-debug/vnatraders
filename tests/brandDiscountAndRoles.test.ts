import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../src/features/billing/store';
import { Brand, Product, Profile, Bill } from '../src/types';
import { checkBillEditPermission, canModifyDiscounts, canViewAnalytics } from '../src/lib/permissions';

describe('Brand Discounts and Role Permission Verification', () => {
  const admin: Profile = { id: 'admin-1', full_name: 'Admin', role: 'admin', is_active: true };
  const manager: Profile = { id: 'mgr-1', full_name: 'Manager', role: 'manager', is_active: true };
  const supervisor: Profile = { id: 'sup-1', full_name: 'Supervisor', role: 'supervisor', is_active: true };
  const cashier: Profile = { id: 'csh-1', full_name: 'Cashier', role: 'cashier', is_active: true };
  const staff: Profile = { id: 'stf-1', full_name: 'Staff', role: 'staff', is_active: true };

  const testBrands: Brand[] = [
    { id: 'b-std', name: 'Standard', has_discount: true, discount_percent: 70, max_discount: 80, is_active: true },
    { id: 'b-gen', name: 'General', has_discount: false, discount_percent: 0, max_discount: 0, is_active: true },
  ];

  beforeEach(() => {
    useCartStore.getState().clearCart(testBrands);
  });

  it('initializes with default brand discounts (Standard 70%)', () => {
    const store = useCartStore.getState();
    expect(store.brand_discounts['Standard']).toBe(70);
  });

  it('retains default brand discounts even after clearing cart', () => {
    // Add item and clear cart without arguments
    useCartStore.getState().clearCart();
    const store = useCartStore.getState();
    // Default 70% for Standard must NOT be wiped to 0 or undefined
    expect(store.brand_discounts['Standard']).toBe(70);
  });

  it('applies 70% discount to Standard products automatically', () => {
    const standardProd: Product = {
      id: 'prod-1',
      code: 'ST100',
      name: 'Standard 28 Chorsa',
      category: 'Sound Crackers',
      brand: 'Standard',
      unit: 'box',
      price: 1000,
      stock: 50,
      is_active: true,
    };

    useCartStore.getState().addItem(standardProd, 1);
    const totals = useCartStore.getState().getTotals();

    expect(totals.subtotal).toBe(1000);
    expect(totals.discount).toBe(700); // 70% discount
    expect(totals.total).toBe(300);    // Net 300
    expect(totals.brandTotals['Standard'].discountPercent).toBe(70);
  });

  it('defaults cracker items with empty brand to Standard and gives 70% discount', () => {
    const crackerNoBrand: Product = {
      id: 'prod-2',
      code: 'SP001',
      name: '10 cm Electric Sparklers',
      category: 'Sparklers',
      brand: '', // missing brand
      unit: 'box',
      price: 500,
      stock: 100,
      is_active: true,
    };

    useCartStore.getState().addItem(crackerNoBrand, 2); // 1000 subtotal
    const totals = useCartStore.getState().getTotals();

    expect(totals.subtotal).toBe(1000);
    expect(totals.discount).toBe(700); // Automatically resolved to Standard -> 70% discount
    expect(totals.total).toBe(300);
  });

  it('verifies analytical and permission access for all 5 roles', () => {
    // 1. Discount modification (Admin only custom discount additions)
    expect(canModifyDiscounts(admin)).toBe(true);
    expect(canModifyDiscounts(manager)).toBe(false);
    expect(canModifyDiscounts(cashier)).toBe(false);
    expect(canModifyDiscounts(staff)).toBe(false);

    // 2. Analytical pages (Dashboard, Reports: Admin, Manager, Supervisor)
    expect(canViewAnalytics(admin)).toBe(true);
    expect(canViewAnalytics(manager)).toBe(true);
    expect(canViewAnalytics(supervisor)).toBe(true);
    expect(canViewAnalytics(cashier)).toBe(false);
    expect(canViewAnalytics(staff)).toBe(false);

    // 3. Unlimited bill editing (Admin, Manager, Supervisor)
    const oldBill: Bill = {
      id: 'bill-old',
      bill_no: '261001-A-0001',
      subtotal: 1000,
      discount: 700,
      total: 300,
      payment_mode: 'cash',
      created_by: 'staff-other',
      created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    };

    expect(checkBillEditPermission(oldBill, admin).canEdit).toBe(true);
    expect(checkBillEditPermission(oldBill, manager).canEdit).toBe(true);
    expect(checkBillEditPermission(oldBill, supervisor).canEdit).toBe(true);
    expect(checkBillEditPermission(oldBill, cashier).canEdit).toBe(false); // Expired
    expect(checkBillEditPermission(oldBill, staff).canEdit).toBe(false);   // Expired
  });

  it('correctly loads a bill for editing and calculates discounts accurately', () => {
    const billToEdit: Bill = {
      id: 'bill-edit-1',
      bill_no: '261106-A-0005',
      subtotal: 1000,
      discount: 700,
      total: 300,
      payment_mode: 'upi',
      created_by: 'staff-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      brand_discounts: { Standard: 70 },
    };

    const billItems = [
      {
        id: 'bi-1',
        bill_id: 'bill-edit-1',
        product_id: 'prod-1',
        product_name: 'Standard 28 Chorsa',
        brand: 'Standard',
        qty: 1,
        unit_price: 1000,
        line_total: 1000,
      },
    ];

    useCartStore.getState().loadBillForEdit(billToEdit, billItems);
    const store = useCartStore.getState();

    expect(store.editingBillId).toBe('bill-edit-1');
    expect(store.editingBillNo).toBe('261106-A-0005');
    expect(store.payment_mode).toBe('upi');
    expect(store.brand_discounts['Standard']).toBe(70);

    const totals = store.getTotals();
    expect(totals.subtotal).toBe(1000);
    expect(totals.discount).toBe(700);
    expect(totals.total).toBe(300);

    // Cancel edit should clear editing state
    useCartStore.getState().cancelEdit();
    const cleanStore = useCartStore.getState();
    expect(cleanStore.editingBillId).toBeNull();
    expect(cleanStore.editingBillNo).toBeNull();
    expect(cleanStore.items.length).toBe(0);
  });

  it('strictly applies dynamic Admin-configured brand discounts (e.g. Standard 40% Max 50%)', () => {
    // Admin configures Standard with 40% and Net with 15%
    const adminConfiguredBrands: Brand[] = [
      { id: 'b-1', name: 'Standard', has_discount: true, discount_percent: 40, max_discount: 50, is_active: true },
      { id: 'b-2', name: 'General', has_discount: false, discount_percent: 0, max_discount: 0, is_active: true },
      { id: 'b-3', name: 'Net', has_discount: true, discount_percent: 15, max_discount: 20, is_active: true },
    ];

    useCartStore.getState().initializeBrandDiscounts(adminConfiguredBrands, true);
    const store = useCartStore.getState();

    // Verify discounts accurately reflect Admin configuration
    expect(store.defaultBrandDiscounts['Standard']).toBe(40);
    expect(store.brand_discounts['Standard']).toBe(40);
    expect(store.defaultBrandDiscounts['Net']).toBe(15);
    expect(store.brand_discounts['Net']).toBe(15);
    expect(store.brand_discounts['General']).toBe(0);

    // Add 1 Standard item (₹1,000) and 1 Net item (₹1,000)
    useCartStore.getState().addItem({
      id: 'p-std',
      code: 'ST1',
      name: 'Standard Cracker',
      category: 'Sound Crackers',
      brand: 'Standard',
      unit: 'box',
      price: 1000,
      stock: 10,
      is_active: true,
    });

    useCartStore.getState().addItem({
      id: 'p-net',
      code: 'NET1',
      name: 'Net Sparkler',
      category: 'Sparklers',
      brand: 'Net',
      unit: 'box',
      price: 1000,
      stock: 10,
      is_active: true,
    });

    const totals = useCartStore.getState().getTotals();
    // Subtotal: 2000
    // Standard discount: 40% of 1000 = 400
    // Net discount: 15% of 1000 = 150
    // Total discount: 550
    // Net total: 1450
    expect(totals.subtotal).toBe(2000);
    expect(totals.discount).toBe(550);
    expect(totals.total).toBe(1450);
    expect(totals.brandTotals['Standard'].discount).toBe(400);
    expect(totals.brandTotals['Net'].discount).toBe(150);
  });
});

