-- Migration 009: Activity Logs and Stock Sync Policies
-- VNA Crackers Sivakasi Billing System

-- 1. Ensure public.activity_logs has proper RLS for both read and insert
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow authenticated to view activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow authenticated users to read activity logs" ON public.activity_logs;

CREATE POLICY "Allow authenticated users to read activity logs"
    ON public.activity_logs FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated to insert activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow authenticated users to insert activity logs" ON public.activity_logs;

CREATE POLICY "Allow authenticated users to insert activity logs"
    ON public.activity_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 2. Ensure public.products has full insert/update permissions for authenticated users
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active users can insert products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated to insert products" ON public.products;

CREATE POLICY "Allow authenticated to insert products"
    ON public.products FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Active users can update products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated to update products" ON public.products;

CREATE POLICY "Allow authenticated to update products"
    ON public.products FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 3. Ensure updated_at trigger exists on public.products
DROP TRIGGER IF EXISTS trigger_products_updated_at ON public.products;
CREATE TRIGGER trigger_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
