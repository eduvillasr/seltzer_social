# Seltzer Database

A canonical catalogue of 184 non-alcoholic mineral water seltzers across 17 major brands you'd find at a US grocery store. Built to populate the `public.seltzers` table in your Supabase backend so users can search and review existing drinks instead of uploading their own image every time.

## What's here

| File | Purpose |
|---|---|
| `seltzers.sql` | Run this in Supabase SQL editor to seed all 184 rows into `public.seltzers`. Idempotent (uses `on conflict do nothing`). |
| `seltzers.json` | Same data as JSON — useful if you ever want to import via a Node script or the Supabase JS client. |
| `seltzers.csv` | Same data as CSV — useful if you want to inspect or load via Supabase's CSV import UI. |
| `images/*.webp` | 23 pre-processed cans (LaCroix lineup) at 420×420 WebP, white background, ~16 KB each. Drop these into your `review-images` Supabase storage bucket. |
| `process_image.py` | The image pipeline. Takes any source image, removes/composites background, outputs 420×420 WebP. |
| `add_image.py` | Helper CLI for adding more images one at a time as you collect them. |

## Image spec

All images match what your app already produces (`uploadReviewImage` in `lib/supabase.ts`):
- **Format:** WebP, quality 80
- **Size:** 420×420 square, white background
- **File size:** ~10–25 KB

That means they'll behave identically to user-uploaded review images in your existing thumbnail/grid layouts.

## How to load the database into Supabase

1. **Seed the rows.** Open Supabase → SQL Editor → paste the contents of `seltzers.sql` → Run. You'll get 184 new rows in `public.seltzers`, all with `image_url = NULL` (we fill those in next).

2. **Upload the LaCroix images.** In Supabase → Storage → `review-images` bucket, upload everything in `images/`. Optionally put them in a sub-folder like `canonical/`.

3. **Link images to rows.** For each image filename (e.g. `lacroix__pamplemousse.webp`), find the matching row in `public.seltzers` and set its `image_url` to the public URL Supabase generated. The fastest way:

   ```sql
   -- Replace YOUR_PROJECT with your Supabase project ref.
   update public.seltzers
   set image_url = 'https://YOUR_PROJECT.supabase.co/storage/v1/object/public/review-images/canonical/' ||
       lower(regexp_replace(brand, '[^a-zA-Z0-9]+', '-', 'g')) ||
       '__' ||
       lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) ||
       '.webp'
   where brand = 'LaCroix';
   ```

   That builds the URL by slugifying `brand` and `name` the same way `process_image.py` did, then runs only for LaCroix. Repeat per brand as you fill in more images.

## How to add more images later

The other 161 SKUs (Bubly, AHA, Spindrift, Polar, Waterloo, San Pellegrino, Perrier, Topo Chico, Schweppes, Canada Dry, Liquid Death, Sanzo, Nixie, Hal's New York, Kirkland Signature, Rambler) are already seeded in the database — they just don't have images yet. There are two paths to fill them in:

### Option A — let users do it (matches your original spec)
Your app already has the "add seltzer" / image-upload flow. As users review drinks that don't have images, they upload one and the canonical row gets a picture. The database is searchable from day one; images appear over time. No work for you.

### Option B — bulk add images yourself
For any image file you have on disk:

```bash
cd seltzer_database
pip install Pillow                # required
pip install rembg                 # optional, only if your source has a colored bg
python add_image.py /path/to/can.png "Brand Name" "Flavor Name"
```

The script:
- Processes the image through the pipeline (white bg, 420×420 WebP)
- Saves it to `images/`
- Appends/updates the row in `seltzers.json` and `seltzers.csv`

Once you've added a batch, upload the new files to Supabase storage and run an `update` SQL similar to the LaCroix one above, scoped to that brand.

If your source image is already a clean PNG with transparent or white background (like the LaCroix files I started with), pass `--skip-bg` to skip the rembg step:

```bash
python add_image.py downloads/bubly_blackberry.png "Bubly" "Blackberry" --skip-bg
```

## Brand counts

| Brand | Flavors |
|---|---|
| LaCroix | 23 ✅ images included |
| Bubly | 19 |
| Hal's New York | 18 |
| Waterloo | 16 |
| Polar | 15 |
| AHA | 12 |
| Spindrift | 12 |
| San Pellegrino | 10 |
| Perrier | 9 |
| Schweppes | 9 |
| Nixie | 8 |
| Canada Dry | 7 |
| Sanzo | 6 |
| Rambler | 6 |
| Topo Chico | 5 |
| Liquid Death | 5 |
| Kirkland Signature | 4 |
| **Total** | **184** |

## Notes

- The flavor lists were compiled from each brand's current product lineup. Some are limited editions (e.g. Bubly's "Cosmic Swirl" / "Dragon Fruit Stardust" / "Meteor Melon"); they may rotate out. The catalogue is easy to amend — just edit `seltzers.sql` or run a `delete` against `public.seltzers` for any flavor you want to retire.
- The slugify in this folder normalises Unicode (Pastèque → past-que). The display name in the database keeps the proper accents.
- Pamplemousse is the GOAT.
