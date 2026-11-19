-- =========================================================================
-- Supabase Migration 014: Wholesale Pricing, Stock Ledger, Orders & Invoices
-- Modules:
-- 1. Dual Pricing (products.wholesale_price)
-- 2. Client & Vendor Directory (public.clients)
-- 3. Stock Movement Ledger (public.stock_movements)
-- 4. Purchase Orders (public.purchase_orders & public.purchase_order_items)
-- 5. Sale Orders & Dispatch (public.sale_orders & public.sale_order_items)
-- 6. Tax Invoices & GST (public.invoices & public.invoice_items)
-- =========================================================================

-- 1. Dual Product Pricing & Stock Alert Thresholds
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS min_stock NUMERIC(10, 2) DEFAULT 20;

-- 2. Client Management (Customers, Wholesale Dealers, Sivakasi Suppliers)
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
CREATE INDEX IF NOT EXISTS idx_clients_gstin ON public.clients (gstin);

-- 3. Stock Movements (Inventory Ledger)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    product_code TEXT,
    product_name TEXT NOT NULL,
    brand TEXT,
    type TEXT NOT NULL CHECK (type IN ('in', 'out', 'adjustment', 'sale', 'purchase', 'return', 'damage')),
    qty NUMERIC(10, 2) NOT NULL, -- Positive for additions, negative for deductions
    prev_stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
    new_stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
    reference_no TEXT, -- Bill No, PO No, SO No, or Audit Ref
    reason TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements (type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON public.stock_movements (created_at DESC);

-- 4. Purchase Orders
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

CREATE INDEX IF NOT EXISTS idx_po_supplier ON public.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.purchase_order_items (po_id);

-- 5. Sale Orders & Transport Dispatch
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

CREATE INDEX IF NOT EXISTS idx_so_client ON public.sale_orders (client_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON public.sale_orders (status);
CREATE INDEX IF NOT EXISTS idx_so_due_date ON public.sale_orders (delivery_due_date);
CREATE INDEX IF NOT EXISTS idx_so_items_so_id ON public.sale_order_items (so_id);

-- 6. Tax Invoices & GST Management
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

CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items (invoice_id);

-- 7. Enable RLS and permissive sync policies for authenticated staff
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'clients',
            'stock_movements',
            'purchase_orders',
            'purchase_order_items',
            'sale_orders',
            'sale_order_items',
            'invoices',
            'invoice_items'
        ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow all for authenticated users" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);

        EXECUTE format('DROP POLICY IF EXISTS "Allow anon read" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow anon read" ON public.%I FOR SELECT TO anon USING (true);', tbl);
    END LOOP;
END $$;

