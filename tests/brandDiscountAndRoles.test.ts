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
});

