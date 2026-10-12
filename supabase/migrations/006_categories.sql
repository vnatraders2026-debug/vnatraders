-- Migration 006: Cracker Categories
-- VNA Crackers Sivakasi Billing System

-- 1. Create public.categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for categories
DROP POLICY IF EXISTS "Allow authenticated users to read categories" ON public.categories;
CREATE POLICY "Allow authenticated users to read categories"
  ON public.categories FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert categories" ON public.categories;
CREATE POLICY "Allow authenticated users to insert categories"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update categories" ON public.categories;
CREATE POLICY "Allow authenticated users to update categories"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (true);

-- 2. Seed all standard Sivakasi cracker categories
INSERT INTO public.categories (id, name, is_active)
VALUES
  ('cat-1-sparklers', 'Sparklers', true),
  ('cat-2-ground-chakkars', 'Ground Chakkars', true),
  ('cat-3-flower-pots', 'Flower Pots', true),
  ('cat-4-rockets', 'Rockets', true),
  ('cat-5-bombs', 'Bombs & Sound Crackers', true),
  ('cat-6-bijili', 'Bijili Crackers', true),
  ('cat-7-shots', 'Single & Multi Shots', true),
  ('cat-8-sky-shots', 'Fancy Sky Shots', true),
  ('cat-9-novelties', 'Fancy Novelties', true),
  ('cat-10-twinkling-stars', 'Twinkling Stars', true),
  ('cat-11-fountains', 'Fountains & Cones', true),
  ('cat-12-garlands', 'Garlands (Wala Crackers)', true),
  ('cat-13-caps', 'Roll Caps & Ring Caps', true),
  ('cat-14-gift-boxes', 'Gift Boxes', true),
  ('cat-15-party-poppers', 'Party Poppers', true),
  ('cat-16-kids-special', 'Kids Special Crackers', true)
ON CONFLICT (name) DO NOTHING;
