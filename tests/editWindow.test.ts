import { describe, it, expect } from 'vitest';
import { checkBillEditPermission, formatRemainingTime, TEN_MINUTES_MS } from '../src/lib/permissions';
import { Bill, Profile } from '../src/types';

describe('10-Minute Edit Window Permissions', () => {
  const staffUser: Profile = {
    id: 'staff-123',
    full_name: 'Rajesh Staff',
    role: 'staff',
    is_active: true,
  };

  const otherStaffUser: Profile = {
    id: 'staff-999',
    full_name: 'Other Staff',
    role: 'staff',
    is_active: true,
  };

  const adminUser: Profile = {
    id: 'admin-456',
    full_name: 'Store Admin',
    role: 'admin',
    is_active: true,
  };

  const baseBill: Bill = {
    id: 'bill-001',
    bill_no: '261011-A-0001',
    subtotal: 500,
    discount: 0,
    total: 500,
    payment_mode: 'cash',
    created_by: 'staff-123',
    created_at: new Date('2026-10-11T12:00:00Z').toISOString(),
    updated_at: new Date('2026-10-11T12:00:00Z').toISOString(),
  };

  it('allows staff to edit bill within 10 minutes of creation', () => {
    const fiveMinutesLater = new Date('2026-10-11T12:05:00Z').getTime();
    const result = checkBillEditPermission(baseBill, staffUser, fiveMinutesLater);

    expect(result.canEdit).toBe(true);
    expect(result.remainingMs).toBe(5 * 60 * 1000);
    expect(formatRemainingTime(result.remainingMs)).toBe('Edit window: 05:00 left');
  });

  it('blocks staff from editing bill after 10 minutes has passed', () => {
    const elevenMinutesLater = new Date('2026-10-11T12:11:00Z').getTime();
    const result = checkBillEditPermission(baseBill, staffUser, elevenMinutesLater);

    expect(result.canEdit).toBe(false);
    expect(result.remainingMs).toBe(0);
    expect(result.reason).toBe('Edit window closed');
    expect(formatRemainingTime(result.remainingMs)).toBe('Edit window closed');
  });

  it('blocks staff who did not create the bill even inside 10 minutes', () => {
    const twoMinutesLater = new Date('2026-10-11T12:02:00Z').getTime();
    const result = checkBillEditPermission(baseBill, otherStaffUser, twoMinutesLater);

    expect(result.canEdit).toBe(false);
    expect(result.reason).toBe('Only the staff member who created this bill can edit it');
  });

  it('allows admin to edit bill at any time, even days later', () => {
    const fiveDaysLater = new Date('2026-10-16T12:00:00Z').getTime();
    const result = checkBillEditPermission(baseBill, adminUser, fiveDaysLater);

    expect(result.canEdit).toBe(true);
    expect(result.remainingMs).toBe(Infinity);
    expect(formatRemainingTime(result.remainingMs)).toBe('Admin edit allowed');
  });

  it('blocks inactive users from editing', () => {
    const inactiveAdmin: Profile = { ...adminUser, is_active: false };
    const twoMinutesLater = new Date('2026-10-11T12:02:00Z').getTime();
    const result = checkBillEditPermission(baseBill, inactiveAdmin, twoMinutesLater);

    expect(result.canEdit).toBe(false);
  });
});
