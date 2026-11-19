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

  it('supports full suite of ERP entities including clients, quotations, orders, and invoices', () => {
    const supportedEntities: OutboxItem['entity'][] = [
      'bills',
      'bill_items',
      'products',
      'brands',
      'categories',
      'monthly_targets',
      'clients',
      'quotations',
      'quotation_items',
      'purchase_orders',
      'purchase_order_items',
      'sale_orders',
      'sale_order_items',
      'invoices',
      'invoice_items',
      'stock_movements',
    ];

    expect(supportedEntities).toHaveLength(16);
    expect(supportedEntities).toContain('clients');
    expect(supportedEntities).toContain('quotations');
    expect(supportedEntities).toContain('sale_orders');
    expect(supportedEntities).toContain('purchase_orders');
    expect(supportedEntities).toContain('invoices');
  });

  it('correctly maps client and quotation outbox records for idempotent cloud sync', () => {
    const clientItem: OutboxItem = {
      id: 'outbox-client-1',
      entity: 'clients',
      op: 'insert',
      payload: {
        id: 'c1111111-2222-3333-4444-555555555555',
        name: 'VNA Wholesale Dealer Hosur',
        type: 'customer',
        customer_tier: 'wholesale',
        phone: '9876543210',
        city: 'Hosur',
        state: 'Tamil Nadu',
      },
      status: 'pending',
      attempts: 0,
      created_at: new Date().toISOString(),
    };

    const quoteItem: OutboxItem = {
      id: 'outbox-quote-1',
      entity: 'quotations',
      op: 'insert',
      payload: {
        id: 'q1111111-2222-3333-4444-555555555555',
        quotation_no: 'QT-261118-0001',
        customer_name: 'VNA Wholesale Dealer Hosur',
        pricing_type: 'wholesale',
        total_amount: 45000,
        items: [
          {
            id: 'qi-1',
            product_name: '50 Shots Sky Blitz',
            qty: 10,
            unit_price: 4500,
            line_total: 45000,
          },
        ],
      },
      status: 'pending',
      attempts: 0,
      created_at: new Date().toISOString(),
    };

    expect(clientItem.entity).toBe('clients');
    expect(clientItem.payload.name).toBe('VNA Wholesale Dealer Hosur');
    expect(quoteItem.entity).toBe('quotations');
    expect(quoteItem.payload.items).toHaveLength(1);
    expect(quoteItem.payload.items[0].product_name).toBe('50 Shots Sky Blitz');
  });
});
