-- =========================================================================
-- Supabase Migration: 004_create_user_rpc.sql
-- 1. Ensure email column exists on profiles and populate from auth.users
-- 2. RPC to create users directly from the Admin Portal in Supabase
-- 3. RPC to reset passwords
-- 4. Relax bills and bill_items insert policies for seamless POS sync
-- 5. Add sync_status column to bills for schema compatibility
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Ensure email column on profiles & sync from auth.users
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 2. Create User RPC
CREATE OR REPLACE FUNCTION public.create_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role user_role DEFAULT 'staff'
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID := gen_random_uuid();
    v_encrypted_pw TEXT;
    v_has_provider_id BOOLEAN;
BEGIN
    -- Security: Only active admin can create users
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin privileges required to create users';
    END IF;

    -- Check if email already exists in auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
        RAISE EXCEPTION 'A user with email % already exists', p_email;
    END IF;

    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    -- A. Insert into auth.users (auto-confirm email so they can log in instantly)
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

    -- B. Insert into auth.identities
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

    -- C. Insert into public.profiles (with email)
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

-- 3. Reset Password RPC
CREATE OR REPLACE FUNCTION public.reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin privileges required to reset password';
    END IF;

    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Seamless POS Bills Sync Policies
DROP POLICY IF EXISTS "Active users can insert bills" ON public.bills;
CREATE POLICY "Active users can insert bills"
    ON public.bills FOR INSERT
    WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "Allow bill items insert via parent bill check" ON public.bill_items;
DROP POLICY IF EXISTS "Active users can insert bill items" ON public.bill_items;
CREATE POLICY "Active users can insert bill items"
    ON public.bill_items FOR INSERT
    WITH CHECK (public.is_active_user());

-- 5. Schema column compatibility
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';
