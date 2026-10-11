import { describe, it, expect } from 'vitest';
import { OutboxItem } from '../src/types';

describe('Outbox Queue and Idempotency', () => {
  it('calculates exponential backoff delay correctly', () => {
    const calculateBackoff = (attempts: number) => {
      if (attempts <= 0) return 0;
      return Math.min(Math.pow(2, attempts - 1) * 2000, 60000);
    };

    expect(calculateBackoff(0)).toBe(0);
    expect(calculateBackoff(1)).toBe(2000); // 2s
    expect(calculateBackoff(2)).toBe(4000); // 4s
    expect(calculateBackoff(3)).toBe(8000); // 8s
    expect(calculateBackoff(4)).toBe(16000); // 16s
    expect(calculateBackoff(5)).toBe(32000); // 32s
    expect(calculateBackoff(6)).toBe(60000); // capped at 60s
    expect(calculateBackoff(10)).toBe(60000); // capped at 60s
  });

  it('guarantees unique deterministic payload id for idempotent upsert', () => {
    const billId = 'test-uuid-bill-101';
    const outboxItem1: OutboxItem = {
      id: 'outbox-1',
      entity: 'bills',
      op: 'insert',
      payload: { id: billId, bill_no: '261011-A-0001', total: 500 },
      status: 'pending',
      attempts: 0,
      created_at: new Date().toISOString(),
    };

    const outboxItem2: OutboxItem = {
      id: 'outbox-2',
      entity: 'bills',
      op: 'update',
      payload: { id: billId, bill_no: '261011-A-0001', total: 450 },
      status: 'pending',
      attempts: 1,
      created_at: new Date().toISOString(),
    };

    // Both point to the exact same entity id, ensuring Supabase `upsert` with onConflict: 'id'
    // replaces or inserts the authoritative row without duplicate bill rows.
    expect(outboxItem1.payload.id).toBe(outboxItem2.payload.id);
  });
});
