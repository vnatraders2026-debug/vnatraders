-- Migration 011: Categories Delete Policy
-- VNA Traders Billing System

-- Allow authenticated users to delete categories from public.categories
DROP POLICY IF EXISTS "Allow authenticated users to delete categories" ON public.categories;
CREATE POLICY "Allow authenticated users to delete categories"
  ON public.categories FOR DELETE
  TO authenticated
  USING (true);
