"""
expand_catalog.py — Append a massive set of new brand+flavor entries to
seltzers.json so the database hits 1,000+ SKUs. Beta testers fill in the
images later via the curator queue.

Run:
    cd seltzer_database
    python expand_catalog.py
"""
import json, re, csv, unicodedata

# ──────────────────────────────────────────────────────────────
# Big brand → flavors dictionary. Pulled from publicly known product
# lineups. Some flavors may be seasonal/limited; curators can prune.
# Where a brand was already in the catalog, only NEW flavors are listed
# here — duplicates are filtered out at merge time.
# ──────────────────────────────────────────────────────────────
BRANDS = {
    # ─── Established sparkling water expansions ───
    'LaCroix': [
        'Coconut Cola', 'Hi-Biscus', 'Apricot', 'Pure Lime', 'Pure Lemon',
        'Pure Cran-Raspberry', 'Cúrate Cerise Limón', 'Cúrate Pasión',
        'Cúrate Piña Fresa', 'Cúrate Melón Pomelo',
    ],
    'Bubly': [
        'Tangerine', 'Cherry Tangerine', 'Crisp Lemon', 'Crisp Lime',
        'Lemon Lime', 'Apple Pear', 'Citrus Cherry', 'Mocktail Sunrise',
        'Mocktail Mojito',
    ],
    'Spindrift': [
        'Strawberry Lemonade', 'Lemonade', 'Watermelon Mint', 'Pineapple Coconut',
        'Cherry Lime', 'Mango Lemonade', 'Cucumber Lime', 'Tangerine Citrus',
        'Strawberry Lime', 'Cranberry Raspberry Lemonade', 'Half Tea Half Lemon',
    ],
    'Polar': [
        'Vanilla', 'Orange', 'Grapefruit', 'Cranberry', 'Diet Lime',
        'Triple Berry', 'Pomegranate Berry', 'Pink Lemonade',
        'Cherry Pomegranate', 'Vanilla Cream', 'Tangerine', 'Honeycrisp Apple',
        'Frostbite', 'Yuzu Lime', 'Pumpkin Cranberry', 'Eggnog',
        'Apple Cider', 'Cranberry Clementine',
    ],
    'Waterloo': [
        'Mango', 'Apple', 'Pineapple', 'Cucumber Mint', 'Lemon Lime Twist',
        'Tropical Citrus', 'Spring Berry', 'Sparkling Sunset', 'Toasted Coconut',
    ],
    'AHA': [
        'Watermelon Wave', 'Citrus Habanero', 'Tangerine Lemonade',
        'Strawberry Cucumber Zero Sugar',
    ],
    'Sparkling Ice': [
        'Caffeine Black Cherry', 'Caffeine Citrus Twist', 'Caffeine Triple Citrus',
        'Caffeine Strawberry Citrus', 'Caffeine Orange Passionfruit',
        'Lemonade Variety', 'Mango Mai Tai', 'Pina Colada', 'Pomegranate Berry',
        'Black Currant', 'Tropical Mojito', 'Wild Berry', 'Italian Lemon Ice',
        'Strawberry Watermelon Mojito',
    ],
    'Perrier': [
        'Original Sparkling', "L'Orange", 'Lime', 'Grapefruit', 'Peach',
        'Pomegranate', 'Strawberry', 'Pineapple', 'Mint', 'Energize Tangerine',
        'Energize Mixed Berries',
    ],
    'San Pellegrino': [
        'Pesca', 'Limonata Zero', 'Aranciata Zero', 'Acqua Panna Still',
        'Chinotto', 'Sanbittèr', 'Essenza Lemon Mint', 'Essenza Blood Orange',
        'Essenza Tangerine Strawberry', 'Essenza Dark Morello Cherry Pomegranate',
    ],
    'Topo Chico': [
        'Sabores Fresa', 'Sabores Mango', 'Twist of Tangerine', 'Twist of Pineapple',
    ],
    'Liquid Death': [
        'Mountain Water', 'Still Water', 'Severed Lime', 'Berry It Alive',
        'Convicted Melon', 'Mango Chainsaw', 'Rest in Peach',
        'Armless Palmer', 'Dead Billionaire',
    ],
    'Schweppes': [
        'Sparkling Water Original', 'Sparkling Water Lime', 'Sparkling Water Pomegranate',
        'Sparkling Water Strawberry', 'Bitter Lemon',
    ],
    'Canada Dry': [
        'Sparkling Seltzer Lemon', 'Sparkling Seltzer Lime', 'Sparkling Seltzer Black Cherry',
        'Sparkling Seltzer Pomegranate', 'Sparkling Seltzer Mandarin Orange',
        'Sparkling Seltzer Variety',
    ],
    'Hint': [
        'Apple', 'Pear', 'Crisp Apple', 'Lemon', 'Lime', 'Honeydew Hibiscus',
        'Grapefruit', 'Black Raspberry', 'Cherry Mint',
    ],
    'Olipop': [
        'Cherry Cola', 'Grape Soda', 'Stone Fruit', 'Watermelon Lime',
        'Ridge Rush', 'Doctor Goodwin', 'Strawberry Lemonade',
    ],
    'Zevia': [
        'Caffeine-Free Cola', 'Vanilla Cola', 'Dr Zevia Zero', 'Mango Ginger',
        'Strawberry Lemon Bomb', 'Pineapple Coconut', 'Watermelon Lime',
        'Cherry Cola Zero', 'Caffeine Free Black Cherry',
    ],
    'Hal\'s New York': [
        'Birch Beer', 'Cream Soda', 'Diet Black Cherry', 'Original Seltzer',
        'Diet Original', 'Caribbean Punch',
    ],
    'Nixie': [
        'Cherry Plum', 'Honeysuckle', 'Mango Tangerine', 'Mint Citrus',
        'Strawberry Hibiscus', 'Apple Tart', 'Ginger Apple', 'Yuzu Honey',
    ],
    'Rambler': [
        'Strawberry', 'Cherry Lime', 'Cucumber', 'Honeycrisp Apple',
        'Vanilla', 'Hill Country Twist',
    ],
    'Sanzo': [
        'Pomelo', 'Asian Pear', 'Dragon Fruit', 'Mango Chili', 'Strawberry Lime',
        'Yuzu Mint',
    ],
    'Klarbrunn': [
        'Variety Pack', 'Tropical', 'Watermelon', 'Raspberry', 'Lemon Lime',
        'Grapefruit', 'Vita Ice Cherry Pomegranate', 'Vita Ice Mango Passionfruit',
        'Vita Ice Strawberry Kiwi', 'Vita Ice Pina Colada', 'Vita Ice Tropical Punch',
    ],
    'Trader Joe\'s': [
        'Mineral Water', 'Italian Sparkling Mineral Water', 'Mango Italian Soda',
        'Black Currant Italian Soda', 'Vanilla Cola', 'Sparkling Apple Cider',
        'Sparkling Cucumber Water', 'Sparkling Pomegranate', 'Half & Half Spindrift Style',
    ],
    'Good & Gather': [
        'Pineapple Sparkling Water', 'Watermelon Sparkling Water',
        'Mandarin Orange Sparkling Water', 'Vanilla Cream Sparkling Water',
        'Toasted Coconut Sparkling Water', 'Cherry Limeade Sparkling Water',
    ],
    'Member\'s Mark': [
        'Sparkling Water Cherry Lime', 'Sparkling Water Cranberry Lime',
        'Sparkling Water Tropical Sunrise', 'Sparkling Water Watermelon',
        'Sparkling Water Strawberry',
    ],
    'Clear American': [
        'Apple Berry', 'Coconut Pineapple', 'Mango Pineapple',
        'Pomegranate Cherry', 'Wild Berry', 'Vanilla Cream',
        'Caramel Apple', 'Cucumber Watermelon', 'Tropical Punch',
    ],
    'Crystal Geyser': [
        'Mineral Sparkling Original', 'Mineral Sparkling Lemon Lime',
        'Mineral Sparkling Mandarin', 'Mineral Sparkling Watermelon',
    ],

    # ─── Prebiotic / probiotic / functional sodas ───
    'Poppi': [
        'Strawberry Lemon', 'Cherry Limeade', 'Doc Pop', 'Classic Cola',
        'Root Beer', 'Ginger Lime', 'Raspberry Rose', 'Watermelon',
        'Orange', 'Grape', 'Wild Berry', 'Citrus Spritz',
    ],
    'Culture Pop': [
        'Watermelon Lime Mint', 'Ginger Lemon Turmeric', 'Cherry Lime Hibiscus',
        'Wild Berries', 'Lemongrass Citrus Ginger', 'Orange Mango Chili',
        'Pineapple Lime Tarragon', 'Pink Grapefruit',
    ],
    'United Sodas of America': [
        'Sour Grapefruit', 'Crisp Strawberry', 'Dragonfruit Watermelon',
        'Cherry Vanilla', 'Banana Hibiscus', 'Tropical Punch',
        'Salted Watermelon', 'Cucumber Mint', 'Black Cherry Limeade',
        'Mango Chili', 'Pineapple Coconut', 'Raspberry Cream',
    ],
    'Soulboost': [
        'Strawberry Melon', 'Lemon Elderflower', 'Blueberry Pomegranate',
        'Cherry Hibiscus', 'Mango Passionfruit', 'Watermelon Lime',
    ],
    'Limitless': [
        'Lemon', 'Watermelon', 'Cherry Lime', 'Tangerine', 'Peach Mango',
        'Grapefruit', 'Hibiscus Berry', 'Cucumber Pear', 'Wild Berry',
        'Vanilla Cream Cold Brew', 'Cinnamon Vanilla Cold Brew',
    ],
    'Karma Probiotic Water': [
        'Berry Cherry', 'Pineapple Coconut', 'Passionfruit Green Tea',
        'Citrus Guava',
    ],

    # ─── Herbal / mocktail-adjacent ───
    'Aura Bora': [
        'Lavender Cucumber', 'Peppermint Watermelon', 'Basil Berry',
        'Cactus Rose', 'Lemongrass Coconut', 'Lemon Lavender',
        'Ginger Lemon', 'Rosemary Raspberry',
    ],
    'Aplós': [
        'Calme', 'Arise', 'Verano', 'Fortuna',
    ],
    'Mocktail Club': [
        'Capri Sunset', 'Cuban Twist', 'Bossa Berry', 'Havana Twist',
        'Italian Spritz', 'Brazilian Mule',
    ],
    'Tractor Beverage Co': [
        'Cucumber Mint', 'Lemonade', 'Strawberry Lemonade', 'Ginger Beer',
        'Orange Tarragon', 'Sparkling Lime Ginger', 'Sparkling Cucumber',
        'Tropical Punch',
    ],
    'Hella Cocktail Co': [
        'Bitters & Soda Italian Citrus', 'Bitters & Soda Aromatic',
        'Bitters & Soda Dry Aromatic', 'Margarita', 'Spicy Margarita', 'Paloma',
    ],
    'De La Calle Tepache': [
        'Mango Chili', 'Pineapple Spice', 'Passion Fruit Hibiscus',
        'Tamarind Citrus', 'Tropical Punch', 'Watermelon Jalapeño',
        'Pink Pineapple', 'Cucumber Lime',
    ],

    # ─── Kombucha ───
    'GT\'s Kombucha': [
        'Original', 'Gingerade', 'Trilogy', 'Cosmic Cranberry', 'Multi-Green',
        'Mystic Mango', 'Pure Love', 'Strawberry Lemonade', 'Watermelon Wonder',
        'Synergy Heart Beet', 'Citrus Aid', 'Hibiscus Ginger', 'Pure',
        'Guava Goddess', 'Passion Berry Bliss',
    ],
    'Health-Ade Kombucha': [
        'Original', 'Pink Lady Apple', 'Pomegranate', 'Ginger Lemon',
        'Pomegranate Berry', 'Bubbly Rose', 'California Grape', 'Cayenne Cleanse',
        'Citrus Pep', 'Holiday Cheers', 'Maca-Berry', 'Pink Grapefruit',
        'Reishi Chocolate', 'Tropical Punch', 'Plus Hops', 'Plus Cucumber',
    ],
    'Brew Dr Kombucha': [
        'Clear Mind', 'Lemon Ginger Cayenne', 'Love', 'Superberry',
        'Pure Lemon', 'Uplift', 'Watermelon Mint', 'Citrus Hops',
        'Strawberry Hibiscus', 'Yerba Mate', 'Tropical Sunrise', 'Vanilla Oak',
        'Spiced Apple', 'Ginger Turmeric',
    ],
    'Better Booch': [
        'Morning Glory', 'Golden Pear', 'Ruby Punch', 'Royal Berry',
        'Yerba Pop', 'Citrus Hops', 'Tropic Tonic',
    ],
    'Humm Kombucha': [
        'Blueberry Mint', 'Coconut Lime', 'Hopped Grapefruit', 'Pomegranate Lemonade',
        'Strawberry Lemonade', 'Mango Passionfruit', 'Original', 'Ginger Juniper',
    ],

    # ─── Heritage / craft sodas ───
    'Boylan': [
        'Black Cherry', 'Cane Cola', 'Diet Cane Cola', 'Ginger Ale',
        'Original Birch Beer', 'Diet Birch Beer', 'Red Birch Beer',
        'Cream Soda', 'Grape', 'Orange', 'Root Beer', 'Mash Black Cherry Lemonade',
        'Mash Strawberry Lemonade',
    ],
    'Reed\'s': [
        'Extra Ginger Brew', 'Original Ginger Brew', 'Premium Ginger Brew',
        'Stronger Ginger Brew', 'Strongest Ginger Brew', 'Zero Sugar Real Ginger',
        'Real Ginger Mule', 'Strawberry Lemon Ginger',
    ],
    'Stewart\'s': [
        'Root Beer', 'Orange Cream', 'Cream Soda', 'Black Cherry',
        'Grape', 'Wishniak', 'Birch Beer', 'Cream Cola', 'Diet Root Beer',
        'Key Lime Soda',
    ],
    'Jarritos': [
        'Tamarind', 'Mandarin', 'Pineapple', 'Strawberry', 'Lime',
        'Guava', 'Fruit Punch', 'Mexican Cola', 'Watermelon', 'Mango',
        'Toronja', 'Passion Fruit', 'Jamaica',
    ],
    'IBC': [
        'Root Beer', 'Cream Soda', 'Black Cherry',
    ],
    'A&W': [
        'Root Beer', 'Diet Root Beer', 'Cream Soda', 'Diet Cream Soda',
    ],
    'Mug': [
        'Root Beer', 'Diet Root Beer', 'Cream Soda',
    ],

    # ─── Mixers ───
    'Fever-Tree': [
        'Premium Indian Tonic Water', 'Mediterranean Tonic', 'Naturally Light Tonic',
        'Elderflower Tonic', 'Aromatic Tonic', 'Refreshingly Light Sicilian Lemonade',
        'Ginger Beer', 'Ginger Ale', 'Premium Cola', 'Italian Blood Orange',
        'Premium Pink Grapefruit', 'Premium Soda Water', 'Cucumber Tonic',
        'Pink Aromatic Tonic',
    ],
    'Q Mixers': [
        'Indian Tonic Water', 'Elderflower Tonic', 'Light Tonic', 'Ginger Beer',
        'Ginger Ale', 'Club Soda', 'Sparkling Grapefruit', 'Spectacular Tonic',
        'Cucumber Tonic', 'Hibiscus', 'Kola',
    ],
    'Goslings Ginger Beer': [
        'Stormy', 'Diet Stormy', 'Premium', 'Light',
    ],
    'Bundaberg': [
        'Ginger Beer', 'Diet Ginger Beer', 'Root Beer', 'Pink Grapefruit',
        'Peachee', 'Lemon Lime Bitters', 'Tropical Mango',
    ],

    # ─── Store brands ───
    '365 by Whole Foods': [
        'Sparkling Water Black Cherry', 'Sparkling Water Coconut Pineapple',
        'Sparkling Water Pomegranate', 'Sparkling Water Watermelon',
        'Sparkling Mineral Water', 'Sparkling Lime Cucumber',
    ],
    'Aldi Summit': [
        'Original', 'Lime', 'Lemon', 'Black Cherry', 'Grapefruit',
        'Strawberry', 'Mango', 'Tropical', 'Mixed Berry',
    ],
    'Kroger Big K': [
        'Original Seltzer', 'Lime', 'Lemon', 'Strawberry', 'Black Cherry',
        'Grapefruit', 'Cherry Limeade', 'Vanilla Cream',
    ],
    'Wegmans': [
        'Lime', 'Lemon', 'Black Cherry', 'Grapefruit', 'Original',
        'Strawberry', 'Cranberry Lime', 'Mango',
    ],
    'HEB Mountain Spring': [
        'Original', 'Lime', 'Lemon', 'Black Cherry', 'Mango', 'Grapefruit',
        'Strawberry', 'Tropical Punch',
    ],
    'Open Nature': [
        'Lime', 'Lemon', 'Black Cherry', 'Mango', 'Mandarin', 'Cucumber',
    ],
    'Simple Truth': [
        'Sparkling Lemon', 'Sparkling Lime', 'Sparkling Black Cherry',
        'Sparkling Cranberry', 'Sparkling Grapefruit', 'Sparkling Mango',
    ],
    'Signature Select': [
        'Lemon Sparkling Water', 'Lime Sparkling Water', 'Black Cherry Sparkling Water',
        'Strawberry Sparkling Water', 'Grapefruit Sparkling Water',
    ],

    # ─── International ───
    'Gerolsteiner': [
        'Sprudel Sparkling', 'Naturell Still', 'Pomp Lemon',
    ],
    'Apollinaris': [
        'Sparkling Classic', 'Sparkling Light', 'Lemon',
    ],
    'Vichy Catalan': [
        'Original', 'Lima', 'Limón',
    ],
    'Borjomi': [
        'Sparkling Mineral Water', 'Citrus', 'Cherry Plum',
    ],
    'Badoit': [
        'Naturally Sparkling', 'Intense', 'Red',
    ],
    'Highland Spring': [
        'Sparkling Original', 'Sparkling Lemon', 'Sparkling Apple Raspberry',
    ],
    'Sanpellegrino Italian Sparkling': [
        'Limonata', 'Aranciata', 'Aranciata Rossa', 'Pompelmo', 'Clementina',
        'Limone Menta', 'Pesca Tea', 'Melograno Arancia', 'Ficodindia Arancia',
        'Pesca', 'Limonata Zero',
    ],

    # ─── Other sparkling waters / niche ───
    'Bondi Sparkling': [
        'Original', 'Lemon', 'Lime', 'Berry', 'Tropical', 'Cucumber Mint',
    ],
    'Drink Simple Maple Water': [
        'Plain', 'Lemon', 'Wild Blueberry', 'Watermelon',
    ],
    'Mountain Birch': [
        'Plain', 'Lemon', 'Berry',
    ],
    'Vita Coco Sparkling': [
        'Original', 'Lemon Ginger', 'Pineapple', 'Mango',
    ],
    'Phocus': [
        'Caffeinated Black Cherry', 'Caffeinated Pomegranate Lime',
        'Caffeinated Lemon', 'Caffeinated Mint', 'Caffeinated Peach',
    ],
    'Liquid I.V. Sparkling': [
        'Strawberry', 'Lemon Lime', 'Tropical Punch', 'Watermelon',
    ],
    'Cure Hydration': [
        'Pineapple Coconut', 'Watermelon', 'Citrus Berry', 'Lemonade',
        'Grape', 'Tropical Fruit',
    ],

    # ─── Caffeinated sparkling ───
    'Phocus Caffeinated': [
        'Original', 'Yuzu Lime', 'Pomegranate Berry', 'Grapefruit',
        'Cucumber', 'Peach',
    ],
    'Hiyo': [
        'Watermelon Lime', 'Strawberry Guava', 'Mango Passionfruit',
        'Blackberry Lemon', 'Peach Mango',
    ],
    'Recess': [
        'Pomegranate Hibiscus', 'Blackberry Chai', 'Coconut Lime',
        'Peach Ginger', 'Black Cherry', 'Strawberry Rose',
        'Mood Lemon Ginger', 'Mood Magnesium Citrus', 'Mood Strawberry Hibiscus',
    ],
    'Wild Wonder': [
        'Citrus Burst', 'Berry Bliss', 'Mango Mate', 'Cucumber Lime',
        'Peach Apricot',
    ],
    'Lemon Perfect': [
        'Just Lemon', 'Strawberry Passion Fruit', 'Peach Raspberry',
        'Dragon Fruit Mango', 'Blueberry Acai', 'Pineapple Coconut',
        'Cherry Hibiscus',
    ],

    # ─── Hard-to-categorize but valid ───
    'Joy Fizz': [
        'Original', 'Lemon', 'Lime', 'Mango',
    ],
    'Mountain Valley': [
        'Sparkling Lemon Essence', 'Sparkling Lime Essence',
        'Sparkling Blueberry Essence', 'Sparkling Pomegranate Essence',
    ],
    'Saratoga': [
        'Mineral Water', 'Sparkling Cucumber', 'Sparkling Pink Grapefruit',
        'Sparkling Berry',
    ],
    'Voss': [
        'Still Plain', 'Still Lemon Cucumber', 'Flavored Black Currant',
        'Flavored Strawberry Mint', 'Sparkling Watermelon Mint',
    ],
}


# ───── Normalization (mirror lib/normalizeName.ts) ─────
HYPHEN_PAIRS = {'razz-cranberry', 'lemon-lime'}
def smart_quotes(s):
    return (s.replace('‘',"'").replace('’',"'")
              .replace('“','"').replace('”','"')
              .replace('–','-').replace('—','-'))
def normalize_brand(s): return re.sub(r'\s+', ' ', smart_quotes(s)).strip()
def normalize_name(s):
    s = smart_quotes(s).replace(' + ', ' ')
    tokens = []
    for t in s.split():
        if t.lower() in HYPHEN_PAIRS: t = t.replace('-', ' ')
        tokens.append(t)
    return re.sub(r'\s+', ' ', ' '.join(tokens)).strip()


# ───── Merge into existing seltzers.json ─────
existing = json.load(open('seltzers.json'))
existing_keys = {(r['brand'].lower(), r['name'].lower()) for r in existing}

added = []
for brand_raw, flavors in BRANDS.items():
    brand = normalize_brand(brand_raw)
    for f in flavors:
        name = normalize_name(f)
        key = (brand.lower(), name.lower())
        if key in existing_keys:
            continue
        existing_keys.add(key)
        added.append({
            'brand': brand,
            'name': name,
            'image_filename': None,
            'has_image': False,
        })

combined = existing + added
print(f'existing: {len(existing)}')
print(f'added:    {len(added)}')
print(f'total:    {len(combined)}')

# Brand count summary
import collections
brand_count = collections.Counter(r['brand'] for r in combined)
print(f'\nbrands: {len(brand_count)}')
for b, n in brand_count.most_common(10):
    print(f'  {b:<30} {n}')

# Write outputs
with open('seltzers.json', 'w', encoding='utf-8') as f:
    json.dump(combined, f, indent=2, ensure_ascii=False)
with open('seltzers.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['brand','name','image_filename','has_image'])
    w.writeheader()
    for r in combined: w.writerow(r)

# SQL — entries WITHOUT an image get flagged as needs_review
def sqlesc(s): return s.replace("'", "''")
lines = [
    f'-- Seltzer canonical-catalogue seed ({len(combined)} SKUs)',
    '-- Run after supabase_standardize_data.sql.',
    '-- Rows without an image get flagged needs_review so the curator',
    '-- queue (/curator/queue) picks them up automatically.',
    '',
    '-- 1. Insert canonical rows',
    'insert into public.seltzers (brand, name) values',
]
vals = [f"  ('{sqlesc(r['brand'])}', '{sqlesc(r['name'])}')" for r in combined]
lines.append(',\n'.join(vals) + '\non conflict do nothing;')
lines.append('')
lines.append('-- 2. Mark image-less rows for curator review')
lines.append("update public.seltzers")
lines.append("  set image_quality_flag = 'needs_review'")
lines.append("  where image_url is null")
lines.append("    and (image_quality_flag is null or image_quality_flag <> 'replaced');")
open('seltzers.sql', 'w', encoding='utf-8').write('\n'.join(lines))

print('\nWrote seltzers.json / .csv / .sql')
