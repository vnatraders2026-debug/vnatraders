-- =========================================================================
-- Supabase SQL: Create Zeony Technologies Admin & Staff Accounts
-- Instructions:
-- 1. Open your Supabase Project Dashboard (https://supabase.com/dashboard)
-- 2. Go to "SQL Editor" in the left menu
-- 3. Click "New Query", paste the entire code below, and click "Run"
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure email column exists on public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

DO $$
DECLARE
    -- Admin credentials (you can customize these)
    v_admin_email TEXT := 'admin@zeonytechnologies.com';
    v_admin_pw TEXT := 'ZeonyAdmin@123';
    v_admin_name TEXT := 'Zeony Admin';

    -- Staff credentials (you can customize these)
    v_staff_email TEXT := 'staff@zeonytechnologies.com';
    v_staff_pw TEXT := 'ZeonyStaff@123';
    v_staff_name TEXT := 'Zeony Staff';

    -- Loop variables
    r RECORD;
    v_user_id UUID;
    v_encrypted_pw TEXT;
    v_has_provider_id BOOLEAN;
BEGIN
    -- Check if auth.identities has provider_id column for schema compatibility
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
    ) INTO v_has_provider_id;

    -- Iterate through both Admin and Staff accounts
    FOR r IN (
        SELECT 
            v_admin_email AS email, 
            v_admin_pw AS password, 
            v_admin_name AS full_name, 
            'admin'::user_role AS role
        UNION ALL
        SELECT 
            v_staff_email AS email, 
            v_staff_pw AS password, 
            v_staff_name AS full_name, 
            'staff'::user_role AS role
    ) LOOP
        v_encrypted_pw := crypt(r.password, gen_salt('bf'));

        -- 1. Check if user already exists in auth.users
        SELECT id INTO v_user_id FROM auth.users WHERE email = lower(trim(r.email));

        IF v_user_id IS NULL THEN
            v_user_id := gen_random_uuid();

            -- Insert into auth.users (email_confirmed_at is set to now() so they can login immediately)
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
                lower(trim(r.email)),
                v_encrypted_pw,
                now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                json_build_object('full_name', r.full_name, 'role', r.role)::jsonb,
                now(),
                now(),
                '',
                '',
                '',
                ''
            );

            -- Insert into auth.identities
            IF v_has_provider_id THEN
                EXECUTE format('
                    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
                    VALUES (%L, %L, %L::jsonb, %L, %L, now(), now(), now())
                ', v_user_id::text, v_user_id, json_build_object('sub', v_user_id, 'email', lower(trim(r.email))), 'email', lower(trim(r.email)));
            ELSE
                EXECUTE format('
                    INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
                    VALUES (%L, %L, %L::jsonb, %L, now(), now(), now())
                ', v_user_id::text, v_user_id, json_build_object('sub', v_user_id, 'email', lower(trim(r.email))), 'email');
            END IF;

            RAISE NOTICE 'SUCCESS: Created new auth user for % (Role: %) with ID: %', r.email, r.role, v_user_id;
        ELSE
            -- Update password and ensure email is confirmed
            UPDATE auth.users
            SET encrypted_password = v_encrypted_pw,
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                raw_user_meta_data = json_build_object('full_name', r.full_name, 'role', r.role)::jsonb,
                updated_at = now()
            WHERE id = v_user_id;

            RAISE NOTICE 'SUCCESS: Updated existing auth user for % (Role: %) with ID: %', r.email, r.role, v_user_id;
        END IF;

        -- 2. Upsert profile into public.profiles
        INSERT INTO public.profiles (
            id,
            full_name,
            email,
            role,
            is_active,
            created_at
        ) VALUES (
            v_user_id,
            r.full_name,
            lower(trim(r.email)),
            r.role,
            true,
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            is_active = true;

        RAISE NOTICE 'SUCCESS: Configured public.profiles record for % (Role: %)', r.email, r.role;
    END LOOP;
END $$;

