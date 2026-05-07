"""
bulk_pull.py - try to fetch product images for every row in seltzers.json
that doesn't already have an image, using the Open Food Facts public API.

Coverage will be partial — Open Food Facts isn't exhaustive. Whatever it
finds, the script processes through process_image.py and saves to images/.
You'll see a summary at the end of how many it filled in vs. couldn't find.

Run:
    cd seltzer_database
    pip install Pillow
    python bulk_pull.py

If your source images already have transparent / white backgrounds (most
official packshots do), you don't need rembg. If you want background
removal, also: pip install rembg

The script:
  - skips SKUs that already have image_filename
  - searches Open Food Facts for "<brand> <flavor>"
  - picks the first result whose product_name matches both terms
  - downloads the front-of-package image
  - runs it through process_image.py
  - writes images/<slug>.webp and updates seltzers.json/.csv

Re-running is safe — it skips SKUs that already have a .webp file in images/.
"""
import json
import csv
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

from process_image import process_to_webp


HERE = Path(__file__).parent
IMG_DIR = HERE / 'images'
RAW_DIR = HERE / 'raw_downloads'
OFF_SEARCH = 'https://world.openfoodfacts.org/api/v2/search'
USER_AGENT = 'seltzer-social-bulk-pull/1.0 (offline tool)'


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))


def download(url, dst):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        dst.write_bytes(r.read())


def search_off(brand, name):
    q = brand + ' ' + name
    params = {
        'search_terms': q,
        'fields': 'code,product_name,brands,image_front_url,image_url',
        'page_size': '5',
    }
    url = OFF_SEARCH + '?' + urllib.parse.urlencode(params)
    try:
        data = fetch_json(url)
    except Exception as e:
        print('    OFF query failed:', e)
        return None
    products = data.get('products') or []
    brand_terms = [t.lower() for t in re.split(r'\s+', brand) if t]
    name_terms = [t.lower() for t in re.split(r'\s+', name) if t]
    for p in products:
        pname = (p.get('product_name') or '').lower()
        pbrand = (p.get('brands') or '').lower()
        # require both brand and at least one name token to match
        brand_match = any(bt in pbrand or bt in pname for bt in brand_terms)
        name_match = all(nt in pname for nt in name_terms if len(nt) > 2)
        img = p.get('image_front_url') or p.get('image_url')
        if brand_match and name_match and img:
            return img
    return None


def main():
    rows = json.loads((HERE / 'seltzers.json').read_text(encoding='utf-8'))
    IMG_DIR.mkdir(exist_ok=True)
    RAW_DIR.mkdir(exist_ok=True)

    todo = [r for r in rows if not r.get('image_filename')]
    print('To process: ' + str(len(todo)) + ' SKUs')
    print('')

    found = 0
    skipped = 0
    failed = 0
    for i, r in enumerate(todo, 1):
        slug = slugify(r['brand']) + '__' + slugify(r['name'])
        webp = IMG_DIR / (slug + '.webp')
        if webp.exists():
            skipped += 1
            continue
        print('[{0}/{1}] {2} / {3}'.format(i, len(todo), r['brand'], r['name']))
        url = search_off(r['brand'], r['name'])
        if not url:
            print('    no match in Open Food Facts')
            failed += 1
            time.sleep(0.5)
            continue
        raw = RAW_DIR / (slug + '.bin')
        try:
            download(url, raw)
        except Exception as e:
            print('    download failed:', e)
            failed += 1
            time.sleep(0.5)
            continue
        try:
            # OFF photos are user-uploaded — most have non-white backgrounds.
            # Try with skip_bg first; if rembg is installed, you can pass False.
            process_to_webp(raw, webp, skip_bg_removal=True)
            print('    OK -> ' + webp.name)
            r['image_filename'] = webp.name
            r['has_image'] = True
            found += 1
        except Exception as e:
            print('    pipeline failed:', e)
            failed += 1
        time.sleep(0.5)  # be polite to OFF

    # save updated catalog
    (HERE / 'seltzers.json').write_text(
        json.dumps(rows, indent=2, ensure_ascii=False), encoding='utf-8')

    with open(HERE / 'seltzers.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['brand', 'name', 'image_filename', 'has_image'])
        w.writeheader()
        for r in rows:
            w.writerow(r)

    print('')
    print('Summary:')
    print('  filled in: ' + str(found))
    print('  skipped (already had image): ' + str(skipped))
    print('  no source / failed: ' + str(failed))
    print('  total catalog rows: ' + str(len(rows)))
    n_with = sum(1 for r in rows if r.get('image_filename'))
    print('  rows with image now: ' + str(n_with) + ' / ' + str(len(rows)))


if __name__ == '__main__':
    main()
