-- =========================================================================
-- Supabase Migration 017: Comprehensive Sync Tables & Permissions
-- Ensures all ERP tables (clients, quotations, quotation_items,
-- purchase_orders, purchase_order_items, sale_orders, sale_order_items,
-- invoices, invoice_items, stock_movements) exist and have full
-- permissions for seamless multi-device synchronization.
-- =========================================================================

-- 1. Ensure wholesale_price and min_stock on products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS min_stock NUMERIC(10, 2) DEFAULT 20;

-- 2. Clients Table
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company_name TEXT,
    type TEXT NOT NULL CHECK (type IN ('customer', 'supplier', 'both')),
    customer_tier TEXT DEFAULT 'wholesale' CHECK (customer_tier IN ('wholesale', 'retail')),
    phone TEXT NOT NULL,
    email TEXT,
    gstin TEXT,
    address TEXT,
    city TEXT DEFAULT 'Hosur',
    state TEXT DEFAULT 'Tamil Nadu',
    pincode TEXT DEFAULT '635109',
    credit_limit NUMERIC(12, 2) DEFAULT 0,
    outstanding_balance NUMERIC(12, 2) DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients (phone);
CREATE INDEX IF NOT EXISTS idx_clients_type ON public.clients (type);

-- 3. Quotations Table & Items
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_no TEXT NOT NULL UNIQUE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT,
    customer_gstin TEXT,
    pricing_type TEXT NOT NULL DEFAULT 'wholesale' CHECK (pricing_type IN ('wholesale', 'retail')),
    quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'converted', 'expired', 'rejected')),
    converted_to TEXT CHECK (converted_to IN ('sale_order', 'invoice')),
    converted_id TEXT,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
    cgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    igst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    round_off NUMERIC(8, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    terms_and_conditions TEXT,
    notes TEXT,
    created_by TEXT NOT NULL DEFAULT 'Staff',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_quotations_no ON public.quotations (quotation_no);
CREATE INDEX IF NOT EXISTS idx_quotations_client ON public.quotations (client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations (status);

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    product_name TEXT NOT NULL,
    brand TEXT,
    hsn_code TEXT DEFAULT '3604',
    unit TEXT NOT NULL DEFAULT 'box',
    qty NUMERIC(10, 2) NOT NULL CHECK (qty > 0),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    discount_percent NUMERIC(5, 2) DEFAULT 0,
    taxable_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    line_total NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quote ON public.quotation_items (quotation_id);

-- 4. Sale Orders & Items
CREATE TABLE IF NOT EXISTS public.sale_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    so_no TEXT NOT NULL UNIQUE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT,
    customer_gstin TEXT,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    delivery_due_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled')),
    pricing_type TEXT NOT NULL DEFAULT 'wholesale' CHECK (pricing_type IN ('retail', 'wholesale')),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    transport_name TEXT,
    lr_number TEXT,
    vehicle_number TEXT,
    destination TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.sale_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    so_id UUID NOT NULL REFERENCES public.sale_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    product_name TEXT NOT NULL,
    brand TEXT,
    unit TEXT NOT NULL DEFAULT 'box',
    qty NUMERIC(10, 2) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    line_total NUMERIC(12, 2) NOT NULL
);

-- 5. Purchase Orders & Items
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_no TEXT NOT NULL UNIQUE,
    supplier_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    supplier_name TEXT NOT NULL,
    supplier_phone TEXT,
    supplier_gstin TEXT,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    product_name TEXT NOT NULL,
    brand TEXT,
    unit TEXT NOT NULL DEFAULT 'box',
    qty NUMERIC(10, 2) NOT NULL,
    unit_cost NUMERIC(10, 2) NOT NULL,
    line_total NUMERIC(12, 2) NOT NULL
);

-- 6. Invoices & Items
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_no TEXT NOT NULL UNIQUE,
    so_id UUID REFERENCES public.sale_orders(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT,
    customer_gstin TEXT,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    pricing_type TEXT NOT NULL DEFAULT 'wholesale' CHECK (pricing_type IN ('retail', 'wholesale')),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
    cgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    igst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    round_off NUMERIC(6, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_mode TEXT CHECK (payment_mode IN ('cash', 'upi', 'card')),
    transport_name TEXT,
    lr_number TEXT,
    vehicle_number TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    product_name TEXT NOT NULL,
    brand TEXT,
    hsn_code TEXT NOT NULL DEFAULT '3604',
    unit TEXT NOT NULL DEFAULT 'box',
    qty NUMERIC(10, 2) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    taxable_value NUMERIC(12, 2) NOT NULL,
    line_total NUMERIC(12, 2) NOT NULL
);

-- 7. Stock Movement Ledger
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    product_code TEXT,
    product_name TEXT NOT NULL,
    brand TEXT,
    type TEXT NOT NULL CHECK (type IN ('in', 'out', 'adjustment', 'sale', 'purchase', 'return', 'damage')),
    qty NUMERIC(10, 2) NOT NULL,
    prev_stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
    new_stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
    reference_no TEXT,
    reason TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 8. Enable RLS and Permissive Policies for Authenticated and Anon
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'clients',
            'quotations',
            'quotation_items',
            'stock_movements',
            'purchase_orders',
            'purchase_order_items',
            'sale_orders',
            'sale_order_items',
            'invoices',
            'invoice_items'
        ])
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

        -- Allow full access to authenticated users
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow all for authenticated users" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);

        -- Allow read and write for app terminals (anon)
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow all for anon" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;

