import pypdf
import re
from collections import defaultdict

pdf_path = r'C:\Users\Sanjayakumar K\.gemini\antigravity-ide\brain\d5f3ee50-62fd-4b26-afa9-6700335a9b51\.user_uploaded\media_1791824163494.pdf'
reader = pypdf.PdfReader(pdf_path)

products = []
unmatched = []

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
        if any(h in full_line for h in ['VNA Traders', 'Price List', '----', 'SNo Product', 'Manufacture', 'Classification', 'Page ', '12-Oct-2026']):
            continue
        if full_line in ['W', 'None', '']:
            continue
        
        texts = [it[1] for it in items]
        parsed = False

        # Pattern 1: ['1 C 120 Cm Twinkling Star 411.00', '11649']
        if len(texts) == 2:
            t0, t1 = texts[0], texts[1]
            m1 = re.match(r'^(\d+)\s+([A-Za-z])\s+(.+?)\s+([0-9]+(?:\.[0-9]+)?)$', t0)
            if m1 and t1.isdigit():
                sno, cat, name, rate = m1.groups()
                products.append({
                    'sno': int(sno),
                    'code': t1,
                    'cat': cat.upper(),
                    'name': name.strip(),
                    'rate': float(rate),
                    'page': page_idx + 1
                })
                parsed = True
            else:
                # Pattern 2: ['18 4450 F 1.75" Comet 1 Piece Mixed (2 Varietie', '261.00']
                m2 = re.match(r'^(\d+)\s+(\d+)\s+([A-Za-z])\s+(.+)$', t0)
                if m2:
                    sno, code, cat, name = m2.groups()
                    try:
                        rate = float(t1)
                        products.append({
                            'sno': int(sno),
                            'code': code,
                            'cat': cat.upper(),
                            'name': name.strip(),
                            'rate': rate,
                            'page': page_idx + 1
                        })
                        parsed = True
                    except:
                        pass
                else:
                    # Pattern 3: t0 is 'sno cat name' and t1 is 'rate code' or similar
                    m3 = re.match(r'^(\d+)\s+([A-Za-z])\s+(.+)$', t0)
                    m3_t1 = re.match(r'^([0-9]+(?:\.[0-9]+)?)\s+(\d+)$', t1)
                    if m3 and m3_t1:
                        sno, cat, name = m3.groups()
                        rate, code = m3_t1.groups()
                        products.append({
                            'sno': int(sno),
                            'code': code,
                            'cat': cat.upper(),
                            'name': name.strip(),
                            'rate': float(rate),
                            'page': page_idx + 1
                        })
                        parsed = True
                    else:
                        # Pattern 4: t0 has rate at end, t1 is code
                        pass

        if not parsed:
            unmatched.append((page_idx + 1, y, texts, full_line))

print(f"Total Parsed: {len(products)}")
print(f"Total Unmatched: {len(unmatched)}")
for u in unmatched:
    print(f"Page {u[0]} (y={u[1]}): {u[2]} | FULL: {u[3]}")
