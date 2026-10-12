import pypdf
import re
from collections import defaultdict

pdf_path = r'C:\Users\Sanjayakumar K\.gemini\antigravity-ide\brain\d5f3ee50-62fd-4b26-afa9-6700335a9b51\.user_uploaded\media_1791824163494.pdf'
reader = pypdf.PdfReader(pdf_path)

part_a = {}
part_b = {}
current_part = "A"

# The 6 items whose product name was captured at y=0 across pages 9, 10, 11, 12, 14
known_y0_names = {
    ("B", 18): ("F", "1.75\" Comet 1 Piece Mixed (2 Varieties)"),
    ("B", 42): ("F", "Asmaan Guru (11 Variants) 2\" Comet 1 Piece"),
    ("B", 63): ("F", "Colour Changing Balls 3\" Comet 1 Piece"),
    ("B", 85): ("F", "Friendly Fire 1.5\" Comet 12 Variants)"),
    ("B", 139): ("F", "Peanut (Double Shot) 2.5\" Comet 1 Piece"),
    ("B", 217): ("F", "Team Captain 1.75\" Comets (12 Variants)"),
}

category_map = {
    'C': 'Crackers',
    'F': 'Fancy',
    'G': 'Gift Box',
    'S': 'Sparklers',
    'U': 'Fancy'
}

for page_idx, page in enumerate(reader.pages):
    lines_by_y = defaultdict(list)
    
    def visitor(text, cm, tm, font_dict, font_size):
        if text.strip():
            y = round(tm[5])
            lines_by_y[y].append((tm[4], text.strip()))
    
    page.extract_text(visitor_text=visitor)
    
    for y in sorted(lines_by_y.keys()):
        items = sorted(lines_by_y[y], key=lambda x: x[0])
        full_line = ' '.join(it[1] for it in items).strip()
        
        if 'Part "A"' in full_line:
            current_part = "A"
            continue
        elif 'Part "B"' in full_line:
            current_part = "B"
            continue
            
        if full_line in ['W', 'None', '', 'RateCode', 'SNo Product Code Rate', 'Classification None']:
            continue
        if any(full_line.startswith(h) for h in ['VNA Traders', 'Price List', '----', 'SNo Product', 'Manufacture', '12-Oct-2026']):
            continue
        if 'Page ' in full_line and 'of 15' in full_line:
            continue
            
        texts = [it[1] for it in items]
        matched = False
        
        # Pattern 1: ['1 C 120 Cm Twinkling Star 411.00', '11649']
        if len(texts) == 2:
            t0, t1 = texts[0], texts[1]
            m1 = re.match(r'^(\d+)\s+([A-Za-z])\s+(.+?)\s+([0-9]+(?:\.[0-9]+)?)$', t0)
            if m1 and t1.isdigit():
                sno, cat_letter, name, rate = m1.groups()
                entry = {
                    'sno': int(sno),
                    'code': t1,
                    'cat_letter': cat_letter.upper(),
                    'category': category_map.get(cat_letter.upper(), 'Crackers'),
                    'name': name.strip(),
                    'rate': float(rate),
                    'part': current_part
                }
                if current_part == "A":
                    part_a[int(sno)] = entry
                else:
                    part_b[int(sno)] = entry
                matched = True
            else:
                # e.g. ['227 Flare Dance 3241.00', '22250']
                m_no_cat = re.match(r'^(\d+)\s+(.+?)\s+([0-9]+(?:\.[0-9]+)?)$', t0)
                if m_no_cat and t1.isdigit():
                    sno, name, rate = m_no_cat.groups()
                    entry = {
                        'sno': int(sno),
                        'code': t1,
                        'cat_letter': 'F',
                        'category': 'Fancy',
                        'name': name.strip(),
                        'rate': float(rate),
                        'part': current_part
                    }
                    if current_part == "A":
                        part_a[int(sno)] = entry
                    else:
                        part_b[int(sno)] = entry
                    matched = True

        # Pattern 2: Lines where name was at y=0, e.g. ['18', '4450', '261.00']
        if not matched and len(texts) == 3 and texts[0].isdigit() and texts[1].isdigit():
            sno = int(texts[0])
            code = texts[1]
            rate = float(texts[2])
            if (current_part, sno) in known_y0_names:
                cat_letter, name = known_y0_names[(current_part, sno)]
                entry = {
                    'sno': sno,
                    'code': code,
                    'cat_letter': cat_letter,
                    'category': category_map.get(cat_letter, 'Fancy'),
                    'name': name.strip(),
                    'rate': rate,
                    'part': current_part
                }
                if current_part == "A":
                    part_a[sno] = entry
                else:
                    part_b[sno] = entry
                matched = True

all_products = []
for sno in sorted(part_a.keys()):
    all_products.append(part_a[sno])
for sno in sorted(part_b.keys()):
    all_products.append(part_b[sno])

print(f"Total extracted products: {len(all_products)}")

# Generate SQL migration file
sql_lines = [
    "-- Migration 010: Insert Standard Fireworks 2026 Price List Products",
    "-- Brand: Standard",
    f"-- Total Products: {len(all_products)} (Part A: {len(part_a)}, Part B: {len(part_b)})",
    "",
    "-- 1. Ensure Brand 'Standard' exists",
    "INSERT INTO public.brands (name, is_active)",
    "VALUES ('Standard', true)",
    "ON CONFLICT (name) DO NOTHING;",
    "",
    "-- 2. Ensure Categories exist",
    "INSERT INTO public.categories (id, name, is_active)",
    "VALUES",
    "  ('cat-crackers', 'Crackers', true),",
    "  ('cat-fancy', 'Fancy', true),",
    "  ('cat-gift-box', 'Gift Box', true),",
    "  ('cat-sparklers', 'Sparklers', true)",
    "ON CONFLICT (name) DO NOTHING;",
    "",
    "-- 3. Insert Products for Standard Fireworks",
    "INSERT INTO public.products (code, name, category, unit, price, stock, is_active, brand)",
    "VALUES"
]

val_rows = []
for p in all_products:
    escaped_name = p['name'].replace("'", "''")
    val_rows.append(
        f"  ('{p['code']}', '{escaped_name}', '{p['category']}', 'box', {p['rate']:.2f}, 100, true, 'Standard')"
    )

sql_lines.append(",\n".join(val_rows))
sql_lines.extend([
    "ON CONFLICT (code) DO UPDATE SET",
    "  name = EXCLUDED.name,",
    "  category = EXCLUDED.category,",
    "  price = EXCLUDED.price,",
    "  brand = EXCLUDED.brand,",
    "  is_active = true,",
    "  updated_at = now();",
    ""
])

sql_content = "\n".join(sql_lines)
output_path = r"d:\ZEONY\Crakers-billing\supabase\migrations\010_insert_standard_products.sql"
with open(output_path, "w", encoding="utf-8") as f:
    f.write(sql_content)

print(f"SQL migration written successfully to {output_path}")
