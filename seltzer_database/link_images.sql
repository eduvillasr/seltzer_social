-- link_images.sql
-- After uploading the contents of seltzer_database/images/ to the
-- 'review-images' Supabase storage bucket (in a folder called 'canonical'),
-- run this in the Supabase SQL editor to set image_url for every row
-- whose image was uploaded.
--
-- Replace YOUR_PROJECT_REF below with your Supabase project ref
-- (the part before .supabase.co in your project URL).

-- 1. Set image_url for every row whose image is in storage.
--    The slugify() function below mirrors process_image.py's slugify
--    so file names match. (lower → strip accents → non-alnum → -)
do $$
declare
  base text := 'https://alprjysmwyezejucotqq.supabase.co/storage/v1/object/public/review-images/canonical/';
  s text;
  rec record;
begin
  for rec in select id, brand, name from public.seltzers where image_url is null
  loop
    -- naive ASCII slugify (good enough for English brand/flavor names)
    s := lower(regexp_replace(rec.brand, '[^a-zA-Z0-9]+', '-', 'g'))
         || '__' ||
         lower(regexp_replace(rec.name, '[^a-zA-Z0-9]+', '-', 'g'));
    -- trim leading/trailing dashes
    s := regexp_replace(s, '^-+|-+$', '', 'g');
    update public.seltzers
    set image_url = base || s || '.webp'
    where id = rec.id;
  end loop;
end$$;

-- 2. Sanity check
select brand, name, image_url
from public.seltzers
where image_url is not null
order by brand, name
limit 30;
