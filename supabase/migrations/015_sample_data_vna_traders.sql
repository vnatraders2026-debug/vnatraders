

-- 1. Sample Clients & Vendors
INSERT INTO public.clients (
    id, name, company_name, type, customer_tier, phone, email, gstin, address, city, state, pincode, credit_limit, outstanding_balance, notes, is_active
) VALUES
-- Wholesale Customer (Dealer)
(
    'a1111111-1111-1111-1111-111111111001',
    'Rajesh Kumar',
    'Sri Venkateshwara Crackers Wholesale',
    'customer',
    'wholesale',
    '9842154321',
    'venkateshwaracrackers@gmail.com',
    '29AAACV1234F1Z2', -- Karnataka dealer (Bangalore)
    'Shop No. 4, APMC Yard, Yeshwanthpur',
    'Bengaluru',
    'Karnataka',
    '560022',
    500000.00,
    145000.00,
    'Regular wholesale dealer for Deepavali bulk bookings',
    true
),
-- Local Retail Customer
(
    'a1111111-1111-1111-1111-111111111002',
    'Murugan M.',
    'Murugan Agencies',
    'customer',
    'retail',
    '9443198765',
    'murugan.hosur@gmail.com',
    '33AALCM9876D1Z1', -- Tamil Nadu retail buyer
    '12, Bagalur Road, Near Bus Stand',
    'Hosur',
    'Tamil Nadu',
    '635109',
    100000.00,
    0.00,
    'Retail customer with family orders',
    true
),
-- Sivakasi Manufacturer / Factory Supplier
(
    'a1111111-1111-1111-1111-111111111003',
    'K. Senthil Nathan',
    'Standard Fireworks Industries Ltd',
    'supplier',
    'wholesale',
    '9442111222',
    'orders@standardfireworks.com',
    '33AAACS5555M1Z8',
    '1/28, Sivakasi Main Road, Thiruthangal',
    'Sivakasi',
    'Tamil Nadu',
    '626123',
    2000000.00,
    0.00,
    'Primary brand supplier for sparklers and aerial repeaters',
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    company_name = EXCLUDED.company_name,
    gstin = EXCLUDED.gstin,
    phone = EXCLUDED.phone;

-- 2. Sample Products with Wholesale Rate vs Retail MRP
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS min_stock NUMERIC(10, 2) DEFAULT 20;

INSERT INTO public.products (
    id, code, name, category, brand, unit, price, wholesale_price, stock, min_stock, is_active
) VALUES
(
    'b1111111-1111-1111-1111-111111111001',
    'SPK-10',
    '10 cm Electric Sparklers',
    'Sparklers',
    'Standard',
    'box',
    60.00,  -- Retail MRP
    24.00,  -- Wholesale Net Rate
    450.00,
    50.00,
    true
),
(
    'b1111111-1111-1111-1111-111111111002',
    'SPK-15',
    '15 cm Colour Sparklers (5 in 1)',
    'Sparklers',
    'Standard',
    'box',
    110.00,
    42.00,
    320.00,
    30.00,
    true
),
(
    'b1111111-1111-1111-1111-111111111003',
    'CHK-DLX',
    'Ground Deluxe Chakkar (10 Pcs)',
    'Chakkars (Ground Spinners)',
    'Standard',
    'box',
    180.00,
    68.00,
    280.00,
    25.00,
    true
),
(
    'b1111111-1111-1111-1111-111111111004',
    'FP-ASO',
    'Flower Pots Ashoka Special',
    'Flower Pots (Fountains)',
    'Standard',
    'box',
    220.00,
    85.00,
    190.00,
    20.00,
    true
),
(
    'b1111111-1111-1111-1111-111111111005',
    'GAR-1000',
    '1000 Wala Garland Cracker',
    'Garlands (Wala Crackers)',
    'Standard',
    'pcs',
    550.00,
    210.00,
    85.00,
    15.00,
    true
),
(
    'b1111111-1111-1111-1111-111111111006',
    'SHT-30',
    '30 Shots Multi-Colour Aerial Repeater',
    'Shots & Aerial Repeaters',
    'Standard',
    'box',
    980.00,
    420.00,
    15.00,  -- Low stock (< 20 triggers alert)
    20.00,
    true
)
ON CONFLICT (code) DO UPDATE SET
    wholesale_price = EXCLUDED.wholesale_price,
    min_stock = EXCLUDED.min_stock,
    stock = EXCLUDED.stock;

-- 3. Sample Stock Movements (Initial Opening Stock + Audit Adjustments)
INSERT INTO public.stock_movements (
    id, product_id, product_code, product_name, brand, type, qty, prev_stock, new_stock, reference_no, reason, created_by, created_at
) VALUES
(
    'c1111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111001',
    'SPK-10',
    '10 cm Electric Sparklers',
    'Standard',
    'in',
    500.00,
    0.00,
    500.00,
    'PO-261110-0001',
    'Season opening factory delivery from Sivakasi',
    'Admin',
    NOW() - INTERVAL '5 days'
),
(
    'c1111111-1111-1111-1111-111111111002',
    'b1111111-1111-1111-1111-111111111001',
    'SPK-10',
    '10 cm Electric Sparklers',
    'Standard',
    'sale',
    -50.00,
    500.00,
    450.00,
    'SO-261116-0001',
    'Wholesale dealer dispatch to Bengaluru',
    'Admin',
    NOW() - INTERVAL '1 day'
),
(
    'c1111111-1111-1111-1111-111111111003',
    'b1111111-1111-1111-1111-111111111006',
    'SHT-30',
    '30 Shots Multi-Colour Aerial Repeater',
    'Standard',
    'adjustment',
    -5.00,
    20.00,
    15.00,
    'AUD-261116-01',
    'Damaged packaging in warehouse handling',
    'Manager',
    NOW() - INTERVAL '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- 4. Sample Purchase Order (From Standard Fireworks, Sivakasi)
INSERT INTO public.purchase_orders (
    id, po_no, supplier_id, supplier_name, supplier_phone, supplier_gstin, order_date, expected_date, status, subtotal, tax_amount, total_amount, payment_status, paid_amount, notes, created_by
) VALUES (
    'd1111111-1111-1111-1111-111111111001',
    'PO-261110-0001',
    'a1111111-1111-1111-1111-111111111003',
    'Standard Fireworks Industries Ltd',
    '9442111222',
    '33AAACS5555M1Z8',
    CURRENT_DATE - INTERVAL '6 days',
    CURRENT_DATE - INTERVAL '1 day',
    'received',
    52000.00,
    9360.00,
    61360.00,
    'paid',
    61360.00,
    'Full lorry consignment delivered to Hosur Godown',
    'Admin'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.purchase_order_items (
    id, po_id, product_id, product_code, product_name, brand, unit, qty, unit_cost, line_total
) VALUES
(
    'e1111111-1111-1111-1111-111111111001',
    'd1111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111001',
    'SPK-10',
    '10 cm Electric Sparklers',
    'Standard',
    'box',
    500.00,
    20.00,
    10000.00
),
(
    'e1111111-1111-1111-1111-111111111002',
    'd1111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111005',
    'GAR-1000',
    '1000 Wala Garland Cracker',
    'Standard',
    'pcs',
    200.00,
    210.00,
    42000.00
) ON CONFLICT (id) DO NOTHING;

-- 5. Sample Sale Order with LR Transport Logistics & Active Dispatch Alert
INSERT INTO public.sale_orders (
    id, so_no, client_id, customer_name, customer_phone, customer_address, customer_gstin, order_date, delivery_due_date, status, pricing_type, subtotal, discount_amount, total_amount, payment_status, paid_amount, transport_name, lr_number, vehicle_number, destination, notes, created_by
) VALUES (
    'f1111111-1111-1111-1111-111111111001',
    'SO-261117-0001',
    'a1111111-1111-1111-1111-111111111001',
    'Rajesh Kumar (Sri Venkateshwara Crackers)',
    '9842154321',
    'Shop No. 4, APMC Yard, Yeshwanthpur, Bengaluru',
    '29AAACV1234F1Z2',
    CURRENT_DATE,
    CURRENT_DATE, -- Due today! Triggers Dispatch Alert Banner
    'packed',     -- Packed and ready to load on lorry
    'wholesale',
    34100.00,
    0.00,
    34100.00,
    'partial',
    20000.00,
    'VRL Logistics',
    'VRL-7849102',
    'KA 01 AH 5678',
    'Bengaluru (Yeshwanthpur Hub)',
    'Requires waterproof tarpaulin covering for parcel',
    'Admin'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sale_order_items (
    id, so_id, product_id, product_code, product_name, brand, unit, qty, unit_price, line_total
) VALUES
(
    'fa111111-1111-1111-1111-111111111001',
    'f1111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111001',
    'SPK-10',
    '10 cm Electric Sparklers',
    'Standard',
    'box',
    50.00,
    24.00,
    1200.00
),
(
    'fa111111-1111-1111-1111-111111111002',
    'f1111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111003',
    'CHK-DLX',
    'Ground Deluxe Chakkar (10 Pcs)',
    'Standard',
    'box',
    100.00,
    68.00,
    6800.00
),
(
    'fa111111-1111-1111-1111-111111111003',
    'f1111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111005',
    'GAR-1000',
    '1000 Wala Garland Cracker',
    'Standard',
    'pcs',
    50.00,
    210.00,
    10500.00
),
(
    'fa111111-1111-1111-1111-111111111004',
    'f1111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111006',
    'SHT-30',
    '30 Shots Multi-Colour Aerial Repeater',
    'Standard',
    'box',
    37.00,
    420.00,
    15540.00
) ON CONFLICT (id) DO NOTHING;

-- 6. Sample Formal Tax Invoice (HSN 3604, 18% IGST Inter-state to Bengaluru)
INSERT INTO public.invoices (
    id, invoice_no, so_id, client_id, customer_name, customer_phone, customer_address, customer_gstin, invoice_date, due_date, pricing_type, subtotal, discount_amount, taxable_amount, gst_rate, cgst, sgst, igst, round_off, total_amount, payment_status, paid_amount, payment_mode, transport_name, lr_number, vehicle_number, notes, created_by
) VALUES (
    'fb111111-1111-1111-1111-111111111001',
    'INV-2611-0001',
    'f1111111-1111-1111-1111-111111111001',
    'a1111111-1111-1111-1111-111111111001',
    'Sri Venkateshwara Crackers Wholesale',
    '9842154321',
    'Shop No. 4, APMC Yard, Yeshwanthpur, Bengaluru - 560022',
    '29AAACV1234F1Z2',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '15 days',
    'wholesale',
    34100.00,
    0.00,
    34100.00,
    18.00,
    0.00,    -- 0 CGST (Inter-state outside TN)
    0.00,    -- 0 SGST
    6138.00, -- 18% IGST
    0.00,
    40238.00,
    'partial',
    20000.00,
    'upi',
    'VRL Logistics',
    'VRL-7849102',
    'KA 01 AH 5678',
    'Advance Rs. 20,000 received via GPay. Balance Rs. 20,238 on delivery.',
    'Admin'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoice_items (
    id, invoice_id, product_id, product_code, product_name, brand, hsn_code, unit, qty, unit_price, discount_percent, taxable_value, line_total
) VALUES
(
    'fc111111-1111-1111-1111-111111111001',
    'fb111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111001',
    'SPK-10',
    '10 cm Electric Sparklers',
    'Standard',
    '3604',
    'box',
    50.00,
    24.00,
    0.00,
    1200.00,
    1200.00
),
(
    'fc111111-1111-1111-1111-111111111002',
    'fb111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111003',
    'CHK-DLX',
    'Ground Deluxe Chakkar (10 Pcs)',
    'Standard',
    '3604',
    'box',
    100.00,
    68.00,
    0.00,
    6800.00,
    6800.00
),
(
    'fc111111-1111-1111-1111-111111111003',
    'fb111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111005',
    'GAR-1000',
    '1000 Wala Garland Cracker',
    'Standard',
    '3604',
    'pcs',
    50.00,
    210.00,
    0.00,
    10500.00,
    10500.00
),
(
    'fc111111-1111-1111-1111-111111111004',
    'fb111111-1111-1111-1111-111111111001',
    'b1111111-1111-1111-1111-111111111006',
    'SHT-30',
    '30 Shots Multi-Colour Aerial Repeater',
    'Standard',
    '3604',
    'box',
    37.00,
    420.00,
    0.00,
    15540.00,
    15540.00
) ON CONFLICT (id) DO NOTHING;

