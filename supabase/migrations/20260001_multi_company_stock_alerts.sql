-- ============================================================
-- VNA Traders – Multi-Company + Stock Alerts Migration
-- Run this in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- ─── 1. COMPANIES TABLE ───────────────────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS state_code VARCHAR(5);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS upi_id TEXT;
-- (Optionally nullify old columns instead of dropping to avoid data loss)
-- ALTER TABLE companies DROP COLUMN IF EXISTS code;
-- ALTER TABLE companies DROP COLUMN IF EXISTS legal_name;
-- ALTER TABLE companies DROP COLUMN IF EXISTS pan;
-- ALTER TABLE companies DROP COLUMN IF EXISTS logo_url;

-- ─── 2. PROFILES (USERS) TABLE ────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);

-- ─── 3. PRODUCTS TABLE ────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);

-- ─── 4. CLIENTS TABLE ─────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_company_id ON clients(company_id);

-- ─── 5. BILLS TABLE ───────────────────────────────────────
ALTER TABLE bills ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
-- Drop old company_name text column (now replaced by FK)
ALTER TABLE bills DROP COLUMN IF EXISTS company_name;
CREATE INDEX IF NOT EXISTS idx_bills_company_id ON bills(company_id);

-- ─── 6. SALE ORDERS TABLE ─────────────────────────────────
ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE sale_orders DROP COLUMN IF EXISTS company_name;
CREATE INDEX IF NOT EXISTS idx_sale_orders_company_id ON sale_orders(company_id);

-- ─── 7. PURCHASE ORDERS TABLE ─────────────────────────────
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders DROP COLUMN IF EXISTS company_name;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON purchase_orders(company_id);

-- ─── 8. QUOTATIONS TABLE ──────────────────────────────────
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE quotations DROP COLUMN IF EXISTS company_name;
CREATE INDEX IF NOT EXISTS idx_quotations_company_id ON quotations(company_id);

-- ─── 9. INVOICES TABLE ────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE invoices DROP COLUMN IF EXISTS company_name;
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON invoices(company_id);

-- ─── 10. STOCK MOVEMENTS TABLE ────────────────────────────
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_id ON stock_movements(company_id);

-- ─── 11. TRANSPORT ENTRIES TABLE ──────────────────────────
ALTER TABLE transport_entries ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transport_entries_company_id ON transport_entries(company_id);

-- ─── 12. DEFAULT COMPANY SEED ─────────────────────────────
-- Upsert VNA TRADERS as the primary default company
INSERT INTO companies (
  id, name, trade_name, gstin, phone, email, address, city, state,
  state_code, pincode, bank_name, bank_account_no, bank_ifsc,
  bank_branch, upi_id, receipt_footer, is_default, is_active,
  created_at, updated_at
) VALUES (
  'c1111111-1111-1111-1111-111111110001',
  'VNA TRADERS',
  'VNA Crackers & Fireworks Wholesale',
  '33ACSPV5299F1Z5',
  '+91 94431 23456',
  'vnatraders2026@gmail.com',
  'Jeermangalam, Hosur',
  'Hosur',
  'Tamil Nadu',
  '33',
  '635109',
  'State Bank of India',
  '38421098451',
  'SBIN0001234',
  'Hosur Main Branch',
  '9443123456@sbi',
  'Thank you for choosing VNA Traders! Wishing you a bright and safe celebration.',
  true,
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  trade_name   = EXCLUDED.trade_name,
  state_code   = EXCLUDED.state_code,
  upi_id       = EXCLUDED.upi_id,
  updated_at   = NOW();

-- ─── 13. BACKFILL: assign existing rows to default company ─
-- Only run if you want all old data linked to VNA TRADERS
-- (safe, skips rows that already have a company_id)
UPDATE products       SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE clients        SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE bills          SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE sale_orders    SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE purchase_orders SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE quotations     SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE invoices       SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE stock_movements SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;
UPDATE transport_entries SET company_id = 'c1111111-1111-1111-1111-111111110001' WHERE company_id IS NULL;

