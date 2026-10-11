-- Supabase Migration: 001_init.sql
-- Crackers Billing: Tables, RLS, Audit Triggers, Reports RPCs, and Seed Data

-- 1. Custom Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'staff');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'staff',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'box',
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    stock NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Bills Table
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY,
    bill_no TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'upi', 'card')),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at TIMESTAMPTZ,
    edited_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Bill Items Table
CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY,
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
    product_id UUID REFERENCES public.products(id),
    product_name TEXT NOT NULL,
    qty NUMERIC(10,2) NOT NULL CHECK (qty > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0)
);

-- 6. Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id),
    user_name TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Monthly Targets Table
CREATE TABLE IF NOT EXISTS public.monthly_targets (
    month DATE PRIMARY KEY,
    target_amount NUMERIC(12,2) NOT NULL CHECK (target_amount >= 0)
);

-- 8. Indexes
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_created_by ON public.bills(created_by);
CREATE INDEX IF NOT EXISTS idx_bills_bill_no ON public.bills(bill_no);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(code);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- 9. Helper Security Functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 10. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_targets ENABLE ROW LEVEL SECURITY;

-- 11. RLS Policies

-- Profiles Policies
CREATE POLICY "Active users can view profiles"
    ON public.profiles FOR SELECT
    USING (public.is_active_user());

CREATE POLICY "Admin can update profiles"
    ON public.profiles FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Users can update own name"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Products Policies
CREATE POLICY "Active users can view products"
    ON public.products FOR SELECT
    USING (public.is_active_user());

CREATE POLICY "Active users can insert products"
    ON public.products FOR INSERT
    WITH CHECK (public.is_active_user());

CREATE POLICY "Active users can update products"
    ON public.products FOR UPDATE
    USING (public.is_active_user())
    WITH CHECK (public.is_active_user());

-- NO DELETE policy on products

-- Bills Policies
CREATE POLICY "Active users can view bills"
    ON public.bills FOR SELECT
    USING (public.is_active_user());

CREATE POLICY "Active users can insert bills"
    ON public.bills FOR INSERT
    WITH CHECK (
        public.is_active_user()
        AND created_by = auth.uid()
    );

CREATE POLICY "Admin or creator within 10m can update bills"
    ON public.bills FOR UPDATE
    USING (
        public.is_admin()
        OR (
            created_by = auth.uid()
            AND now() - created_at <= INTERVAL '10 minutes'
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            created_by = auth.uid()
            AND now() - created_at <= INTERVAL '10 minutes'
        )
    );

-- NO DELETE policy on bills

-- Bill Items Policies
CREATE POLICY "Active users can view bill items"
    ON public.bill_items FOR SELECT
    USING (public.is_active_user());

CREATE POLICY "Allow bill items insert via parent bill check"
    ON public.bill_items FOR INSERT
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.bills b
            WHERE b.id = bill_id
              AND (
                (b.created_by = auth.uid() AND now() - b.created_at <= INTERVAL '10 minutes')
                OR (b.created_by = auth.uid() AND b.created_at >= now() - INTERVAL '1 minute')
              )
        )
    );

CREATE POLICY "Allow bill items update via parent bill check"
    ON public.bill_items FOR UPDATE
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.bills b
            WHERE b.id = bill_id
              AND b.created_by = auth.uid()
              AND now() - b.created_at <= INTERVAL '10 minutes'
        )
    );

CREATE POLICY "Allow bill items delete via parent bill check"
    ON public.bill_items FOR DELETE
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.bills b
            WHERE b.id = bill_id
              AND b.created_by = auth.uid()
              AND now() - b.created_at <= INTERVAL '10 minutes'
        )
    );

-- Activity Logs Policies
CREATE POLICY "Admin can view activity logs"
    ON public.activity_logs FOR SELECT
    USING (public.is_admin());

-- Inserts are handled only by security definer triggers

-- Monthly Targets Policies
CREATE POLICY "Admin can view monthly targets"
    ON public.monthly_targets FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Admin can manage monthly targets"
    ON public.monthly_targets FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 12. Triggers for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_products_updated_at ON public.products;
CREATE TRIGGER trigger_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_bills_updated_at ON public.bills;
CREATE TRIGGER trigger_bills_updated_at
    BEFORE UPDATE ON public.bills
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 13. Audit Logging Trigger Function
CREATE OR REPLACE FUNCTION public.audit_log_trigger_handler()
RETURNS TRIGGER AS $$
DECLARE
    current_user_name TEXT := 'System';
    curr_user_id UUID := auth.uid();
    log_action TEXT;
    log_entity TEXT;
    log_entity_id TEXT;
    log_summary TEXT;
    old_row JSONB := NULL;
    new_row JSONB := NULL;
BEGIN
    IF curr_user_id IS NOT NULL THEN
        SELECT full_name INTO current_user_name FROM public.profiles WHERE id = curr_user_id;
        IF current_user_name IS NULL THEN
            current_user_name := 'User ' || substr(curr_user_id::text, 1, 8);
        END IF;
    END IF;

    log_entity := TG_TABLE_NAME;
    log_action := TG_OP;

    IF TG_OP = 'INSERT' THEN
        new_row := to_jsonb(NEW);
        IF TG_TABLE_NAME = 'bills' THEN
            log_entity_id := NEW.bill_no;
            log_summary := 'Created bill ' || NEW.bill_no || ' for amount ' || to_char(NEW.total, 'FM99,99,999.00');
        ELSIF TG_TABLE_NAME = 'products' THEN
            log_entity_id := NEW.code;
            log_summary := 'Created product ' || NEW.name || ' (' || NEW.code || ') at price ' || to_char(NEW.price, 'FM99,99,999.00');
        ELSIF TG_TABLE_NAME = 'profiles' THEN
            log_entity_id := NEW.id::text;
            log_summary := 'Created user profile ' || NEW.full_name || ' with role ' || NEW.role::text;
        ELSE
            log_entity_id := COALESCE(NEW.id::text, 'unknown');
            log_summary := 'Inserted ' || TG_TABLE_NAME;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        old_row := to_jsonb(OLD);
        new_row := to_jsonb(NEW);
        IF TG_TABLE_NAME = 'bills' THEN
            log_entity_id := NEW.bill_no;
            log_summary := 'Edited bill ' || NEW.bill_no || ': total ' || to_char(OLD.total, 'FM99,99,999.00') || ' to ' || to_char(NEW.total, 'FM99,99,999.00');
        ELSIF TG_TABLE_NAME = 'products' THEN
            log_entity_id := NEW.code;
            IF OLD.is_active != NEW.is_active THEN
                log_summary := CASE WHEN NEW.is_active THEN 'Reactivated' ELSE 'Deactivated' END || ' product ' || NEW.name || ' (' || NEW.code || ')';
            ELSE
                log_summary := 'Updated product ' || NEW.name || ' (' || NEW.code || ')';
            END IF;
        ELSIF TG_TABLE_NAME = 'profiles' THEN
            log_entity_id := NEW.id::text;
            IF OLD.is_active != NEW.is_active THEN
                log_summary := CASE WHEN NEW.is_active THEN 'Reactivated' ELSE 'Deactivated' END || ' user ' || NEW.full_name;
            ELSIF OLD.role != NEW.role THEN
                log_summary := 'Changed role of ' || NEW.full_name || ' from ' || OLD.role::text || ' to ' || NEW.role::text;
            ELSE
                log_summary := 'Updated profile of ' || NEW.full_name;
            END IF;
        ELSE
            log_entity_id := COALESCE(NEW.id::text, 'unknown');
            log_summary := 'Updated ' || TG_TABLE_NAME;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        old_row := to_jsonb(OLD);
        log_entity_id := COALESCE(OLD.id::text, 'unknown');
        log_summary := 'Deleted record in ' || TG_TABLE_NAME;
    END IF;

    INSERT INTO public.activity_logs (
        user_id,
        user_name,
        action,
        entity,
        entity_id,
        summary,
        old_data,
        new_data
    ) VALUES (
        curr_user_id,
        current_user_name,
        log_action,
        log_entity,
        log_entity_id,
        log_summary,
        old_row,
        new_row
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_bills ON public.bills;
CREATE TRIGGER trigger_audit_bills
    AFTER INSERT OR UPDATE ON public.bills
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_log_trigger_handler();

DROP TRIGGER IF EXISTS trigger_audit_products ON public.products;
CREATE TRIGGER trigger_audit_products
    AFTER INSERT OR UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_log_trigger_handler();

DROP TRIGGER IF EXISTS trigger_audit_profiles ON public.profiles;
CREATE TRIGGER trigger_audit_profiles
    AFTER INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_log_trigger_handler();

-- 14. RPC Functions for Admin Reports

-- Daily Sales RPC
CREATE OR REPLACE FUNCTION public.daily_sales(from_date DATE, to_date DATE)
RETURNS TABLE (
    sale_date DATE,
    total_sales NUMERIC(12,2),
    bill_count BIGINT,
    avg_bill_value NUMERIC(12,2)
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
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

-- Sales by Staff RPC
CREATE OR REPLACE FUNCTION public.sales_by_staff(from_date DATE, to_date DATE)
RETURNS TABLE (
    staff_id UUID,
    staff_name TEXT,
    bill_count BIGINT,
    total_sales NUMERIC(12,2)
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
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

-- Top Products RPC
CREATE OR REPLACE FUNCTION public.top_products(from_date DATE, to_date DATE, limit_count INT DEFAULT 10)
RETURNS TABLE (
    product_name TEXT,
    qty_sold NUMERIC(12,2),
    total_revenue NUMERIC(12,2)
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
    END IF;

    RETURN QUERY
    SELECT
        bi.product_name,
        COALESCE(SUM(bi.qty), 0)::NUMERIC(12,2) AS qty_sold,
        COALESCE(SUM(bi.line_total), 0)::NUMERIC(12,2) AS total_revenue
    FROM public.bill_items bi
    JOIN public.bills b ON bi.bill_id = b.id
    WHERE b.created_at::DATE BETWEEN from_date AND to_date
    GROUP BY bi.product_name
    ORDER BY total_revenue DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Payment Mode Split RPC
CREATE OR REPLACE FUNCTION public.payment_mode_split(from_date DATE, to_date DATE)
RETURNS TABLE (
    payment_mode TEXT,
    bill_count BIGINT,
    total_amount NUMERIC(12,2)
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
    END IF;

    RETURN QUERY
    SELECT
        b.payment_mode,
        COUNT(b.id) AS bill_count,
        COALESCE(SUM(b.total), 0)::NUMERIC(12,2) AS total_amount
    FROM public.bills b
    WHERE b.created_at::DATE BETWEEN from_date AND to_date
    GROUP BY b.payment_mode
    ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Monthly Summary RPC
CREATE OR REPLACE FUNCTION public.monthly_summary(target_year INT)
RETURNS TABLE (
    month_num INT,
    month_name TEXT,
    total_sales NUMERIC(12,2),
    bill_count BIGINT
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
    END IF;

    RETURN QUERY
    SELECT
        EXTRACT(MONTH FROM b.created_at)::INT AS month_num,
        TO_CHAR(b.created_at, 'Mon') AS month_name,
        COALESCE(SUM(b.total), 0)::NUMERIC(12,2) AS total_sales,
        COUNT(b.id) AS bill_count
    FROM public.bills b
    WHERE EXTRACT(YEAR FROM b.created_at) = target_year
    GROUP BY EXTRACT(MONTH FROM b.created_at), TO_CHAR(b.created_at, 'Mon')
    ORDER BY month_num ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Target Progress RPC
CREATE OR REPLACE FUNCTION public.target_progress(target_month DATE)
RETURNS TABLE (
    target_amount NUMERIC(12,2),
    achieved_amount NUMERIC(12,2),
    percentage NUMERIC(5,2),
    days_in_month INT,
    days_elapsed INT,
    days_remaining INT,
    required_daily_avg NUMERIC(12,2)
) AS $$
DECLARE
    v_month_start DATE := date_trunc('month', target_month)::DATE;
    v_month_end DATE := (date_trunc('month', target_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_days_in_month INT := EXTRACT(DAY FROM v_month_end)::INT;
    v_current_day INT;
    v_days_remaining INT;
    v_target NUMERIC(12,2) := 0;
    v_achieved NUMERIC(12,2) := 0;
    v_pct NUMERIC(5,2) := 0;
    v_req_avg NUMERIC(12,2) := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
    END IF;

    SELECT COALESCE(mt.target_amount, 0) INTO v_target
    FROM public.monthly_targets mt
    WHERE mt.month = v_month_start;

    SELECT COALESCE(SUM(total), 0)::NUMERIC(12,2) INTO v_achieved
    FROM public.bills
    WHERE created_at::DATE BETWEEN v_month_start AND v_month_end;

    IF CURRENT_DATE < v_month_start THEN
        v_current_day := 0;
    ELSIF CURRENT_DATE > v_month_end THEN
        v_current_day := v_days_in_month;
    ELSE
        v_current_day := EXTRACT(DAY FROM CURRENT_DATE)::INT;
    END IF;

    v_days_remaining := GREATEST(0, v_days_in_month - v_current_day);

    IF v_target > 0 THEN
        v_pct := LEAST(999.99, ROUND((v_achieved / v_target) * 100, 2));
        IF v_days_remaining > 0 AND v_achieved < v_target THEN
            v_req_avg := ROUND((v_target - v_achieved) / v_days_remaining, 2);
        ELSE
            v_req_avg := 0;
        END IF;
    END IF;

    RETURN QUERY SELECT
        v_target,
        v_achieved,
        v_pct,
        v_days_in_month,
        v_current_day,
        v_days_remaining,
        v_req_avg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 15. Seed 25 Sample Cracker Products
INSERT INTO public.products (code, name, category, unit, price, stock, is_active)
VALUES
    ('SPK-01', '10 cm Electric Sparklers', 'Sparklers', 'box', 45.00, 250, true),
    ('SPK-02', '15 cm Colour Sparklers', 'Sparklers', 'box', 75.00, 180, true),
    ('SPK-03', '30 cm Green Sparklers', 'Sparklers', 'box', 140.00, 120, true),
    ('SPK-04', '50 cm Deluxe Sparklers', 'Sparklers', 'box', 260.00, 90, true),
    ('FLP-01', 'Flower Pots Small', 'Flower Pots', 'box', 110.00, 150, true),
    ('FLP-02', 'Flower Pots Special', 'Flower Pots', 'box', 180.00, 130, true),
    ('FLP-03', 'Flower Pots Asoka', 'Flower Pots', 'box', 250.00, 100, true),
    ('FLP-04', 'Colour Koti Pots', 'Flower Pots', 'box', 320.00, 75, true),
    ('CHK-01', 'Ground Chakkars Small', 'Ground Chakkars', 'box', 85.00, 200, true),
    ('CHK-02', 'Ground Chakkars Big', 'Ground Chakkars', 'box', 140.00, 160, true),
    ('CHK-03', 'Ground Chakkars Special Red', 'Ground Chakkars', 'box', 195.00, 110, true),
    ('CHK-04', 'Whistling Chakkars', 'Ground Chakkars', 'box', 240.00, 80, true),
    ('RCK-01', 'Baby Rockets', 'Rockets', 'box', 120.00, 140, true),
    ('RCK-02', 'Bombing Rockets', 'Rockets', 'box', 190.00, 100, true),
    ('RCK-03', 'Lunik Whistling Rockets', 'Rockets', 'box', 280.00, 60, true),
    ('BMB-01', 'Hydro Bombs 2 inch', 'Bombs', 'box', 95.00, 220, true),
    ('BMB-02', 'Classic King Bombs', 'Bombs', 'box', 160.00, 150, true),
    ('BMB-03', 'Digital Sound Bombs', 'Bombs', 'box', 230.00, 90, true),
    ('FNC-01', '12 Shots Multi Colour', 'Fancy Shots', 'piece', 350.00, 85, true),
    ('FNC-02', '30 Shots Sky Thunder', 'Fancy Shots', 'piece', 780.00, 50, true),
    ('FNC-03', '60 Shots Royal Display', 'Fancy Shots', 'piece', 1550.00, 30, true),
    ('FNC-04', '120 Shots Mega Fireworks', 'Fancy Shots', 'piece', 2900.00, 15, true),
    ('GFT-01', 'Standard Family Gift Box 21 Items', 'Gift Boxes', 'box', 850.00, 45, true),
    ('GFT-02', 'Deluxe Festive Box 35 Items', 'Gift Boxes', 'box', 1650.00, 35, true),
    ('GFT-03', 'Premium VIP Gift Box 52 Items', 'Gift Boxes', 'box', 3200.00, 20, true)
ON CONFLICT (code) DO NOTHING;

-- Seed Default Current Month Target
INSERT INTO public.monthly_targets (month, target_amount)
VALUES (date_trunc('month', CURRENT_DATE)::DATE, 500000.00)
ON CONFLICT (month) DO NOTHING;
