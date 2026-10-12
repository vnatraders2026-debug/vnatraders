-- Supabase Migration: 002_auth_trigger.sql
-- 1. Automatically create profile in public.profiles when a user is added to auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, is_active)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        COALESCE((new.raw_user_meta_data->>'role')::user_role, 'admin'::user_role),
        true
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Allow active cashiers and POS devices to read the product catalog
DROP POLICY IF EXISTS "Active users can view products" ON public.products;
CREATE POLICY "Anyone can view products"
    ON public.products FOR SELECT
    USING (true);

-- 3. Seed products if table is currently empty
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
