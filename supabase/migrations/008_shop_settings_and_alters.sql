-- =========================================================================
-- Migration 008: Shop Settings Table, Schema Alterations & Update Query
-- Run this in your Supabase Project -> SQL Editor
-- =========================================================================

-- -------------------------------------------------------------------------
-- PART 1: ALTER TABLE STATEMENTS (Ensuring all required columns exist)
-- -------------------------------------------------------------------------

-- 1. Ensure brand_discounts JSONB exists on public.bills
ALTER TABLE public.bills 
  ADD COLUMN IF NOT EXISTS brand_discounts JSONB DEFAULT '{}'::jsonb;

-- 2. Ensure brand column exists on public.bill_items
ALTER TABLE public.bill_items 
  ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT 'General';

-- 3. Ensure brand column exists on public.products
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'Standard';

-- -------------------------------------------------------------------------
-- PART 2: CREATE public.shop_settings TABLE
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shop_settings (
    key TEXT PRIMARY KEY DEFAULT 'shop_settings',
    shop_name TEXT NOT NULL DEFAULT 'VNA Crackers',
    shop_address TEXT NOT NULL DEFAULT '142 Kakkan Road, Sivakasi, Tamil Nadu - 626123',
    shop_phone TEXT NOT NULL DEFAULT '+91 94431 23456',
    gst_no TEXT DEFAULT '33VNACK0000A1Z5',
    receipt_footer TEXT DEFAULT 'Thank you for choosing VNA Crackers! Wishing you a bright and safe celebration.',
    paper_size TEXT NOT NULL DEFAULT '80mm' CHECK (paper_size IN ('80mm', '58mm', 'a4')),
    auto_print BOOLEAN NOT NULL DEFAULT true,
    device_code TEXT DEFAULT 'A',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

-- Allow all active terminals / users to view settings
DROP POLICY IF EXISTS "Allow active users to read shop settings" ON public.shop_settings;
CREATE POLICY "Allow active users to read shop settings"
    ON public.shop_settings FOR SELECT
    USING (true);

-- Allow authenticated users / admins to insert or update shop settings
DROP POLICY IF EXISTS "Allow authenticated users to upsert shop settings" ON public.shop_settings;
CREATE POLICY "Allow authenticated users to upsert shop settings"
    ON public.shop_settings FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow anon to read and update if needed for standalone terminals
DROP POLICY IF EXISTS "Allow anon read shop settings" ON public.shop_settings;
CREATE POLICY "Allow anon read shop settings"
    ON public.shop_settings FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "Allow anon update shop settings" ON public.shop_settings;
CREATE POLICY "Allow anon update shop settings"
    ON public.shop_settings FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon insert shop settings" ON public.shop_settings;
CREATE POLICY "Allow anon insert shop settings"
    ON public.shop_settings FOR INSERT
    TO anon
    WITH CHECK (true);

-- -------------------------------------------------------------------------
-- PART 3: INSERT OR UPDATE DEFAULT SHOP SETTINGS
-- (Edit the values below to customize your shop details)
-- -------------------------------------------------------------------------

INSERT INTO public.shop_settings (
    key,
    shop_name,
    shop_address,
    shop_phone,
    gst_no,
    receipt_footer,
    paper_size,
    auto_print,
    device_code,
    updated_at
)
VALUES (
    'shop_settings',
    'VNA CRACKERS',                                           -- CHANGE SHOP NAME HERE
    'Jeermangalam, Hosur, Tamil Nadu - 635109',               -- CHANGE ADDRESS HERE
    '+91 94431 23456',                                        -- CHANGE PHONE HERE
    '33ACSPV5299F1Z5',                                        -- CHANGE GST NUMBER HERE
    'Thank you for choosing VNA Crackers! Wishing you a bright and safe celebration.', -- RECEIPT FOOTER
    '80mm',                                                   -- '80mm' or '58mm'
    true,                                                     -- true for auto-print on save
    'A',
    now()
)
ON CONFLICT (key) DO UPDATE SET
    shop_name = EXCLUDED.shop_name,
    shop_address = EXCLUDED.shop_address,
    shop_phone = EXCLUDED.shop_phone,
    gst_no = EXCLUDED.gst_no,
    receipt_footer = EXCLUDED.receipt_footer,
    paper_size = EXCLUDED.paper_size,
    auto_print = EXCLUDED.auto_print,
    updated_at = now();

-- -------------------------------------------------------------------------
-- QUICK UPDATE TEMPLATES (Run these anytime to change individual fields):
-- -------------------------------------------------------------------------

-- Example 1: Update only Shop Name:
-- UPDATE public.shop_settings SET shop_name = 'VNA CRACKERS SIVAKASI', updated_at = now() WHERE key = 'shop_settings';

-- Example 2: Update Shop Phone & Address:
-- UPDATE public.shop_settings SET shop_phone = '+91 98765 43210', shop_address = 'Hosur Main Road, Tamil Nadu', updated_at = now() WHERE key = 'shop_settings';

-- Example 3: Update GST Number:
-- UPDATE public.shop_settings SET gst_no = '33ABCDE1234F1Z5', updated_at = now() WHERE key = 'shop_settings';
