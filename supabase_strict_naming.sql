-- ─────────────────────────────────────────────────────────────
-- STRICT FLAVOR-NAME NORMALIZATION (collision-safe, full FK handling)
-- One canonical spelling per drink: no dashes, no plus signs, no
-- ampersands. Existing rows are rewritten in place; if rewriting would
-- collide with another row, both rows are merged.
--
-- IMPORTANT MERGE BEHAVIOR:
--   * Reviews are NEVER deleted. Two users can review the same drink —
--     that's expected. Reviews from the loser canonical seltzer simply
--     have their seltzer_id repointed to the keeper. Both show up on
--     /drink/[keeper] afterwards.
--   * Shared tier-list ITEMS *can* duplicate on a single list when the
--     two seltzer rows being merged were both on the same list. In that
--     case the two items themselves are merged (rating_contributions
--     map combined, displayed rating recomputed) and the loser item is
--     deleted, preserving the per-list uniqueness constraint.
--   * Same idea for shared_tier_list_suggestions: when both lose and
--     keep already had an entry on the same list, we keep the older.
--
-- Idempotent. Run after supabase_tier_list_dedupe.sql.
-- ─────────────────────────────────────────────────────────────

-- 1. Drop any prior name check.
alter table public.seltzers drop constraint if exists seltzers_name_no_plus;
alter table public.seltzers drop constraint if exists seltzers_name_no_punctuation;

-- 2. Walk every row that has forbidden punctuation. Normalize in place
--    when safe; merge with the existing canonical row when not.
do $$
declare
  rec record;
  new_name text;
  collision_id uuid;
  collision_at timestamptz;
  keeper uuid;
  loser uuid;
  it record;
  existing_item_id uuid;
  merged_contribs jsonb;
  avg_r numeric;
  tier_letter text;
begin
  for rec in
    select id, brand, name, created_at
    from public.seltzers
    where name ~ '[-+–—&]'
    order by created_at asc nulls first
  loop
    new_name := trim(regexp_replace(
      replace(regexp_replace(rec.name, '[-+–—]+', ' ', 'g'), '&', 'and'),
      '\s+', ' ', 'g'
    ));
    if new_name = rec.name then
      continue;
    end if;

    -- Is there already a row at this canonical (brand, name)?
    select id, created_at into collision_id, collision_at
    from public.seltzers
    where lower(brand) = lower(rec.brand)
      and lower(name)  = lower(new_name)
      and id <> rec.id
    limit 1;

    if collision_id is null then
      update public.seltzers set name = new_name where id = rec.id;
      continue;
    end if;

    -- Pick the older row as keeper.
    if collision_at is null or (rec.created_at is not null and rec.created_at < collision_at) then
      keeper := rec.id;
      loser  := collision_id;
      update public.seltzers set name = new_name where id = keeper;
    else
      keeper := collision_id;
      loser  := rec.id;
    end if;

    ----------------------------------------------------------------
    -- REVIEWS: just repoint. Two reviews on the same drink is fine.
    ----------------------------------------------------------------
    update public.reviews
      set seltzer_id = keeper where seltzer_id = loser;

    ----------------------------------------------------------------
    -- TIER LIST ITEMS: if both rows are on the same list, MERGE them
    -- (combine rating_contributions, recompute rating + tier),
    -- otherwise just repoint.
    ----------------------------------------------------------------
    for it in
      select id, list_id, rating_contributions, rating, added_by
      from public.shared_tier_list_items
      where seltzer_id = loser
    loop
      select id into existing_item_id
      from public.shared_tier_list_items
      where seltzer_id = keeper and list_id = it.list_id
      limit 1;

      if existing_item_id is null then
        update public.shared_tier_list_items
          set seltzer_id = keeper where id = it.id;
      else
        -- Merge the two items
        select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
          into merged_contribs
        from (
          select kv.key as k, max((kv.value)::text)::numeric as v
          from public.shared_tier_list_items i,
               lateral jsonb_each(
                 coalesce(
                   i.rating_contributions,
                   jsonb_build_object(i.added_by::text, to_jsonb(i.rating))
                 )
               ) kv
          where i.id in (existing_item_id, it.id)
          group by kv.key
        ) merged_kv;

        -- Compute new average + tier letter
        avg_r := 0;
        select round((sum(value::numeric)/count(*))::numeric, 1) into avg_r
        from jsonb_each_text(merged_contribs);
        tier_letter := case
          when avg_r >= 4.5 then 'S' when avg_r >= 4 then 'A'
          when avg_r >= 3   then 'B' when avg_r >= 2 then 'C'
          when avg_r >= 1   then 'D' else 'F' end;

        update public.shared_tier_list_items
          set rating_contributions = merged_contribs,
              rating = avg_r,
              tier   = tier_letter
          where id = existing_item_id;

        delete from public.shared_tier_list_items where id = it.id;
      end if;
    end loop;

    ----------------------------------------------------------------
    -- TIER LIST SUGGESTIONS: same idea — repoint if no collision on
    -- the same list, otherwise drop the duplicate suggestion.
    ----------------------------------------------------------------
    delete from public.shared_tier_list_suggestions s1
    using public.shared_tier_list_suggestions s2
    where s1.seltzer_id = loser
      and s2.seltzer_id = keeper
      and s1.list_id    = s2.list_id
      and s1.id <> s2.id;
    update public.shared_tier_list_suggestions
      set seltzer_id = keeper where seltzer_id = loser;

    -- Finally drop the loser seltzer row
    delete from public.seltzers where id = loser;
  end loop;
end$$;

-- 3. Collapse incidental double-spaces in names that didn't have
--    forbidden chars (e.g. from earlier ad-hoc edits).
update public.seltzers
set name = trim(regexp_replace(name, '\s+', ' ', 'g'))
where name <> trim(regexp_replace(name, '\s+', ' ', 'g'));

-- 4. Add the CHECK so the strict rule sticks for future inserts.
alter table public.seltzers
  add constraint seltzers_name_no_punctuation
  check (name !~ '[-+&–—]');

-- 5. Sanity reports.
select 'Names with forbidden punctuation:' as note, count(*) as count
from public.seltzers where name ~ '[-+&–—]';

select 'Duplicate (brand, name) rows:' as note, count(*) as count
from (
  select lower(brand), lower(name)
  from public.seltzers group by 1, 2 having count(*) > 1
) d;

select 'Duplicate tier-list items on same (list, seltzer):' as note, count(*) as count
from (
  select list_id, seltzer_id
  from public.shared_tier_list_items
  where seltzer_id is not null
  group by 1, 2 having count(*) > 1
) d;
