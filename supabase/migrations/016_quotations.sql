-- =========================================================================
-- Supabase Migration 016: Formal Quotations & Estimations Module
-- Table: public.quotations & public.quotation_items
-- =========================================================================

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
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_quotations_no ON public.quotations (quotation_no);
CREATE INDEX IF NOT EXISTS idx_quotations_client ON public.quotations (client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations (status);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON public.quotations (quotation_date);
CREATE INDEX IF NOT EXISTS idx_quotations_valid ON public.quotations (valid_until);

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
CREATE INDEX IF NOT EXISTS idx_quotation_items_product ON public.quotation_items (product_id);

-- Enable Row Level Security
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- Quotations Policies
DROP POLICY IF EXISTS "Authenticated users can select quotations" ON public.quotations;
CREATE POLICY "Authenticated users can select quotations"
ON public.quotations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert quotations" ON public.quotations;
CREATE POLICY "Authenticated users can insert quotations"
ON public.quotations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update quotations" ON public.quotations;
CREATE POLICY "Authenticated users can update quotations"
ON public.quotations FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin and Manager can delete quotations" ON public.quotations;
CREATE POLICY "Admin and Manager can delete quotations"
ON public.quotations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
  )
);

-- Quotation Items Policies
DROP POLICY IF EXISTS "Authenticated users can select quotation_items" ON public.quotation_items;
CREATE POLICY "Authenticated users can select quotation_items"
ON public.quotation_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert quotation_items" ON public.quotation_items;
CREATE POLICY "Authenticated users can insert quotation_items"
ON public.quotation_items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update quotation_items" ON public.quotation_items;
CREATE POLICY "Authenticated users can update quotation_items"
ON public.quotation_items FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete quotation_items" ON public.quotation_items;
CREATE POLICY "Authenticated users can delete quotation_items"
ON public.quotation_items FOR DELETE TO authenticated USING (true);

