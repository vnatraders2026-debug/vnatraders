-- =========================================================================
-- Supabase Migration: Multi-Company Management & Stock System Setup
-- Run this directly in Supabase SQL Editor.
-- Safe to re-run multiple times (fully idempotent).
-- =========================================================================

-- ─── 1. CREATE COMPANIES TABLE IF NOT EXISTS ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    trade_name TEXT,
    gstin TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT DEFAULT 'Hosur',
    state TEXT DEFAULT 'Tamil Nadu',
    state_code VARCHAR(10) DEFAULT '33',
    pincode TEXT DEFAULT '635109',
    bank_name TEXT,
    bank_account_no TEXT,
    bank_ifsc TEXT,
    bank_branch TEXT,
    upi_id TEXT,
    receipt_footer TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Ensure all new columns exist even if table was created in an earlier partial run
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS state_code VARCHAR(10) DEFAULT '33';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Indexes for Companies
CREATE INDEX IF NOT EXISTS idx_companies_is_default ON public.companies (is_default);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON public.companies (is_active);

-- ─── 2. RLS & ACCESS POLICIES FOR COMPANIES ──────────────────────────────
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.companies;
CREATE POLICY "Allow all for authenticated users" ON public.companies
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON public.companies;
CREATE POLICY "Allow all for anon" ON public.companies
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── 3. LINK ERP TABLES TO COMPANIES ─────────────────────────────────────

-- A. Profiles (Users)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- B. Products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_company_id ON public.products(company_id);

-- C. Clients / Vendors
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_company_id ON public.clients(company_id);

-- D. Bills
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bills_company_id ON public.bills(company_id);

-- E. Sale Orders
ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sale_orders_company_id ON public.sale_orders(company_id);

-- F. Purchase Orders
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON public.purchase_orders(company_id);

-- G. Quotations
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_company_id ON public.quotations(company_id);

-- H. Invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id);

-- I. Stock Movements Ledger
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_id ON public.stock_movements(company_id);

-- J. Transport Entries
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'transport_entries') THEN
        ALTER TABLE public.transport_entries ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_transport_entries_company_id ON public.transport_entries(company_id);
    END IF;
END $$;

-- ─── 4. SEED DEFAULT FIRMS / COMPANIES ───────────────────────────────────

-- Primary Firm: VNA TRADERS
INSERT INTO public.companies (
    id,
    name,
    trade_name,
    gstin,
    phone,
    email,
    address,
    city,
    state,
    state_code,
    pincode,
    bank_name,
    bank_account_no,
    bank_ifsc,
    bank_branch,
    upi_id,
    receipt_footer,
    is_default,
    is_active,
    created_at,
    updated_at
) VALUES (
    'c1111111-1111-1111-1111-111111110001',
    'VNA TRADERS',
    'VNA Crackers & Fireworks Wholesale',
    '33ACSPV5299F1Z5',
    '+91 94431 23456',
    'vnatraders2026@gmail.com',
    'Jeermangalam, Hosur',
    'Hosur',
    'Tamil Nadu',
    '33',
    '635109',
    'State Bank of India',
    '38421098451',
    'SBIN0001234',
    'Hosur Main Branch',
    '9443123456@sbi',
    'Thank you for choosing VNA Traders! Wishing you a bright and safe celebration.',
    true,
    true,
    timezone('utc', now()),
    timezone('utc', now())
)
ON CONFLICT (id) DO UPDATE SET
    trade_name   = EXCLUDED.trade_name,
    gstin        = EXCLUDED.gstin,
    phone        = EXCLUDED.phone,
    email        = EXCLUDED.email,
    address      = EXCLUDED.address,
    city         = EXCLUDED.city,
    state        = EXCLUDED.state,
    state_code   = EXCLUDED.state_code,
    pincode      = EXCLUDED.pincode,
    bank_name    = EXCLUDED.bank_name,
    bank_account_no = EXCLUDED.bank_account_no,
    bank_ifsc    = EXCLUDED.bank_ifsc,
    bank_branch  = EXCLUDED.bank_branch,
    upi_id       = EXCLUDED.upi_id,
    receipt_footer = EXCLUDED.receipt_footer,
    is_default   = EXCLUDED.is_default,
    is_active    = EXCLUDED.is_active,
    updated_at   = timezone('utc', now());

-- Secondary Firm: SRI BALAJI FIREWORKS
INSERT INTO public.companies (
    id,
    name,
    trade_name,
    gstin,
    phone,
    email,
    address,
    city,
    state,
    state_code,
    pincode,
    bank_name,
    bank_account_no,
    bank_ifsc,
    bank_branch,
    upi_id,
    receipt_footer,
    is_default,
    is_active,
    created_at,
    updated_at
) VALUES (
    'c2222222-2222-2222-2222-222222220002',
    'SRI BALAJI FIREWORKS',
    'Sri Balaji Crackers & Fancy Novelties',
    '33AABCS1234F1Z9',
    '+91 98421 98765',
    'sribalajifireworks.hosur@gmail.com',
    '45, Denkanikottai Road, Shanthi Nagar',
    'Hosur',
    'Tamil Nadu',
    '33',
    '635109',
    'HDFC Bank',
    '50200012345678',
    'HDFC0000456',
    'Hosur SIPCOT Branch',
    'sribalajicrackers@hdfcbank',
    'Thank you for shopping at Sri Balaji Fireworks! Light up your life with happiness.',
    false,
    true,
    timezone('utc', now()),
    timezone('utc', now())
)
ON CONFLICT (id) DO UPDATE SET
    trade_name   = EXCLUDED.trade_name,
    gstin        = EXCLUDED.gstin,
    phone        = EXCLUDED.phone,
    email        = EXCLUDED.email,
    address      = EXCLUDED.address,
    city         = EXCLUDED.city,
    state        = EXCLUDED.state,
    state_code   = EXCLUDED.state_code,
    pincode      = EXCLUDED.pincode,
    bank_name    = EXCLUDED.bank_name,
    bank_account_no = EXCLUDED.bank_account_no,
    bank_ifsc    = EXCLUDED.bank_ifsc,
    bank_branch  = EXCLUDED.bank_branch,
    upi_id       = EXCLUDED.upi_id,
    receipt_footer = EXCLUDED.receipt_footer,
    is_default   = EXCLUDED.is_default,
    is_active    = EXCLUDED.is_active,
    updated_at   = timezone('utc', now());

-- ─── 5. SAFE BACKFILL FOR EXISTING RECORDS ───────────────────────────────
-- Associates legacy unassigned records to primary firm VNA TRADERS
UPDATE public.products       SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE public.clients        SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE public.bills          SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE public.sale_orders    SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE public.purchase_orders SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE public.quotations     SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE public.invoices       SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE public.stock_movements SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'transport_entries') THEN
        UPDATE public.transport_entries SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
    END IF;
END $$;
