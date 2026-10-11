import { Bill, Profile } from '@/types';

export const TEN_MINUTES_MS = 10 * 60 * 1000;

export function isAdmin(profile?: Profile | null): boolean {
  return profile?.role === 'admin' && profile?.is_active === true;
}

export function isStaff(profile?: Profile | null): boolean {
  return profile?.role === 'staff' && profile?.is_active === true;
}

export interface BillEditPermission {
  canEdit: boolean;
  remainingMs: number;
  reason?: string;
}

/**
 * Checks if a user is allowed to edit a bill.
 * Admins can edit anytime.
 * Staff can edit ONLY if they created it AND it is within 10 minutes of its creation time.
 */
export function checkBillEditPermission(
  bill: Bill,
  profile?: Profile | null,
  currentTimeMs: number = Date.now()
): BillEditPermission {
  if (!profile || !profile.is_active) {
    return {
      canEdit: false,
      remainingMs: 0,
      reason: 'User account is inactive or not logged in',
    };
  }

  // Admin can edit any bill at any time
  if (profile.role === 'admin') {
    return {
      canEdit: true,
      remainingMs: Infinity,
    };
  }

  // Staff check: creator match
  if (bill.created_by !== profile.id) {
    return {
      canEdit: false,
      remainingMs: 0,
      reason: 'Only the staff member who created this bill can edit it',
    };
  }

  // 10-minute window check
  const createdAtMs = new Date(bill.created_at).getTime();
  if (isNaN(createdAtMs)) {
    return {
      canEdit: false,
      remainingMs: 0,
      reason: 'Invalid creation timestamp',
    };
  }

  const elapsed = currentTimeMs - createdAtMs;
  const remaining = TEN_MINUTES_MS - elapsed;

  if (remaining <= 0) {
    return {
      canEdit: false,
      remainingMs: 0,
      reason: 'Edit window closed',
    };
  }

  return {
    canEdit: true,
    remainingMs: remaining,
  };
}

/**
 * Formats countdown string: e.g. "Edit window: 07:42 left" or "Edit window closed"
 */
export function formatRemainingTime(remainingMs: number): string {
  if (remainingMs === Infinity) {
    return 'Admin edit allowed';
  }
  if (remainingMs <= 0) {
    return 'Edit window closed';
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `Edit window: ${mm}:${ss} left`;
}
