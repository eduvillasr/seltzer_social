"""
add_image.py - process a single can image and add it to the database folder.

Usage:
    python add_image.py PATH/TO/SOURCE.png "Brand Name" "Flavor Name"

This will:
  1. Open the source image (PNG/JPG/WebP, anything Pillow understands)
  2. If the source has a transparent background (or you pass --skip-bg),
     center it on a 420x420 white square and save as WebP.
  3. Otherwise, try to remove the background using rembg (install with:
     pip install rembg)
  4. Save to images/<brand-slug>__<flavor-slug>.webp
  5. Append the new row to seltzers.json/.csv

Install dependencies:
    pip install Pillow
    pip install rembg          # optional, only if your source has a non-white bg
"""
import argparse
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

from process_image import process_to_webp


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('source', help='Path to source image (PNG/JPG/etc)')
    p.add_argument('brand', help='Brand name, e.g. "Bubly"')
    p.add_argument('name', help='Flavor or product name, e.g. "Blackberry"')
    p.add_argument('--skip-bg', action='store_true',
                   help='Skip background removal (use if source already has white/transparent bg)')
    args = p.parse_args()

    src = Path(args.source)
    if not src.exists():
        print('ERROR: source not found:', src)
        sys.exit(1)

    here = Path(__file__).parent
    img_dir = here / 'images'
    img_dir.mkdir(exist_ok=True)

    slug = slugify(args.brand) + '__' + slugify(args.name)
    dst = img_dir / (slug + '.webp')

    print('Processing', src.name, '->', dst.name)
    nbytes = process_to_webp(src, dst, skip_bg_removal=args.skip_bg)
    print('  wrote {0} ({1:.1f} KB)'.format(dst.name, nbytes / 1024))

    # update seltzers.json
    seltzers_path = here / 'seltzers.json'
    rows = json.loads(seltzers_path.read_text(encoding='utf-8')) if seltzers_path.exists() else []
    found = False
    for r in rows:
        if r['brand'].lower() == args.brand.lower() and r['name'].lower() == args.name.lower():
            r['image_filename'] = dst.name
            r['has_image'] = True
            found = True
            break
    if not found:
        rows.append({
            'brand': args.brand,
            'name': args.name,
            'image_filename': dst.name,
            'has_image': True,
        })
        print('  added new row for', args.brand, '/', args.name)
    else:
        print('  updated existing row for', args.brand, '/', args.name)

    seltzers_path.write_text(
        json.dumps(rows, indent=2, ensure_ascii=False), encoding='utf-8')

    # also update CSV
    csv_path = here / 'seltzers.csv'
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['brand', 'name', 'image_filename', 'has_image'])
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print('  updated seltzers.json and seltzers.csv')


if __name__ == '__main__':
    main()
