-- Migration 005: Brands Module and Brand Discounts
-- VNA Crackers Sivakasi Billing System

-- 1. Create public.brands table
CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- RLS Policies for brands
DROP POLICY IF EXISTS "Allow authenticated users to read brands" ON public.brands;
CREATE POLICY "Allow authenticated users to read brands"
  ON public.brands FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert brands" ON public.brands;
CREATE POLICY "Allow authenticated users to insert brands"
  ON public.brands FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update brands" ON public.brands;
CREATE POLICY "Allow authenticated users to update brands"
  ON public.brands FOR UPDATE
  TO authenticated
  USING (true);

-- 2. Seed default brands: Standard and General
INSERT INTO public.brands (id, name, is_active)
VALUES
  ('11111111-2222-3333-4444-555555550001', 'Standard', true),
  ('11111111-2222-3333-4444-555555550002', 'General', true)
ON CONFLICT (name) DO NOTHING;

-- 3. Add brand column to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'Standard';

-- 4. Add brand column to bill_items
ALTER TABLE public.bill_items
  ADD COLUMN IF NOT EXISTS brand TEXT;

-- 5. Add brand_discounts JSONB column to bills
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS brand_discounts JSONB DEFAULT '{}'::jsonb;
