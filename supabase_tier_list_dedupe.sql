-- ─────────────────────────────────────────────────────────────
-- DEDUPLICATE shared_tier_list_items
-- Merges any pre-existing duplicates (same list_id + same canonical
-- drink) into a single row whose rating_contributions map carries
-- everyone's rating, then enforces uniqueness going forward.
-- Idempotent. Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────

-- 1. Merge duplicates by (list_id, seltzer_id) — for items with a seltzer_id.
--    For each (list_id, seltzer_id) group with >1 rows: keep the oldest one,
--    coalesce all rating_contributions into it, then delete the rest.
do $$
declare
  rec record;
  keeper_id uuid;
  merged jsonb;
  vals numeric[];
  v numeric;
  avg_r numeric;
  tier_letter text;
begin
  for rec in
    select list_id, seltzer_id, count(*) as c
    from public.shared_tier_list_items
    where seltzer_id is not null
    group by list_id, seltzer_id
    having count(*) > 1
  loop
    -- Pick the oldest as the keeper
    select id into keeper_id
    from public.shared_tier_list_items
    where list_id = rec.list_id and seltzer_id = rec.seltzer_id
    order by created_at asc
    limit 1;

    -- Build a merged contributions map across all duplicate rows.
    -- If any row has no rating_contributions map, seed one from (added_by, rating).
    select coalesce(
      jsonb_object_agg(k, v),
      '{}'::jsonb
    )
    into merged
    from (
      select kv.key as k, max((kv.value)::text)::numeric as v
      from public.shared_tier_list_items i,
           lateral jsonb_each(
             coalesce(
               i.rating_contributions,
               jsonb_build_object(i.added_by::text, to_jsonb(i.rating))
             )
           ) kv
      where i.list_id = rec.list_id and i.seltzer_id = rec.seltzer_id
      group by kv.key
    ) merged_kv;

    -- Compute new avg + tier letter
    select array_agg(value::numeric) into vals
    from jsonb_each_text(merged);
    avg_r := 0;
    if array_length(vals, 1) > 0 then
      select round((sum(x)/count(x))::numeric, 1) into avg_r from unnest(vals) x;
    end if;
    tier_letter := case
      when avg_r >= 4.5 then 'S'
      when avg_r >= 4   then 'A'
      when avg_r >= 3   then 'B'
      when avg_r >= 2   then 'C'
      when avg_r >= 1   then 'D'
      else 'F'
    end;

    -- Update keeper with merged values
    update public.shared_tier_list_items
    set rating_contributions = merged,
        rating = avg_r,
        tier = tier_letter
    where id = keeper_id;

    -- Delete the rest
    delete from public.shared_tier_list_items
    where list_id = rec.list_id and seltzer_id = rec.seltzer_id
      and id <> keeper_id;
  end loop;
end$$;

-- 2. For legacy items without seltzer_id, merge by case-insensitive (brand, name).
do $$
declare
  rec record;
  keeper_id uuid;
  merged jsonb;
  vals numeric[];
  avg_r numeric;
  tier_letter text;
begin
  for rec in
    select list_id, lower(coalesce(brand,'')) as b, lower(seltzer_name) as n, count(*) as c
    from public.shared_tier_list_items
    where seltzer_id is null
    group by list_id, lower(coalesce(brand,'')), lower(seltzer_name)
    having count(*) > 1
  loop
    select id into keeper_id
    from public.shared_tier_list_items
    where list_id = rec.list_id
      and lower(coalesce(brand,'')) = rec.b
      and lower(seltzer_name) = rec.n
      and seltzer_id is null
    order by created_at asc
    limit 1;

    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    into merged
    from (
      select kv.key as k, max((kv.value)::text)::numeric as v
      from public.shared_tier_list_items i,
           lateral jsonb_each(
             coalesce(
               i.rating_contributions,
               jsonb_build_object(i.added_by::text, to_jsonb(i.rating))
             )
           ) kv
      where i.list_id = rec.list_id
        and lower(coalesce(i.brand,'')) = rec.b
        and lower(i.seltzer_name) = rec.n
        and i.seltzer_id is null
      group by kv.key
    ) merged_kv;

    select array_agg(value::numeric) into vals
    from jsonb_each_text(merged);
    avg_r := 0;
    if array_length(vals, 1) > 0 then
      select round((sum(x)/count(x))::numeric, 1) into avg_r from unnest(vals) x;
    end if;
    tier_letter := case
      when avg_r >= 4.5 then 'S'
      when avg_r >= 4   then 'A'
      when avg_r >= 3   then 'B'
      when avg_r >= 2   then 'C'
      when avg_r >= 1   then 'D'
      else 'F'
    end;

    update public.shared_tier_list_items
    set rating_contributions = merged,
        rating = avg_r,
        tier = tier_letter
    where id = keeper_id;

    delete from public.shared_tier_list_items
    where list_id = rec.list_id
      and lower(coalesce(brand,'')) = rec.b
      and lower(seltzer_name) = rec.n
      and seltzer_id is null
      and id <> keeper_id;
  end loop;
end$$;

-- 3. Add a unique constraint so we can't ever insert a duplicate again
--    (for rows that DO have a seltzer_id). Legacy rows without one are
--    excluded because NULL != NULL in unique constraints.
create unique index if not exists shared_tier_list_items_list_seltzer_uniq
  on public.shared_tier_list_items (list_id, seltzer_id)
  where seltzer_id is not null;

-- Report what's left
select 'After dedupe — duplicates remaining (should be 0):' as note,
       count(*) as count
from (
  select list_id, seltzer_id, count(*) as c
  from public.shared_tier_list_items
  where seltzer_id is not null
  group by list_id, seltzer_id
  having count(*) > 1
) dups;
