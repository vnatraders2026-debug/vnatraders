-- =========================================================================
-- Supabase Migration 019: Transportation & Logistics Tracking Module
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create public.transport_entries table
CREATE TABLE IF NOT EXISTS public.transport_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lr_no TEXT NOT NULL,
    transport_name TEXT NOT NULL,
    vehicle_no TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    estimated_delivery_date DATE,
    actual_delivery_date DATE,
    destination TEXT NOT NULL,
    source_location TEXT DEFAULT 'Hosur, Tamil Nadu',
    
    -- Linked Records (Sale Orders / Invoices / Clients)
    so_id UUID,
    so_no TEXT,
    invoice_id UUID,
    invoice_no TEXT,
    client_id UUID,
    consignee_name TEXT NOT NULL,
    consignee_phone TEXT,
    consignee_address TEXT,
    consignee_gstin TEXT,
    
    -- Cargo / Boxes Details
    total_boxes INTEGER NOT NULL DEFAULT 1 CHECK (total_boxes >= 0),
    total_weight_kg NUMERIC(10, 2) DEFAULT 0,
    consignment_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    items_summary TEXT,
    
    -- Freight & Payment Details
    freight_type TEXT NOT NULL DEFAULT 'to_pay' CHECK (freight_type IN ('to_pay', 'paid', 'tbb', 'free_delivery')),
    freight_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    loading_charges NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_charges NUMERIC(10, 2) NOT NULL DEFAULT 0,
    
    -- Status & Tracking
    status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled')),
    delivery_remarks TEXT,
    dispatched_by TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_transport_entries_lr_no ON public.transport_entries (lr_no);
CREATE INDEX IF NOT EXISTS idx_transport_entries_transport_name ON public.transport_entries (transport_name);
CREATE INDEX IF NOT EXISTS idx_transport_entries_status ON public.transport_entries (status);
CREATE INDEX IF NOT EXISTS idx_transport_entries_dispatch_date ON public.transport_entries (dispatch_date);
CREATE INDEX IF NOT EXISTS idx_transport_entries_destination ON public.transport_entries (destination);
CREATE INDEX IF NOT EXISTS idx_transport_entries_so_id ON public.transport_entries (so_id);
CREATE INDEX IF NOT EXISTS idx_transport_entries_client_id ON public.transport_entries (client_id);
CREATE INDEX IF NOT EXISTS idx_transport_entries_created_at ON public.transport_entries (created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.transport_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on transport_entries" ON public.transport_entries;
CREATE POLICY "Allow all on transport_entries" ON public.transport_entries
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- 4. Enable Realtime Replication for Instant Warehouse Dispatch Sync
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.transport_entries;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

