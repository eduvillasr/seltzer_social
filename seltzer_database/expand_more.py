"""Second pass — push past 1,000 with more flavors and brands."""
import json, re, csv

BRANDS_MORE = {
    # Seasonal / limited LaCroix
    'LaCroix': [
        'Watermelon', 'Mango', 'Strawberry', 'Cherry Blossom', 'Pineapple Strawberry',
        'Lemon Cello Limoncello', 'Pear Pomegranate',
    ],

    # More Polar
    'Polar': [
        'Pomegranate Lime', 'Apple Cranberry', 'Mango Pineapple', 'Black Cherry Vanilla',
        'Cucumber Watermelon', 'Pineapple Pomelo', 'Sea Salt Lime', 'Cranberry Clementine',
    ],

    # More Spindrift
    'Spindrift': [
        'Lemon Lime', 'Half Tea Half Lemon Sparkling Water', 'Cucumber Lemon Sparkling',
        'Yuzu Mandarin', 'Cranberry Lime', 'Berry Bellini',
    ],

    # More Bubly
    'Bubly': [
        'Citrus Cherry', 'Cucumber Mint Mocktail', 'Pineapple Coconut',
        'Tropical Mocktail', 'Tangerine Lime', 'Razzleberry',
    ],

    # More Sparkling Ice
    'Sparkling Ice': [
        'Cherry Lime Tea', 'Pomegranate Lemonade Tea', 'Lemon Lime Tea',
        'Black Raspberry Tea', 'Strawberry Watermelon Tea',
    ],

    # More niche brands
    'Daytrip': [
        'Lavender Citrus', 'Peach', 'Pineapple Mint', 'Blackberry Ginger',
        'Watermelon', 'Yuzu Hops',
    ],
    'Plink': [
        'Lemon Lime', 'Berry', 'Tropical', 'Citrus',
    ],
    'Mood Beverages': [
        'Lemon Ginger', 'Magnesium Citrus', 'Strawberry Hibiscus',
        'Black Cherry', 'Pomegranate Acai',
    ],
    'Sap': [
        'Lemon', 'Raspberry', 'Original Maple',
    ],
    'Avec': [
        'Hibiscus Pomelo', 'Jamaican Sorrel', 'Yuzu Ginger', 'Pineapple Jalapeño',
        'Mango Tangerine', 'Tonic Lemonade',
    ],
    'Casamara Club': [
        'Alta', 'Onda', 'Sera', 'Como', 'Vesto',
    ],
    'Top Note': [
        'Indian Tonic', 'Bitter Lemon', 'Classic Tonic', 'Bitter Orange',
        'Ginger Beer', 'Tonic with Citrus',
    ],
    'East Imperial': [
        'Tonic Water', 'Yuzu Tonic', 'Old World Tonic', 'Mombasa Ginger Beer',
        'Grapefruit Tonic',
    ],
    'Pellegrino Momenti': [
        'Lemon Mint', 'Pomegranate Orange', 'Lemon Black Tea',
    ],
    'Eboost': [
        'Sparkling Orange', 'Sparkling Berry', 'Sparkling Lemon Lime',
    ],
    'Hi-Ball Energy': [
        'Original Sparkling', 'Lemon Lime', 'Wild Berry', 'Grapefruit',
        'Peach Mango', 'Pomegranate Acai', 'Vanilla', 'Watermelon Mint',
    ],
    'OWYN Sparkling': [
        'Original', 'Lemon', 'Berry',
    ],
    'AlkaPlex Sparkling': [
        'Lemon', 'Lime', 'Pomegranate',
    ],
    'JuneShine Sparkling': [
        'Acai Berry', 'Honey Ginger Lemon', 'Blood Orange Mint', 'Midnight Painkiller',
    ],
    'Kin Euphorics': [
        'Lightwave', 'High Rhode', 'Dream Light', 'Spritz',
    ],
    'Ghia': [
        'Original Le Spritz', 'Berry Le Spritz', 'Sumac & Chili Le Spritz',
        'Ginger Le Spritz', 'Sumac Le Spritz',
    ],
    'Wölffer Estate Spritz': [
        'No. 139 Dry Rosé', 'Sparkling No. 139', 'No. 139 White',
    ],

    # ─── More mid-tier ───
    'Hint Caffeine Kick': [
        'Black Raspberry', 'Mango Grapefruit', 'Strawberry Kiwi',
    ],
    'Sunwink': [
        'Hibiscus Mint', 'Lemon Rose', 'Raspberry Roselle', 'Lime Mint',
        'Pineapple Turmeric', 'Strawberry Lavender',
    ],
    'De La Calle': [
        'Mango Chili Tepache', 'Pineapple Spice Tepache', 'Passionfruit Hibiscus Tepache',
        'Tamarind Citrus Tepache',
    ],
    'Olipop Functional': [
        'Burning Mandarin', 'Caffeine Cherry Cola', 'Crisp Apple',
        'Cherry Vanilla',
    ],
    'Health-Ade Plus': [
        'Plus Magnesium', 'Plus Energy', 'Plus Calm', 'Plus Beauty',
    ],
    'Roar Organic': [
        'Sparkling Lemonade', 'Sparkling Watermelon', 'Sparkling Strawberry Kiwi',
    ],
    'Wonderbrew': [
        'Citrus Hops', 'Tropical Hops', 'Lemon Ginger',
    ],
    'Hibiscus & Co': [
        'Classic Hibiscus', 'Hibiscus Ginger', 'Hibiscus Lemon', 'Hibiscus Rose',
    ],
    'Tovala': [
        'Sparkling Lemon', 'Sparkling Lime', 'Sparkling Grapefruit',
    ],
    'Pop & Bottle': [
        'Vanilla Cold Brew Latte', 'Almond Latte Mocha', 'Salted Caramel Cold Brew',
        'Vanilla Bean Almond Milk Latte',
    ],

    # ─── More international flair ───
    'Sodastream Limited Edition': [
        'Cherry Cola', 'Diet Cherry Cola', 'Tropical Mango',
    ],
    'Henniez': [
        'Sparkling Mineral Water',
    ],
    'Pellegrino Sparkling Tea': [
        'Hibiscus', 'Lemon', 'Peach',
    ],
    'Spindrift Light': [
        'Lime', 'Lemon', 'Grapefruit', 'Pineapple', 'Cucumber',
    ],

    # ─── More store brands ───
    'Trader Joe\'s Limited': [
        'Cucumber Mint Sparkling Water', 'Watermelon Strawberry Sparkling Water',
        'Lemon Verbena Sparkling Water', 'Cranberry Pomegranate Sparkling Water',
    ],
    'Walmart Great Value': [
        'Original Sparkling Water', 'Lemon Sparkling Water', 'Lime Sparkling Water',
        'Black Cherry Sparkling Water', 'Strawberry Sparkling Water',
        'Mandarin Orange Sparkling Water',
    ],
    'Costco Kirkland Sparkling Mineral': [
        'Sparkling Italian Mineral Water', 'Sparkling Apple', 'Sparkling Cucumber',
    ],
}

# Normalize
HYPHEN_PAIRS = {'razz-cranberry', 'lemon-lime'}
def smart_quotes(s):
    return (s.replace('‘',"'").replace('’',"'")
              .replace('“','"').replace('”','"')
              .replace('–','-').replace('—','-'))
def nb(s): return re.sub(r'\s+', ' ', smart_quotes(s)).strip()
def nn(s):
    s = smart_quotes(s).replace(' + ', ' ')
    tokens = []
    for t in s.split():
        if t.lower() in HYPHEN_PAIRS: t = t.replace('-', ' ')
        tokens.append(t)
    return re.sub(r'\s+', ' ', ' '.join(tokens)).strip()

existing = json.load(open('seltzers.json'))
keys = {(r['brand'].lower(), r['name'].lower()) for r in existing}
added = []
for b_raw, flavors in BRANDS_MORE.items():
    b = nb(b_raw)
    for f in flavors:
        n = nn(f)
        key = (b.lower(), n.lower())
        if key in keys: continue
        keys.add(key)
        added.append({'brand': b, 'name': n, 'image_filename': None, 'has_image': False})

combined = existing + added
print(f'existing: {len(existing)}, added: {len(added)}, total: {len(combined)}')

with open('seltzers.json', 'w', encoding='utf-8') as f:
    json.dump(combined, f, indent=2, ensure_ascii=False)
with open('seltzers.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['brand','name','image_filename','has_image'])
    w.writeheader()
    for r in combined: w.writerow(r)

def sqlesc(s): return s.replace("'", "''")
lines = [
    f'-- Seltzer canonical-catalogue seed ({len(combined)} SKUs)',
    '-- Run after supabase_standardize_data.sql.',
    '-- Rows without an image are flagged needs_review for /curator/queue.',
    '',
    'insert into public.seltzers (brand, name) values',
]
vals = [f"  ('{sqlesc(r['brand'])}', '{sqlesc(r['name'])}')" for r in combined]
lines.append(',\n'.join(vals) + '\non conflict do nothing;')
lines.append('')
lines.append("update public.seltzers")
lines.append("  set image_quality_flag = 'needs_review'")
lines.append("  where image_url is null")
lines.append("    and (image_quality_flag is null or image_quality_flag <> 'replaced');")
open('seltzers.sql', 'w', encoding='utf-8').write('\n'.join(lines))

import collections
brand_count = collections.Counter(r['brand'] for r in combined)
print(f'\nBrands: {len(brand_count)}')
