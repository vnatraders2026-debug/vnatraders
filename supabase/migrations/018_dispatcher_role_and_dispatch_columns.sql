-- =========================================================================
-- Supabase Migration 018: Dispatcher Role & Dispatch Logistics Tracking
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Safely add 'dispatcher' to user_role ENUM (if type exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        BEGIN
            ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'dispatcher';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- 2. Update profiles CHECK constraint to include 'dispatcher'
-- Supported roles: 'admin', 'manager', 'supervisor', 'cashier', 'staff', 'dispatcher'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'manager', 'supervisor', 'cashier', 'staff', 'dispatcher'));

-- 3. Add Dispatch & Verification Columns to public.sale_orders
ALTER TABLE public.sale_orders
    ADD COLUMN IF NOT EXISTS driver_phone TEXT,
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dispatched_by TEXT,
    ADD COLUMN IF NOT EXISTS assigned_dispatcher_id TEXT,
    ADD COLUMN IF NOT EXISTS assigned_dispatcher_name TEXT,
    ADD COLUMN IF NOT EXISTS dispatch_assigned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_items JSONB DEFAULT '[]'::jsonb;

-- 4. Create indexes for fast lookup in dispatch queue
CREATE INDEX IF NOT EXISTS idx_sale_orders_assigned_dispatcher ON public.sale_orders (assigned_dispatcher_id);
CREATE INDEX IF NOT EXISTS idx_sale_orders_dispatched_at ON public.sale_orders (dispatched_at);
CREATE INDEX IF NOT EXISTS idx_sale_orders_status ON public.sale_orders (status);

-- 5. Ensure RLS allows full synchronization for Sale Orders & Items
ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on sale_orders" ON public.sale_orders;
CREATE POLICY "Allow all on sale_orders" ON public.sale_orders
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

ALTER TABLE public.sale_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on sale_order_items" ON public.sale_order_items;
CREATE POLICY "Allow all on sale_order_items" ON public.sale_order_items
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- 6. Safely create or link dispatcher@crackers.local via auth.users first
-- (Satisfies profiles_id_fkey foreign key constraint)
DO $$
DECLARE
    v_user_id UUID;
    v_email TEXT := 'dispatcher@crackers.local';
    v_password TEXT := 'Admin@12345';
    v_full_name TEXT := 'Ramu (Dispatch In-Charge)';
    v_role TEXT := 'dispatcher';
    v_encrypted_pw TEXT;
    v_has_provider_id BOOLEAN;
BEGIN
    v_encrypted_pw := crypt(v_password, gen_salt('bf'));

    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();

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
            v_email,
            v_encrypted_pw,
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            json_build_object('full_name', v_full_name, 'role', v_role)::jsonb,
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
            ', v_user_id::text, v_user_id, json_build_object('sub', v_user_id, 'email', v_email), 'email', v_email);
        ELSE
            EXECUTE format('
                INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
                VALUES (%L, %L, %L::jsonb, %L, now(), now(), now())
            ', v_user_id::text, v_user_id, json_build_object('sub', v_user_id, 'email', v_email), 'email');
        END IF;
    END IF;

    -- Insert/Update public.profiles using the valid auth.users UUID
    INSERT INTO public.profiles (id, full_name, email, role, is_active)
    VALUES (
        v_user_id,
        v_full_name,
        v_email,
        v_role,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        role = v_role,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        is_active = true;
END $$;

-- 7. Update create_user RPC to safely support dispatcher role
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
