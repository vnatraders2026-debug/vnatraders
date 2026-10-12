-- =========================================================================
-- Supabase SQL: Create or Reset First Admin User
-- Run this script in your Supabase Project -> SQL Editor
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_user_id UUID;
    v_email TEXT := 'admin@vnacrackers.com';   -- You can change this email
    v_password TEXT := 'Admin@12345';          -- You can change this password
    v_full_name TEXT := 'Admin Manager';
    v_encrypted_pw TEXT;
    v_has_provider_id BOOLEAN;
BEGIN
    v_encrypted_pw := crypt(v_password, gen_salt('bf'));

    -- Check if user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();

        -- 1. Insert into auth.users (auto-confirmed)
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
            json_build_object('full_name', v_full_name, 'role', 'admin')::jsonb,
            now(),
            now(),
            '',
            '',
            '',
            ''
        );

        -- 2. Insert into auth.identities
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

        RAISE NOTICE 'New admin user created in auth.users with ID: %', v_user_id;
    ELSE
        -- Update existing user password & confirm email
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = v_user_id;

        RAISE NOTICE 'Existing user updated with ID: %', v_user_id;
    END IF;

    -- 3. Upsert into public.profiles as active admin
    INSERT INTO public.profiles (
        id,
        full_name,
        role,
        is_active,
        created_at
    ) VALUES (
        v_user_id,
        v_full_name,
        'admin',
        true,
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'admin',
        is_active = true,
        full_name = EXCLUDED.full_name;

    RAISE NOTICE 'Admin profile confirmed in public.profiles for email: %', v_email;
END $$;
