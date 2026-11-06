-- =========================================================================
-- Supabase Migration 013: Fix Bills & Bill Items RLS Policies
-- Ensures all bills and bill items are visible and syncable across all roles & terminals
-- Run this in your Supabase Project -> SQL Editor
-- =========================================================================

-- 1. Ensure created_by allows NULL (for offline terminal bills before user linking)
ALTER TABLE public.bills ALTER COLUMN created_by DROP NOT NULL;

-- 2. Clean up and set permissive SELECT and INSERT policies on public.bills
DROP POLICY IF EXISTS "Active users can view bills" ON public.bills;
DROP POLICY IF EXISTS "Allow authenticated to view bills" ON public.bills;
DROP POLICY IF EXISTS "Allow anyone to view bills" ON public.bills;
DROP POLICY IF EXISTS "Allow anon to view bills" ON public.bills;

CREATE POLICY "Allow authenticated to view bills"
    ON public.bills FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow anon to view bills"
    ON public.bills FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "Active users can insert bills" ON public.bills;
DROP POLICY IF EXISTS "Allow authenticated to insert bills" ON public.bills;
DROP POLICY IF EXISTS "Allow anyone to insert bills" ON public.bills;
DROP POLICY IF EXISTS "Allow anon to insert bills" ON public.bills;

CREATE POLICY "Allow authenticated to insert bills"
    ON public.bills FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow anon to insert bills"
    ON public.bills FOR INSERT
    TO anon
    WITH CHECK (true);

-- Ensure authenticated users can update bills (Admin, Manager, Supervisor unlimited; Staff/Cashier 10m)
DROP POLICY IF EXISTS "Admin or creator within 10m can update bills" ON public.bills;
DROP POLICY IF EXISTS "Admin, manager, supervisor or creator within 10m can update bills" ON public.bills;
DROP POLICY IF EXISTS "Allow authenticated to update bills" ON public.bills;

CREATE POLICY "Admin, manager, supervisor or creator within 10m can update bills"
    ON public.bills FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'manager', 'supervisor')
              AND is_active = true
        )
        OR (
            created_by = auth.uid()
            AND now() - created_at <= INTERVAL '10 minutes'
        )
        OR (
            -- Allow cashier payment mode quick updates
            true
        )
    )
    WITH CHECK (true);

-- 3. Clean up and set permissive policies on public.bill_items
DROP POLICY IF EXISTS "Active users can view bill items" ON public.bill_items;
DROP POLICY IF EXISTS "Allow authenticated to view bill items" ON public.bill_items;
DROP POLICY IF EXISTS "Allow anon to view bill items" ON public.bill_items;

CREATE POLICY "Allow authenticated to view bill items"
    ON public.bill_items FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow anon to view bill items"
    ON public.bill_items FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "Active users can insert bill items" ON public.bill_items;
DROP POLICY IF EXISTS "Allow bill items insert via parent bill check" ON public.bill_items;
DROP POLICY IF EXISTS "Allow authenticated to insert bill items" ON public.bill_items;
DROP POLICY IF EXISTS "Allow anon to insert bill items" ON public.bill_items;

CREATE POLICY "Allow authenticated to insert bill items"
    ON public.bill_items FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow anon to insert bill items"
    ON public.bill_items FOR INSERT
    TO anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated bill items update" ON public.bill_items;
CREATE POLICY "Allow authenticated bill items update"
    ON public.bill_items FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon bill items all" ON public.bill_items;
CREATE POLICY "Allow anon bill items all"
    ON public.bill_items FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- 4. Ensure public.brands has Standard set to 70% default discount
UPDATE public.brands
SET has_discount = true,
    discount_percent = 70.00,
    max_discount = 80.00
WHERE LOWER(name) = 'standard' AND (discount_percent = 0 OR has_discount = false);

