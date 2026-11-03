-- =========================================================================
-- Supabase Migration 012: Multiple Roles, Brand Discounts, and Bill Management
-- Run this script in your Supabase SQL Editor
-- =========================================================================

-- -------------------------------------------------------------------------
-- PART 1: CONVERT profiles.role TO TEXT + CHECK CONSTRAINT
-- (Permanently prevents PostgreSQL 55P04 "unsafe use of new value in transaction" error)
-- Supported roles: 'admin', 'manager', 'supervisor', 'cashier', 'staff'
-- -------------------------------------------------------------------------

-- 1. Alter profiles.role column type to TEXT (safe & immediate in Postgres)
ALTER TABLE public.profiles ALTER COLUMN role TYPE TEXT USING role::TEXT;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'staff';

-- 2. Enforce valid roles with a CHECK constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'supervisor', 'cashier', 'staff'));

-- 3. Update auth trigger so it inserts role as text without enum casting
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, is_active)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'role', 'staff'),
        true
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------------------------
-- PART 2: ALTER public.brands TABLE FOR BRAND-WISE DISCOUNTS
-- -------------------------------------------------------------------------

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS has_discount BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_discount NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Set default values for standard brands
UPDATE public.brands
SET has_discount = true,
    discount_percent = 70.00,
    max_discount = 80.00
WHERE name = 'Standard' AND (discount_percent = 0 OR has_discount = false);

UPDATE public.brands
SET has_discount = false,
    discount_percent = 0.00,
    max_discount = 0.00
WHERE name = 'General' AND has_discount IS NULL;

-- Allow authenticated users to delete brands
DROP POLICY IF EXISTS "Allow authenticated users to delete brands" ON public.brands;
CREATE POLICY "Allow authenticated users to delete brands"
  ON public.brands FOR DELETE
  TO authenticated
  USING (true);

-- -------------------------------------------------------------------------
-- PART 3: PERMISSIONS & RLS POLICIES FOR BILL EDITING
-- Allows Admin, Manager, and Supervisor to edit any bill at any time.
-- Staff and Cashier can edit only bills they created within 10 minutes.
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admin or creator within 10m can update bills" ON public.bills;
DROP POLICY IF EXISTS "Admin, manager, supervisor or creator within 10m can update bills" ON public.bills;

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
    )
    WITH CHECK (true);

-- Ensure bill_items can be updated or replaced during bill editing
DROP POLICY IF EXISTS "Allow authenticated bill items update" ON public.bill_items;
CREATE POLICY "Allow authenticated bill items update"
    ON public.bill_items FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- -------------------------------------------------------------------------
-- PART 4: ANALYTICS / REPORTS ACCESS FUNCTION
-- Allows Admin, Manager, and Supervisor to view analytical metrics
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_view_analytics()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'manager', 'supervisor')
          AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -------------------------------------------------------------------------
-- PART 5: UPDATE REPORT RPCs TO ALLOW ADMIN, MANAGER & SUPERVISOR
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sales_summary_daily(from_date DATE, to_date DATE)
RETURNS TABLE (
    sale_date DATE,
    total_sales NUMERIC(12,2),
    bill_count BIGINT,
    avg_bill_value NUMERIC(12,2)
) AS $$
BEGIN
    IF NOT public.can_view_analytics() THEN
        RAISE EXCEPTION 'Access denied. Admin, Manager, or Supervisor role required.';
    END IF;

    RETURN QUERY
    SELECT
        b.created_at::DATE AS sale_date,
        COALESCE(SUM(b.total), 0)::NUMERIC(12,2) AS total_sales,
        COUNT(b.id) AS bill_count,
        COALESCE(AVG(b.total), 0)::NUMERIC(12,2) AS avg_bill_value
    FROM public.bills b
    WHERE b.created_at::DATE BETWEEN from_date AND to_date
    GROUP BY b.created_at::DATE
    ORDER BY b.created_at::DATE ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.sales_by_staff(from_date DATE, to_date DATE)
RETURNS TABLE (
    staff_id UUID,
    staff_name TEXT,
    bill_count BIGINT,
    total_sales NUMERIC(12,2)
) AS $$
BEGIN
    IF NOT public.can_view_analytics() THEN
        RAISE EXCEPTION 'Access denied. Admin, Manager, or Supervisor role required.';
    END IF;

    RETURN QUERY
    SELECT
        b.created_by AS staff_id,
        COALESCE(p.full_name, 'Unknown Staff') AS staff_name,
        COUNT(b.id) AS bill_count,
        COALESCE(SUM(b.total), 0)::NUMERIC(12,2) AS total_sales
    FROM public.bills b
    LEFT JOIN public.profiles p ON b.created_by = p.id
    WHERE b.created_at::DATE BETWEEN from_date AND to_date
    GROUP BY b.created_by, p.full_name
    ORDER BY total_sales DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.sales_by_payment_mode(from_date DATE, to_date DATE)
RETURNS TABLE (
    payment_mode TEXT,
    bill_count BIGINT,
    total_sales NUMERIC(12,2),
    percentage NUMERIC(5,2)
) AS $$
DECLARE
    v_total_sales NUMERIC(12,2);
BEGIN
    IF NOT public.can_view_analytics() THEN
        RAISE EXCEPTION 'Access denied. Admin, Manager, or Supervisor role required.';
    END IF;

    SELECT COALESCE(SUM(total), 0) INTO v_total_sales
    FROM public.bills
    WHERE created_at::DATE BETWEEN from_date AND to_date;

    RETURN QUERY
    SELECT
        b.payment_mode,
        COUNT(b.id) AS bill_count,
        COALESCE(SUM(b.total), 0)::NUMERIC(12,2) AS total_sales,
        CASE
            WHEN v_total_sales > 0 THEN
                ROUND((SUM(b.total) / v_total_sales * 100)::NUMERIC, 2)
            ELSE 0::NUMERIC(5,2)
        END AS percentage
    FROM public.bills b
    WHERE b.created_at::DATE BETWEEN from_date AND to_date
    GROUP BY b.payment_mode
    ORDER BY total_sales DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.top_selling_products(from_date DATE, to_date DATE, limit_count INT DEFAULT 10)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    category TEXT,
    total_qty NUMERIC(10,2),
    total_revenue NUMERIC(12,2)
) AS $$
BEGIN
    IF NOT public.can_view_analytics() THEN
        RAISE EXCEPTION 'Access denied. Admin, Manager, or Supervisor role required.';
    END IF;

    RETURN QUERY
    SELECT
        bi.product_id,
        bi.product_name,
        COALESCE(p.category, 'General') AS category,
        COALESCE(SUM(bi.qty), 0)::NUMERIC(10,2) AS total_qty,
        COALESCE(SUM(bi.line_total), 0)::NUMERIC(12,2) AS total_revenue
    FROM public.bill_items bi
    JOIN public.bills b ON bi.bill_id = b.id
    LEFT JOIN public.products p ON bi.product_id = p.id
    WHERE b.created_at::DATE BETWEEN from_date AND to_date
    GROUP BY bi.product_id, bi.product_name, p.category
    ORDER BY total_revenue DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -------------------------------------------------------------------------
-- PART 6: ENSURE create_user RPC HANDLES ALL ROLES PROPERLY
-- -------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_user(TEXT, TEXT, TEXT, user_role);
DROP FUNCTION IF EXISTS public.create_user(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role TEXT DEFAULT 'staff'
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID := gen_random_uuid();
    v_encrypted_pw TEXT;
    v_has_provider_id BOOLEAN;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin privileges required to create users';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
        RAISE EXCEPTION 'A user with email % already exists', p_email;
    END IF;

    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        lower(trim(p_email)),
        v_encrypted_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('full_name', p_full_name, 'role', p_role)::jsonb,
        now(),
        now(),
        '',
        '',
        '',
        ''
    );

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
    ) INTO v_has_provider_id;

    IF v_has_provider_id THEN
        EXECUTE format('
            INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
            VALUES (%L, %L, %L::jsonb, %L, %L, now(), now(), now())
        ', v_user_id::text, v_user_id, json_build_object('sub', v_user_id, 'email', lower(trim(p_email))), 'email', lower(trim(p_email)));
    ELSE
        EXECUTE format('
            INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
            VALUES (%L, %L, %L::jsonb, %L, now(), now(), now())
        ', v_user_id::text, v_user_id, json_build_object('sub', v_user_id, 'email', lower(trim(p_email))), 'email');
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role, is_active, created_at)
    VALUES (v_user_id, p_full_name, lower(trim(p_email)), p_role, true, now())
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_active = true;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

