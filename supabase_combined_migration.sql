-- ════════════════════════════════════════════════════════════════
-- COMBINED MIGRATION — Seltzer Social
-- Run once in the Supabase SQL Editor. All sections idempotent.
--
-- Order matters: strict naming first (dedup), then catalog seed,
-- then perf indexes. Each section's own block-comment header
-- is preserved verbatim — safe to skim, safe to re-run.
-- ════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- SECTION 1 / 5  —  STRICT FLAVOR-NAME NORMALIZATION
-- ════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════
-- SECTION 2 / 5  —  TIER-LIST ITEM DEDUPE
-- ════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════
-- SECTION 3 / 5  —  MULTI-MEMBER TIER-LIST EDITORS
-- ════════════════════════════════════════════════════════════════
-- ─────────────────────────────────────────────────────────────
-- TIER LIST EDITORS (multi-member invites)
-- Lets the owner of a shared tier list invite N additional users
-- with edit access (beyond the original owner+partner pair).
-- Run in Supabase SQL Editor — idempotent.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.shared_tier_list_editors (
  list_id    uuid not null references public.shared_tier_lists(id) on delete cascade,
  user_id    uuid not null references public.users(id)             on delete cascade,
  status     text not null default 'pending_invite' check (status in ('pending_invite','active','declined')),
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (list_id, user_id)
);

create index if not exists shared_tier_list_editors_user_idx
  on public.shared_tier_list_editors (user_id);
create index if not exists shared_tier_list_editors_list_status_idx
  on public.shared_tier_list_editors (list_id, status);

-- ─── Row-Level Security ────────────────────────────────────
alter table public.shared_tier_list_editors enable row level security;

-- Anyone can read editor rows so the UI can show "X invited you" / "Y, Z editing"
drop policy if exists "Editors readable by anyone" on public.shared_tier_list_editors;
create policy "Editors readable by anyone"
  on public.shared_tier_list_editors for select
  using (true);

-- Only the list's OWNER can invite (insert) someone as editor
drop policy if exists "Owner can invite editors" on public.shared_tier_list_editors;
create policy "Owner can invite editors"
  on public.shared_tier_list_editors for insert
  with check (
    auth.uid() = invited_by
    and exists (
      select 1 from public.shared_tier_lists l
      where l.id = list_id and l.owner_id = auth.uid()
    )
  );

-- The invited user can accept/decline (update their own row's status).
-- The owner can also update (e.g. revoke) any editor row on their list.
drop policy if exists "Editor can update own status" on public.shared_tier_list_editors;
create policy "Editor can update own status"
  on public.shared_tier_list_editors for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.shared_tier_lists l
      where l.id = list_id and l.owner_id = auth.uid()
    )
  );

-- Owner can remove an editor; an editor can remove themselves
drop policy if exists "Owner or self can delete editor row" on public.shared_tier_list_editors;
create policy "Owner or self can delete editor row"
  on public.shared_tier_list_editors for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.shared_tier_lists l
      where l.id = list_id and l.owner_id = auth.uid()
    )
  );

-- ─── Allow accepted editors to write to list items / suggestions ──
-- The existing RLS on shared_tier_list_items / _suggestions checks
-- (user is owner_id or partner_id). We need to extend that to also
-- accept any user with status='active' in shared_tier_list_editors.
-- These wrappers replace the previous policies.

drop policy if exists "Members can manage items" on public.shared_tier_list_items;
create policy "Members can manage items"
  on public.shared_tier_list_items for all
  using (
    exists (
      select 1 from public.shared_tier_lists l
      where l.id = shared_tier_list_items.list_id
        and (l.owner_id = auth.uid() or l.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.shared_tier_list_editors e
      where e.list_id = shared_tier_list_items.list_id
        and e.user_id = auth.uid()
        and e.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.shared_tier_lists l
      where l.id = shared_tier_list_items.list_id
        and (l.owner_id = auth.uid() or l.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.shared_tier_list_editors e
      where e.list_id = shared_tier_list_items.list_id
        and e.user_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists "Members can manage suggestions" on public.shared_tier_list_suggestions;
create policy "Members can manage suggestions"
  on public.shared_tier_list_suggestions for all
  using (
    exists (
      select 1 from public.shared_tier_lists l
      where l.id = shared_tier_list_suggestions.list_id
        and (l.owner_id = auth.uid() or l.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.shared_tier_list_editors e
      where e.list_id = shared_tier_list_suggestions.list_id
        and e.user_id = auth.uid()
        and e.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.shared_tier_lists l
      where l.id = shared_tier_list_suggestions.list_id
        and (l.owner_id = auth.uid() or l.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.shared_tier_list_editors e
      where e.list_id = shared_tier_list_suggestions.list_id
        and e.user_id = auth.uid()
        and e.status = 'active'
    )
  );


-- ════════════════════════════════════════════════════════════════
-- SECTION 4 / 5  —  CANONICAL CATALOG SEED (1,092 SKUs)
-- ════════════════════════════════════════════════════════════════
-- Seltzer canonical-catalogue seed (1092 SKUs, strict naming)
-- Run after supabase_standardize_data.sql AND supabase_strict_naming.sql.

insert into public.seltzers (brand, name) values
  ('LaCroix', 'Pamplemousse'),
  ('LaCroix', 'Lime'),
  ('LaCroix', 'Lemon'),
  ('LaCroix', 'Orange'),
  ('LaCroix', 'Berry'),
  ('LaCroix', 'Coconut'),
  ('LaCroix', 'Cherry Lime'),
  ('LaCroix', 'Key Lime'),
  ('LaCroix', 'Tangerine'),
  ('LaCroix', 'Passionfruit'),
  ('LaCroix', 'Peach Pear'),
  ('LaCroix', 'Razz Cranberry'),
  ('LaCroix', 'Pure'),
  ('LaCroix', 'Mojito'),
  ('LaCroix', 'LimonCello'),
  ('LaCroix', 'Pastèque'),
  ('LaCroix', 'Sunshine'),
  ('LaCroix', 'Beach Plum'),
  ('LaCroix', 'Black Razzberry'),
  ('LaCroix', 'Blackberry Cucumber'),
  ('LaCroix', 'Pineapple Coconut'),
  ('LaCroix', 'Strawberry Peach'),
  ('LaCroix', 'Guava São Paulo'),
  ('Bubly', 'Blackberry'),
  ('Bubly', 'Lime'),
  ('Bubly', 'Cherry'),
  ('Bubly', 'Grapefruit'),
  ('Bubly', 'Raspberry'),
  ('Bubly', 'Strawberry'),
  ('Bubly', 'Mango'),
  ('Bubly', 'Cranberry'),
  ('Bubly', 'Pineapple'),
  ('Bubly', 'Apple'),
  ('Bubly', 'Peach'),
  ('Bubly', 'Watermelon'),
  ('Bubly', 'Coconut Pineapple'),
  ('Bubly', 'Orange Cream'),
  ('Bubly', 'Strawberry Sunset'),
  ('Bubly', 'Bellini Bliss'),
  ('Bubly', 'Cosmic Swirl'),
  ('Bubly', 'Dragon Fruit Stardust'),
  ('Bubly', 'Meteor Melon'),
  ('AHA', 'Lime Watermelon'),
  ('AHA', 'Citrus Green Tea'),
  ('AHA', 'Strawberry Cucumber'),
  ('AHA', 'Apple Ginger'),
  ('AHA', 'Blueberry Pomegranate'),
  ('AHA', 'Black Cherry Coffee'),
  ('AHA', 'Mango Black Tea'),
  ('AHA', 'Peach Honey'),
  ('AHA', 'Orange Grapefruit'),
  ('AHA', 'Raspberry Açaí'),
  ('AHA', 'Pineapple Passionfruit'),
  ('AHA', 'Mixed Berry'),
  ('Spindrift', 'Lemon'),
  ('Spindrift', 'Lime'),
  ('Spindrift', 'Grapefruit'),
  ('Spindrift', 'Cucumber'),
  ('Spindrift', 'Orange Mango'),
  ('Spindrift', 'Half and Half'),
  ('Spindrift', 'Raspberry Lime'),
  ('Spindrift', 'Pineapple'),
  ('Spindrift', 'Strawberry'),
  ('Spindrift', 'Cranberry Raspberry'),
  ('Spindrift', 'Blackberry'),
  ('Spindrift', 'Black Cherry Tangerine'),
  ('Polar', 'Lime'),
  ('Polar', 'Black Cherry'),
  ('Polar', 'Lemon'),
  ('Polar', 'Original'),
  ('Polar', 'Cranberry Lime'),
  ('Polar', 'Orange Vanilla'),
  ('Polar', 'Mango Lemonade'),
  ('Polar', 'Raspberry Lime'),
  ('Polar', 'Strawberry Watermelon'),
  ('Polar', 'Pomegranate'),
  ('Polar', 'Blueberry Lemonade'),
  ('Polar', 'Toasted Coconut'),
  ('Polar', 'Mixed Berry'),
  ('Polar', 'Ruby Red Grapefruit'),
  ('Polar', 'Vanilla Zen'),
  ('Waterloo', 'Black Cherry'),
  ('Waterloo', 'Pineapple Mango'),
  ('Waterloo', 'Strawberry'),
  ('Waterloo', 'Lemon Lime'),
  ('Waterloo', 'Watermelon'),
  ('Waterloo', 'Coconut'),
  ('Waterloo', 'Lemon'),
  ('Waterloo', 'Lime'),
  ('Waterloo', 'Grape'),
  ('Waterloo', 'Blueberry'),
  ('Waterloo', 'Tangerine'),
  ('Waterloo', 'Peach'),
  ('Waterloo', 'Raspberry'),
  ('Waterloo', 'Pomegranate'),
  ('Waterloo', 'Summer Berry'),
  ('Waterloo', 'Ginger Citrus Twist'),
  ('San Pellegrino', 'Sparkling Mineral Water'),
  ('San Pellegrino', 'Limonata'),
  ('San Pellegrino', 'Aranciata'),
  ('San Pellegrino', 'Aranciata Rossa'),
  ('San Pellegrino', 'Pompelmo'),
  ('San Pellegrino', 'Clementina'),
  ('San Pellegrino', 'Limone and Menta'),
  ('San Pellegrino', 'Pesca Tea'),
  ('San Pellegrino', 'Melograno and Arancia'),
  ('San Pellegrino', 'Ficodindia and Arancia'),
  ('Perrier', 'Original'),
  ('Perrier', 'Lime'),
  ('Perrier', 'Lemon'),
  ('Perrier', 'Pomegranate'),
  ('Perrier', 'Strawberry'),
  ('Perrier', 'Pineapple'),
  ('Perrier', 'Grapefruit'),
  ('Perrier', 'Peach'),
  ('Perrier', 'Watermelon'),
  ('Topo Chico', 'Mineral Water'),
  ('Topo Chico', 'Twist of Lime'),
  ('Topo Chico', 'Twist of Grapefruit'),
  ('Topo Chico', 'Strawberry Guava'),
  ('Topo Chico', 'Tangy Lemon Lime'),
  ('Schweppes', 'Club Soda'),
  ('Schweppes', 'Tonic Water'),
  ('Schweppes', 'Diet Tonic Water'),
  ('Schweppes', 'Ginger Ale'),
  ('Schweppes', 'Diet Ginger Ale'),
  ('Schweppes', 'Raspberry Ginger Ale'),
  ('Schweppes', 'Lemon Lime Sparkling Water'),
  ('Schweppes', 'Black Cherry Sparkling Water'),
  ('Schweppes', 'Raspberry Lime Sparkling Water'),
  ('Canada Dry', 'Ginger Ale'),
  ('Canada Dry', 'Diet Ginger Ale'),
  ('Canada Dry', 'Cranberry Ginger Ale'),
  ('Canada Dry', 'Lemon Ginger Ale'),
  ('Canada Dry', 'Tonic Water'),
  ('Canada Dry', 'Club Soda'),
  ('Canada Dry', 'Bold Ginger Ale'),
  ('Liquid Death', 'Sparkling Water'),
  ('Liquid Death', 'Severed Lime'),
  ('Liquid Death', 'Berry It Alive'),
  ('Liquid Death', 'Convicted Melon'),
  ('Liquid Death', 'Mango Chainsaw'),
  ('Sanzo', 'Lychee'),
  ('Sanzo', 'Mango'),
  ('Sanzo', 'Yuzu Ginger'),
  ('Sanzo', 'Calamansi'),
  ('Sanzo', 'Strawberry Lychee'),
  ('Sanzo', 'Pomelo Pink Lemonade'),
  ('Nixie', 'Tropical Coconut'),
  ('Nixie', 'Tangerine'),
  ('Nixie', 'Black Cherry'),
  ('Nixie', 'Lemon Lime Mint'),
  ('Nixie', 'Watermelon Strawberry'),
  ('Nixie', 'Citrus Twist'),
  ('Nixie', 'Grapefruit'),
  ('Nixie', 'Cucumber Melon'),
  ('Hal''s New York', 'Black Cherry'),
  ('Hal''s New York', 'Berry'),
  ('Hal''s New York', 'Lemon Lime'),
  ('Hal''s New York', 'Mango'),
  ('Hal''s New York', 'Mixed Berry'),
  ('Hal''s New York', 'Pomegranate'),
  ('Hal''s New York', 'Raspberry'),
  ('Hal''s New York', 'Strawberry'),
  ('Hal''s New York', 'Watermelon'),
  ('Hal''s New York', 'Apple'),
  ('Hal''s New York', 'Mandarin Orange'),
  ('Hal''s New York', 'Cherry Vanilla'),
  ('Hal''s New York', 'Cucumber Watermelon'),
  ('Hal''s New York', 'Vanilla Cream'),
  ('Hal''s New York', 'Toasted Coconut'),
  ('Hal''s New York', 'Blueberry Lemon'),
  ('Hal''s New York', 'Lemon'),
  ('Hal''s New York', 'Lime'),
  ('Kirkland Signature', 'Sparkling Water Lime'),
  ('Kirkland Signature', 'Sparkling Water Grapefruit'),
  ('Kirkland Signature', 'Sparkling Water Black Cherry'),
  ('Kirkland Signature', 'Sparkling Water Original'),
  ('Rambler', 'Lime'),
  ('Rambler', 'Original'),
  ('Rambler', 'Grapefruit'),
  ('Rambler', 'Watermelon'),
  ('Rambler', 'Lemon'),
  ('Rambler', 'Black Cherry'),
  ('Trader Joe''s', 'Sparkling Water Original'),
  ('Trader Joe''s', 'Sparkling Water Lime'),
  ('Trader Joe''s', 'Sparkling Water Grapefruit'),
  ('Trader Joe''s', 'Sparkling Water Lemon'),
  ('Trader Joe''s', 'Triple Ginger Brew'),
  ('Trader Joe''s', 'Sparkling Yuzu'),
  ('Trader Joe''s', 'Sparkling Coconut Water'),
  ('Trader Joe''s', 'Sparkling Mint Mojito'),
  ('Good & Gather', 'Lime Sparkling Water'),
  ('Good & Gather', 'Black Cherry Sparkling Water'),
  ('Good & Gather', 'Lemon Sparkling Water'),
  ('Good & Gather', 'Strawberry Sparkling Water'),
  ('Good & Gather', 'Mango Sparkling Water'),
  ('Good & Gather', 'Cranberry Sparkling Water'),
  ('Good & Gather', 'Mixed Berry Sparkling Water'),
  ('Good & Gather', 'Grapefruit Sparkling Water'),
  ('Good & Gather', 'Pomegranate Sparkling Water'),
  ('Good & Gather', 'Coconut Pineapple Sparkling Water'),
  ('365 by Whole Foods', 'Sparkling Water Original'),
  ('365 by Whole Foods', 'Sparkling Water Lime'),
  ('365 by Whole Foods', 'Sparkling Water Lemon'),
  ('365 by Whole Foods', 'Sparkling Water Cherry Lime'),
  ('365 by Whole Foods', 'Sparkling Water Cranberry Lime'),
  ('365 by Whole Foods', 'Sparkling Water Grapefruit'),
  ('365 by Whole Foods', 'Sparkling Water Mango'),
  ('Member''s Mark', 'Sparkling Water Original'),
  ('Member''s Mark', 'Sparkling Water Lime'),
  ('Member''s Mark', 'Sparkling Water Lemon'),
  ('Member''s Mark', 'Sparkling Water Black Cherry'),
  ('Member''s Mark', 'Sparkling Water Grapefruit'),
  ('Member''s Mark', 'Sparkling Water Mango Pineapple'),
  ('Member''s Mark', 'Sparkling Water Variety Pack'),
  ('Clear American', 'Original Sparkling Water'),
  ('Clear American', 'Strawberry'),
  ('Clear American', 'Mandarin Orange'),
  ('Clear American', 'Black Cherry'),
  ('Clear American', 'Lemon'),
  ('Clear American', 'Grape'),
  ('Clear American', 'Piña Colada'),
  ('Clear American', 'Tropical Punch'),
  ('Clear American', 'Cherry Limeade'),
  ('Clear American', 'Peach'),
  ('Clear American', 'Key Lime'),
  ('Clear American', 'Watermelon'),
  ('Sparkling Ice', 'Black Raspberry'),
  ('Sparkling Ice', 'Cherry Limeade'),
  ('Sparkling Ice', 'Coconut Pineapple'),
  ('Sparkling Ice', 'Crisp Apple'),
  ('Sparkling Ice', 'Strawberry Watermelon'),
  ('Sparkling Ice', 'Peach Nectarine'),
  ('Sparkling Ice', 'Pink Grapefruit'),
  ('Sparkling Ice', 'Orange Mango'),
  ('Sparkling Ice', 'Classic Lemonade'),
  ('Sparkling Ice', 'Kiwi Strawberry'),
  ('Sparkling Ice', 'Black Cherry'),
  ('Sparkling Ice', 'Lemon Lime'),
  ('Sparkling Ice', 'Pomegranate Blueberry'),
  ('Sparkling Ice', 'Strawberry Lemonade'),
  ('Hint', 'Watermelon'),
  ('Hint', 'Blackberry'),
  ('Hint', 'Pineapple'),
  ('Hint', 'Pomegranate'),
  ('Hint', 'Cherry'),
  ('Hint', 'Mango Grapefruit'),
  ('Hint', 'Cucumber'),
  ('Hint', 'Strawberry Kiwi'),
  ('Hint', 'Peach'),
  ('Klarbrunn', 'Black Cherry'),
  ('Klarbrunn', 'Lemon'),
  ('Klarbrunn', 'Lime'),
  ('Klarbrunn', 'Cranberry Lime'),
  ('Klarbrunn', 'Peach'),
  ('Klarbrunn', 'Pineapple Coconut'),
  ('Klarbrunn', 'Strawberry'),
  ('Klarbrunn', 'Mandarin'),
  ('Klarbrunn', 'Original'),
  ('Recess', 'Pomegranate Hibiscus'),
  ('Recess', 'Blackberry Chai'),
  ('Recess', 'Coconut Lime'),
  ('Recess', 'Peach Ginger'),
  ('Recess', 'Black Cherry'),
  ('Recess', 'Strawberry Rose'),
  ('Olipop', 'Vintage Cola'),
  ('Olipop', 'Strawberry Vanilla'),
  ('Olipop', 'Cherry Vanilla'),
  ('Olipop', 'Orange Squeeze'),
  ('Olipop', 'Classic Root Beer'),
  ('Olipop', 'Tropical Punch'),
  ('Olipop', 'Lemon Lime'),
  ('Olipop', 'Watermelon Lime'),
  ('Olipop', 'Crisp Apple'),
  ('Olipop', 'Cream Soda'),
  ('Olipop', 'Doctor Goodwin'),
  ('Olipop', 'Banana Cream'),
  ('Olipop', 'Ginger Lemon'),
  ('Zevia', 'Cola'),
  ('Zevia', 'Ginger Root Beer'),
  ('Zevia', 'Cherry Cola'),
  ('Zevia', 'Cream Soda'),
  ('Zevia', 'Dr. Zevia'),
  ('Zevia', 'Mountain Zevia'),
  ('Zevia', 'Black Cherry'),
  ('Zevia', 'Strawberry'),
  ('Zevia', 'Ginger Ale'),
  ('Zevia', 'Lemon Lime Twist'),
  ('Zevia', 'Orange'),
  ('Zevia', 'Grape'),
  ('Voss', 'Sparkling Plain'),
  ('Voss', 'Sparkling Lemon Cucumber'),
  ('Voss', 'Sparkling Lime Mint'),
  ('Voss', 'Sparkling Tangerine Lemongrass'),
  ('Bai Bubbles', 'Bolivia Black Cherry'),
  ('Bai Bubbles', 'Jamaica Blood Orange'),
  ('Bai Bubbles', 'Peru Pineapple'),
  ('Bai Bubbles', 'Costa Rica Clementine'),
  ('Bai Bubbles', 'Sao Paulo Strawberry Lemonade'),
  ('Bai Bubbles', 'Bahamas Coconut Lime'),
  ('Phocus', 'Yuzu Lime'),
  ('Phocus', 'Grapefruit'),
  ('Phocus', 'Mint'),
  ('Phocus', 'Mixed Berry'),
  ('Phocus', 'Blood Orange'),
  ('Phocus', 'Cucumber'),
  ('Crystal Geyser', 'Sparkling Mineral Water'),
  ('Crystal Geyser', 'Lemon Sparkling'),
  ('Crystal Geyser', 'Lime Sparkling'),
  ('Crystal Geyser', 'Berry Sparkling'),
  ('Crystal Geyser', 'Orange Sparkling'),
  ('Saratoga', 'Sparkling Water'),
  ('Saratoga', 'Sparkling Lemon'),
  ('Saratoga', 'Sparkling Lime'),
  ('Mountain Valley', 'Sparkling Mineral Water'),
  ('Mountain Valley', 'Sparkling Lime'),
  ('Mountain Valley', 'Sparkling Essence Lemon'),
  ('LaCroix', 'Coconut Cola'),
  ('LaCroix', 'Hi Biscus'),
  ('LaCroix', 'Apricot'),
  ('LaCroix', 'Pure Lime'),
  ('LaCroix', 'Pure Lemon'),
  ('LaCroix', 'Pure Cran Raspberry'),
  ('LaCroix', 'Cúrate Cerise Limón'),
  ('LaCroix', 'Cúrate Pasión'),
  ('LaCroix', 'Cúrate Piña Fresa'),
  ('LaCroix', 'Cúrate Melón Pomelo'),
  ('Bubly', 'Tangerine'),
  ('Bubly', 'Cherry Tangerine'),
  ('Bubly', 'Crisp Lemon'),
  ('Bubly', 'Crisp Lime'),
  ('Bubly', 'Lemon Lime'),
  ('Bubly', 'Apple Pear'),
  ('Bubly', 'Citrus Cherry'),
  ('Bubly', 'Mocktail Sunrise'),
  ('Bubly', 'Mocktail Mojito'),
  ('Spindrift', 'Strawberry Lemonade'),
  ('Spindrift', 'Lemonade'),
  ('Spindrift', 'Watermelon Mint'),
  ('Spindrift', 'Pineapple Coconut'),
  ('Spindrift', 'Cherry Lime'),
  ('Spindrift', 'Mango Lemonade'),
  ('Spindrift', 'Cucumber Lime'),
  ('Spindrift', 'Tangerine Citrus'),
  ('Spindrift', 'Strawberry Lime'),
  ('Spindrift', 'Cranberry Raspberry Lemonade'),
  ('Spindrift', 'Half Tea Half Lemon'),
  ('Polar', 'Vanilla'),
  ('Polar', 'Orange'),
  ('Polar', 'Grapefruit'),
  ('Polar', 'Cranberry'),
  ('Polar', 'Diet Lime'),
  ('Polar', 'Triple Berry'),
  ('Polar', 'Pomegranate Berry'),
  ('Polar', 'Pink Lemonade'),
  ('Polar', 'Cherry Pomegranate'),
  ('Polar', 'Vanilla Cream'),
  ('Polar', 'Tangerine'),
  ('Polar', 'Honeycrisp Apple'),
  ('Polar', 'Frostbite'),
  ('Polar', 'Yuzu Lime'),
  ('Polar', 'Pumpkin Cranberry'),
  ('Polar', 'Eggnog'),
  ('Polar', 'Apple Cider'),
  ('Polar', 'Cranberry Clementine'),
  ('Waterloo', 'Mango'),
  ('Waterloo', 'Apple'),
  ('Waterloo', 'Pineapple'),
  ('Waterloo', 'Cucumber Mint'),
  ('Waterloo', 'Lemon Lime Twist'),
  ('Waterloo', 'Tropical Citrus'),
  ('Waterloo', 'Spring Berry'),
  ('Waterloo', 'Sparkling Sunset'),
  ('Waterloo', 'Toasted Coconut'),
  ('AHA', 'Watermelon Wave'),
  ('AHA', 'Citrus Habanero'),
  ('AHA', 'Tangerine Lemonade'),
  ('AHA', 'Strawberry Cucumber Zero Sugar'),
  ('Sparkling Ice', 'Caffeine Black Cherry'),
  ('Sparkling Ice', 'Caffeine Citrus Twist'),
  ('Sparkling Ice', 'Caffeine Triple Citrus'),
  ('Sparkling Ice', 'Caffeine Strawberry Citrus'),
  ('Sparkling Ice', 'Caffeine Orange Passionfruit'),
  ('Sparkling Ice', 'Lemonade Variety'),
  ('Sparkling Ice', 'Mango Mai Tai'),
  ('Sparkling Ice', 'Pina Colada'),
  ('Sparkling Ice', 'Pomegranate Berry'),
  ('Sparkling Ice', 'Black Currant'),
  ('Sparkling Ice', 'Tropical Mojito'),
  ('Sparkling Ice', 'Wild Berry'),
  ('Sparkling Ice', 'Italian Lemon Ice'),
  ('Sparkling Ice', 'Strawberry Watermelon Mojito'),
  ('Perrier', 'Original Sparkling'),
  ('Perrier', 'L''Orange'),
  ('Perrier', 'Mint'),
  ('Perrier', 'Energize Tangerine'),
  ('Perrier', 'Energize Mixed Berries'),
  ('San Pellegrino', 'Pesca'),
  ('San Pellegrino', 'Limonata Zero'),
  ('San Pellegrino', 'Aranciata Zero'),
  ('San Pellegrino', 'Acqua Panna Still'),
  ('San Pellegrino', 'Chinotto'),
  ('San Pellegrino', 'Sanbittèr'),
  ('San Pellegrino', 'Essenza Lemon Mint'),
  ('San Pellegrino', 'Essenza Blood Orange'),
  ('San Pellegrino', 'Essenza Tangerine Strawberry'),
  ('San Pellegrino', 'Essenza Dark Morello Cherry Pomegranate'),
  ('Topo Chico', 'Sabores Fresa'),
  ('Topo Chico', 'Sabores Mango'),
  ('Topo Chico', 'Twist of Tangerine'),
  ('Topo Chico', 'Twist of Pineapple'),
  ('Liquid Death', 'Mountain Water'),
  ('Liquid Death', 'Still Water'),
  ('Liquid Death', 'Rest in Peach'),
  ('Liquid Death', 'Armless Palmer'),
  ('Liquid Death', 'Dead Billionaire'),
  ('Schweppes', 'Sparkling Water Original'),
  ('Schweppes', 'Sparkling Water Lime'),
  ('Schweppes', 'Sparkling Water Pomegranate'),
  ('Schweppes', 'Sparkling Water Strawberry'),
  ('Schweppes', 'Bitter Lemon'),
  ('Canada Dry', 'Sparkling Seltzer Lemon'),
  ('Canada Dry', 'Sparkling Seltzer Lime'),
  ('Canada Dry', 'Sparkling Seltzer Black Cherry'),
  ('Canada Dry', 'Sparkling Seltzer Pomegranate'),
  ('Canada Dry', 'Sparkling Seltzer Mandarin Orange'),
  ('Canada Dry', 'Sparkling Seltzer Variety'),
  ('Hint', 'Apple'),
  ('Hint', 'Pear'),
  ('Hint', 'Crisp Apple'),
  ('Hint', 'Lemon'),
  ('Hint', 'Lime'),
  ('Hint', 'Honeydew Hibiscus'),
  ('Hint', 'Grapefruit'),
  ('Hint', 'Black Raspberry'),
  ('Hint', 'Cherry Mint'),
  ('Olipop', 'Cherry Cola'),
  ('Olipop', 'Grape Soda'),
  ('Olipop', 'Stone Fruit'),
  ('Olipop', 'Ridge Rush'),
  ('Olipop', 'Strawberry Lemonade'),
  ('Zevia', 'Caffeine Free Cola'),
  ('Zevia', 'Vanilla Cola'),
  ('Zevia', 'Dr Zevia Zero'),
  ('Zevia', 'Mango Ginger'),
  ('Zevia', 'Strawberry Lemon Bomb'),
  ('Zevia', 'Pineapple Coconut'),
  ('Zevia', 'Watermelon Lime'),
  ('Zevia', 'Cherry Cola Zero'),
  ('Zevia', 'Caffeine Free Black Cherry'),
  ('Hal''s New York', 'Birch Beer'),
  ('Hal''s New York', 'Cream Soda'),
  ('Hal''s New York', 'Diet Black Cherry'),
  ('Hal''s New York', 'Original Seltzer'),
  ('Hal''s New York', 'Diet Original'),
  ('Hal''s New York', 'Caribbean Punch'),
  ('Nixie', 'Cherry Plum'),
  ('Nixie', 'Honeysuckle'),
  ('Nixie', 'Mango Tangerine'),
  ('Nixie', 'Mint Citrus'),
  ('Nixie', 'Strawberry Hibiscus'),
  ('Nixie', 'Apple Tart'),
  ('Nixie', 'Ginger Apple'),
  ('Nixie', 'Yuzu Honey'),
  ('Rambler', 'Strawberry'),
  ('Rambler', 'Cherry Lime'),
  ('Rambler', 'Cucumber'),
  ('Rambler', 'Honeycrisp Apple'),
  ('Rambler', 'Vanilla'),
  ('Rambler', 'Hill Country Twist'),
  ('Sanzo', 'Pomelo'),
  ('Sanzo', 'Asian Pear'),
  ('Sanzo', 'Dragon Fruit'),
  ('Sanzo', 'Mango Chili'),
  ('Sanzo', 'Strawberry Lime'),
  ('Sanzo', 'Yuzu Mint'),
  ('Klarbrunn', 'Variety Pack'),
  ('Klarbrunn', 'Tropical'),
  ('Klarbrunn', 'Watermelon'),
  ('Klarbrunn', 'Raspberry'),
  ('Klarbrunn', 'Lemon Lime'),
  ('Klarbrunn', 'Grapefruit'),
  ('Klarbrunn', 'Vita Ice Cherry Pomegranate'),
  ('Klarbrunn', 'Vita Ice Mango Passionfruit'),
  ('Klarbrunn', 'Vita Ice Strawberry Kiwi'),
  ('Klarbrunn', 'Vita Ice Pina Colada'),
  ('Klarbrunn', 'Vita Ice Tropical Punch'),
  ('Trader Joe''s', 'Mineral Water'),
  ('Trader Joe''s', 'Italian Sparkling Mineral Water'),
  ('Trader Joe''s', 'Mango Italian Soda'),
  ('Trader Joe''s', 'Black Currant Italian Soda'),
  ('Trader Joe''s', 'Vanilla Cola'),
  ('Trader Joe''s', 'Sparkling Apple Cider'),
  ('Trader Joe''s', 'Sparkling Cucumber Water'),
  ('Trader Joe''s', 'Sparkling Pomegranate'),
  ('Trader Joe''s', 'Half and Half Spindrift Style'),
  ('Good & Gather', 'Pineapple Sparkling Water'),
  ('Good & Gather', 'Watermelon Sparkling Water'),
  ('Good & Gather', 'Mandarin Orange Sparkling Water'),
  ('Good & Gather', 'Vanilla Cream Sparkling Water'),
  ('Good & Gather', 'Toasted Coconut Sparkling Water'),
  ('Good & Gather', 'Cherry Limeade Sparkling Water'),
  ('Member''s Mark', 'Sparkling Water Cherry Lime'),
  ('Member''s Mark', 'Sparkling Water Cranberry Lime'),
  ('Member''s Mark', 'Sparkling Water Tropical Sunrise'),
  ('Member''s Mark', 'Sparkling Water Watermelon'),
  ('Member''s Mark', 'Sparkling Water Strawberry'),
  ('Clear American', 'Apple Berry'),
  ('Clear American', 'Coconut Pineapple'),
  ('Clear American', 'Mango Pineapple'),
  ('Clear American', 'Pomegranate Cherry'),
  ('Clear American', 'Wild Berry'),
  ('Clear American', 'Vanilla Cream'),
  ('Clear American', 'Caramel Apple'),
  ('Clear American', 'Cucumber Watermelon'),
  ('Crystal Geyser', 'Mineral Sparkling Original'),
  ('Crystal Geyser', 'Mineral Sparkling Lemon Lime'),
  ('Crystal Geyser', 'Mineral Sparkling Mandarin'),
  ('Crystal Geyser', 'Mineral Sparkling Watermelon'),
  ('Poppi', 'Strawberry Lemon'),
  ('Poppi', 'Cherry Limeade'),
  ('Poppi', 'Doc Pop'),
  ('Poppi', 'Classic Cola'),
  ('Poppi', 'Root Beer'),
  ('Poppi', 'Ginger Lime'),
  ('Poppi', 'Raspberry Rose'),
  ('Poppi', 'Watermelon'),
  ('Poppi', 'Orange'),
  ('Poppi', 'Grape'),
  ('Poppi', 'Wild Berry'),
  ('Poppi', 'Citrus Spritz'),
  ('Culture Pop', 'Watermelon Lime Mint'),
  ('Culture Pop', 'Ginger Lemon Turmeric'),
  ('Culture Pop', 'Cherry Lime Hibiscus'),
  ('Culture Pop', 'Wild Berries'),
  ('Culture Pop', 'Lemongrass Citrus Ginger'),
  ('Culture Pop', 'Orange Mango Chili'),
  ('Culture Pop', 'Pineapple Lime Tarragon'),
  ('Culture Pop', 'Pink Grapefruit'),
  ('United Sodas of America', 'Sour Grapefruit'),
  ('United Sodas of America', 'Crisp Strawberry'),
  ('United Sodas of America', 'Dragonfruit Watermelon'),
  ('United Sodas of America', 'Cherry Vanilla'),
  ('United Sodas of America', 'Banana Hibiscus'),
  ('United Sodas of America', 'Tropical Punch'),
  ('United Sodas of America', 'Salted Watermelon'),
  ('United Sodas of America', 'Cucumber Mint'),
  ('United Sodas of America', 'Black Cherry Limeade'),
  ('United Sodas of America', 'Mango Chili'),
  ('United Sodas of America', 'Pineapple Coconut'),
  ('United Sodas of America', 'Raspberry Cream'),
  ('Soulboost', 'Strawberry Melon'),
  ('Soulboost', 'Lemon Elderflower'),
  ('Soulboost', 'Blueberry Pomegranate'),
  ('Soulboost', 'Cherry Hibiscus'),
  ('Soulboost', 'Mango Passionfruit'),
  ('Soulboost', 'Watermelon Lime'),
  ('Limitless', 'Lemon'),
  ('Limitless', 'Watermelon'),
  ('Limitless', 'Cherry Lime'),
  ('Limitless', 'Tangerine'),
  ('Limitless', 'Peach Mango'),
  ('Limitless', 'Grapefruit'),
  ('Limitless', 'Hibiscus Berry'),
  ('Limitless', 'Cucumber Pear'),
  ('Limitless', 'Wild Berry'),
  ('Limitless', 'Vanilla Cream Cold Brew'),
  ('Limitless', 'Cinnamon Vanilla Cold Brew'),
  ('Karma Probiotic Water', 'Berry Cherry'),
  ('Karma Probiotic Water', 'Pineapple Coconut'),
  ('Karma Probiotic Water', 'Passionfruit Green Tea'),
  ('Karma Probiotic Water', 'Citrus Guava'),
  ('Aura Bora', 'Lavender Cucumber'),
  ('Aura Bora', 'Peppermint Watermelon'),
  ('Aura Bora', 'Basil Berry'),
  ('Aura Bora', 'Cactus Rose'),
  ('Aura Bora', 'Lemongrass Coconut'),
  ('Aura Bora', 'Lemon Lavender'),
  ('Aura Bora', 'Ginger Lemon'),
  ('Aura Bora', 'Rosemary Raspberry'),
  ('Aplós', 'Calme'),
  ('Aplós', 'Arise'),
  ('Aplós', 'Verano'),
  ('Aplós', 'Fortuna'),
  ('Mocktail Club', 'Capri Sunset'),
  ('Mocktail Club', 'Cuban Twist'),
  ('Mocktail Club', 'Bossa Berry'),
  ('Mocktail Club', 'Havana Twist'),
  ('Mocktail Club', 'Italian Spritz'),
  ('Mocktail Club', 'Brazilian Mule'),
  ('Tractor Beverage Co', 'Cucumber Mint'),
  ('Tractor Beverage Co', 'Lemonade'),
  ('Tractor Beverage Co', 'Strawberry Lemonade'),
  ('Tractor Beverage Co', 'Ginger Beer'),
  ('Tractor Beverage Co', 'Orange Tarragon'),
  ('Tractor Beverage Co', 'Sparkling Lime Ginger'),
  ('Tractor Beverage Co', 'Sparkling Cucumber'),
  ('Tractor Beverage Co', 'Tropical Punch'),
  ('Hella Cocktail Co', 'Bitters and Soda Italian Citrus'),
  ('Hella Cocktail Co', 'Bitters and Soda Aromatic'),
  ('Hella Cocktail Co', 'Bitters and Soda Dry Aromatic'),
  ('Hella Cocktail Co', 'Margarita'),
  ('Hella Cocktail Co', 'Spicy Margarita'),
  ('Hella Cocktail Co', 'Paloma'),
  ('De La Calle Tepache', 'Mango Chili'),
  ('De La Calle Tepache', 'Pineapple Spice'),
  ('De La Calle Tepache', 'Passion Fruit Hibiscus'),
  ('De La Calle Tepache', 'Tamarind Citrus'),
  ('De La Calle Tepache', 'Tropical Punch'),
  ('De La Calle Tepache', 'Watermelon Jalapeño'),
  ('De La Calle Tepache', 'Pink Pineapple'),
  ('De La Calle Tepache', 'Cucumber Lime'),
  ('GT''s Kombucha', 'Original'),
  ('GT''s Kombucha', 'Gingerade'),
  ('GT''s Kombucha', 'Trilogy'),
  ('GT''s Kombucha', 'Cosmic Cranberry'),
  ('GT''s Kombucha', 'Multi Green'),
  ('GT''s Kombucha', 'Mystic Mango'),
  ('GT''s Kombucha', 'Pure Love'),
  ('GT''s Kombucha', 'Strawberry Lemonade'),
  ('GT''s Kombucha', 'Watermelon Wonder'),
  ('GT''s Kombucha', 'Synergy Heart Beet'),
  ('GT''s Kombucha', 'Citrus Aid'),
  ('GT''s Kombucha', 'Hibiscus Ginger'),
  ('GT''s Kombucha', 'Pure'),
  ('GT''s Kombucha', 'Guava Goddess'),
  ('GT''s Kombucha', 'Passion Berry Bliss'),
  ('Health-Ade Kombucha', 'Original'),
  ('Health-Ade Kombucha', 'Pink Lady Apple'),
  ('Health-Ade Kombucha', 'Pomegranate'),
  ('Health-Ade Kombucha', 'Ginger Lemon'),
  ('Health-Ade Kombucha', 'Pomegranate Berry'),
  ('Health-Ade Kombucha', 'Bubbly Rose'),
  ('Health-Ade Kombucha', 'California Grape'),
  ('Health-Ade Kombucha', 'Cayenne Cleanse'),
  ('Health-Ade Kombucha', 'Citrus Pep'),
  ('Health-Ade Kombucha', 'Holiday Cheers'),
  ('Health-Ade Kombucha', 'Maca Berry'),
  ('Health-Ade Kombucha', 'Pink Grapefruit'),
  ('Health-Ade Kombucha', 'Reishi Chocolate'),
  ('Health-Ade Kombucha', 'Tropical Punch'),
  ('Health-Ade Kombucha', 'Plus Hops'),
  ('Health-Ade Kombucha', 'Plus Cucumber'),
  ('Brew Dr Kombucha', 'Clear Mind'),
  ('Brew Dr Kombucha', 'Lemon Ginger Cayenne'),
  ('Brew Dr Kombucha', 'Love'),
  ('Brew Dr Kombucha', 'Superberry'),
  ('Brew Dr Kombucha', 'Pure Lemon'),
  ('Brew Dr Kombucha', 'Uplift'),
  ('Brew Dr Kombucha', 'Watermelon Mint'),
  ('Brew Dr Kombucha', 'Citrus Hops'),
  ('Brew Dr Kombucha', 'Strawberry Hibiscus'),
  ('Brew Dr Kombucha', 'Yerba Mate'),
  ('Brew Dr Kombucha', 'Tropical Sunrise'),
  ('Brew Dr Kombucha', 'Vanilla Oak'),
  ('Brew Dr Kombucha', 'Spiced Apple'),
  ('Brew Dr Kombucha', 'Ginger Turmeric'),
  ('Better Booch', 'Morning Glory'),
  ('Better Booch', 'Golden Pear'),
  ('Better Booch', 'Ruby Punch'),
  ('Better Booch', 'Royal Berry'),
  ('Better Booch', 'Yerba Pop'),
  ('Better Booch', 'Citrus Hops'),
  ('Better Booch', 'Tropic Tonic'),
  ('Humm Kombucha', 'Blueberry Mint'),
  ('Humm Kombucha', 'Coconut Lime'),
  ('Humm Kombucha', 'Hopped Grapefruit'),
  ('Humm Kombucha', 'Pomegranate Lemonade'),
  ('Humm Kombucha', 'Strawberry Lemonade'),
  ('Humm Kombucha', 'Mango Passionfruit'),
  ('Humm Kombucha', 'Original'),
  ('Humm Kombucha', 'Ginger Juniper'),
  ('Boylan', 'Black Cherry'),
  ('Boylan', 'Cane Cola'),
  ('Boylan', 'Diet Cane Cola'),
  ('Boylan', 'Ginger Ale'),
  ('Boylan', 'Original Birch Beer'),
  ('Boylan', 'Diet Birch Beer'),
  ('Boylan', 'Red Birch Beer'),
  ('Boylan', 'Cream Soda'),
  ('Boylan', 'Grape'),
  ('Boylan', 'Orange'),
  ('Boylan', 'Root Beer'),
  ('Boylan', 'Mash Black Cherry Lemonade'),
  ('Boylan', 'Mash Strawberry Lemonade'),
  ('Reed''s', 'Extra Ginger Brew'),
  ('Reed''s', 'Original Ginger Brew'),
  ('Reed''s', 'Premium Ginger Brew'),
  ('Reed''s', 'Stronger Ginger Brew'),
  ('Reed''s', 'Strongest Ginger Brew'),
  ('Reed''s', 'Zero Sugar Real Ginger'),
  ('Reed''s', 'Real Ginger Mule'),
  ('Reed''s', 'Strawberry Lemon Ginger'),
  ('Stewart''s', 'Root Beer'),
  ('Stewart''s', 'Orange Cream'),
  ('Stewart''s', 'Cream Soda'),
  ('Stewart''s', 'Black Cherry'),
  ('Stewart''s', 'Grape'),
  ('Stewart''s', 'Wishniak'),
  ('Stewart''s', 'Birch Beer'),
  ('Stewart''s', 'Cream Cola'),
  ('Stewart''s', 'Diet Root Beer'),
  ('Stewart''s', 'Key Lime Soda'),
  ('Jarritos', 'Tamarind'),
  ('Jarritos', 'Mandarin'),
  ('Jarritos', 'Pineapple'),
  ('Jarritos', 'Strawberry'),
  ('Jarritos', 'Lime'),
  ('Jarritos', 'Guava'),
  ('Jarritos', 'Fruit Punch'),
  ('Jarritos', 'Mexican Cola'),
  ('Jarritos', 'Watermelon'),
  ('Jarritos', 'Mango'),
  ('Jarritos', 'Toronja'),
  ('Jarritos', 'Passion Fruit'),
  ('Jarritos', 'Jamaica'),
  ('IBC', 'Root Beer'),
  ('IBC', 'Cream Soda'),
  ('IBC', 'Black Cherry'),
  ('A&W', 'Root Beer'),
  ('A&W', 'Diet Root Beer'),
  ('A&W', 'Cream Soda'),
  ('A&W', 'Diet Cream Soda'),
  ('Mug', 'Root Beer'),
  ('Mug', 'Diet Root Beer'),
  ('Mug', 'Cream Soda'),
  ('Fever-Tree', 'Premium Indian Tonic Water'),
  ('Fever-Tree', 'Mediterranean Tonic'),
  ('Fever-Tree', 'Naturally Light Tonic'),
  ('Fever-Tree', 'Elderflower Tonic'),
  ('Fever-Tree', 'Aromatic Tonic'),
  ('Fever-Tree', 'Refreshingly Light Sicilian Lemonade'),
  ('Fever-Tree', 'Ginger Beer'),
  ('Fever-Tree', 'Ginger Ale'),
  ('Fever-Tree', 'Premium Cola'),
  ('Fever-Tree', 'Italian Blood Orange'),
  ('Fever-Tree', 'Premium Pink Grapefruit'),
  ('Fever-Tree', 'Premium Soda Water'),
  ('Fever-Tree', 'Cucumber Tonic'),
  ('Fever-Tree', 'Pink Aromatic Tonic'),
  ('Q Mixers', 'Indian Tonic Water'),
  ('Q Mixers', 'Elderflower Tonic'),
  ('Q Mixers', 'Light Tonic'),
  ('Q Mixers', 'Ginger Beer'),
  ('Q Mixers', 'Ginger Ale'),
  ('Q Mixers', 'Club Soda'),
  ('Q Mixers', 'Sparkling Grapefruit'),
  ('Q Mixers', 'Spectacular Tonic'),
  ('Q Mixers', 'Cucumber Tonic'),
  ('Q Mixers', 'Hibiscus'),
  ('Q Mixers', 'Kola'),
  ('Goslings Ginger Beer', 'Stormy'),
  ('Goslings Ginger Beer', 'Diet Stormy'),
  ('Goslings Ginger Beer', 'Premium'),
  ('Goslings Ginger Beer', 'Light'),
  ('Bundaberg', 'Ginger Beer'),
  ('Bundaberg', 'Diet Ginger Beer'),
  ('Bundaberg', 'Root Beer'),
  ('Bundaberg', 'Pink Grapefruit'),
  ('Bundaberg', 'Peachee'),
  ('Bundaberg', 'Lemon Lime Bitters'),
  ('Bundaberg', 'Tropical Mango'),
  ('365 by Whole Foods', 'Sparkling Water Black Cherry'),
  ('365 by Whole Foods', 'Sparkling Water Coconut Pineapple'),
  ('365 by Whole Foods', 'Sparkling Water Pomegranate'),
  ('365 by Whole Foods', 'Sparkling Water Watermelon'),
  ('365 by Whole Foods', 'Sparkling Mineral Water'),
  ('365 by Whole Foods', 'Sparkling Lime Cucumber'),
  ('Aldi Summit', 'Original'),
  ('Aldi Summit', 'Lime'),
  ('Aldi Summit', 'Lemon'),
  ('Aldi Summit', 'Black Cherry'),
  ('Aldi Summit', 'Grapefruit'),
  ('Aldi Summit', 'Strawberry'),
  ('Aldi Summit', 'Mango'),
  ('Aldi Summit', 'Tropical'),
  ('Aldi Summit', 'Mixed Berry'),
  ('Kroger Big K', 'Original Seltzer'),
  ('Kroger Big K', 'Lime'),
  ('Kroger Big K', 'Lemon'),
  ('Kroger Big K', 'Strawberry'),
  ('Kroger Big K', 'Black Cherry'),
  ('Kroger Big K', 'Grapefruit'),
  ('Kroger Big K', 'Cherry Limeade'),
  ('Kroger Big K', 'Vanilla Cream'),
  ('Wegmans', 'Lime'),
  ('Wegmans', 'Lemon'),
  ('Wegmans', 'Black Cherry'),
  ('Wegmans', 'Grapefruit'),
  ('Wegmans', 'Original'),
  ('Wegmans', 'Strawberry'),
  ('Wegmans', 'Cranberry Lime'),
  ('Wegmans', 'Mango'),
  ('HEB Mountain Spring', 'Original'),
  ('HEB Mountain Spring', 'Lime'),
  ('HEB Mountain Spring', 'Lemon'),
  ('HEB Mountain Spring', 'Black Cherry'),
  ('HEB Mountain Spring', 'Mango'),
  ('HEB Mountain Spring', 'Grapefruit'),
  ('HEB Mountain Spring', 'Strawberry'),
  ('HEB Mountain Spring', 'Tropical Punch'),
  ('Open Nature', 'Lime'),
  ('Open Nature', 'Lemon'),
  ('Open Nature', 'Black Cherry'),
  ('Open Nature', 'Mango'),
  ('Open Nature', 'Mandarin'),
  ('Open Nature', 'Cucumber'),
  ('Simple Truth', 'Sparkling Lemon'),
  ('Simple Truth', 'Sparkling Lime'),
  ('Simple Truth', 'Sparkling Black Cherry'),
  ('Simple Truth', 'Sparkling Cranberry'),
  ('Simple Truth', 'Sparkling Grapefruit'),
  ('Simple Truth', 'Sparkling Mango'),
  ('Signature Select', 'Lemon Sparkling Water'),
  ('Signature Select', 'Lime Sparkling Water'),
  ('Signature Select', 'Black Cherry Sparkling Water'),
  ('Signature Select', 'Strawberry Sparkling Water'),
  ('Signature Select', 'Grapefruit Sparkling Water'),
  ('Gerolsteiner', 'Sprudel Sparkling'),
  ('Gerolsteiner', 'Naturell Still'),
  ('Gerolsteiner', 'Pomp Lemon'),
  ('Apollinaris', 'Sparkling Classic'),
  ('Apollinaris', 'Sparkling Light'),
  ('Apollinaris', 'Lemon'),
  ('Vichy Catalan', 'Original'),
  ('Vichy Catalan', 'Lima'),
  ('Vichy Catalan', 'Limón'),
  ('Borjomi', 'Sparkling Mineral Water'),
  ('Borjomi', 'Citrus'),
  ('Borjomi', 'Cherry Plum'),
  ('Badoit', 'Naturally Sparkling'),
  ('Badoit', 'Intense'),
  ('Badoit', 'Red'),
  ('Highland Spring', 'Sparkling Original'),
  ('Highland Spring', 'Sparkling Lemon'),
  ('Highland Spring', 'Sparkling Apple Raspberry'),
  ('Sanpellegrino Italian Sparkling', 'Limonata'),
  ('Sanpellegrino Italian Sparkling', 'Aranciata'),
  ('Sanpellegrino Italian Sparkling', 'Aranciata Rossa'),
  ('Sanpellegrino Italian Sparkling', 'Pompelmo'),
  ('Sanpellegrino Italian Sparkling', 'Clementina'),
  ('Sanpellegrino Italian Sparkling', 'Limone Menta'),
  ('Sanpellegrino Italian Sparkling', 'Pesca Tea'),
  ('Sanpellegrino Italian Sparkling', 'Melograno Arancia'),
  ('Sanpellegrino Italian Sparkling', 'Ficodindia Arancia'),
  ('Sanpellegrino Italian Sparkling', 'Pesca'),
  ('Sanpellegrino Italian Sparkling', 'Limonata Zero'),
  ('Bondi Sparkling', 'Original'),
  ('Bondi Sparkling', 'Lemon'),
  ('Bondi Sparkling', 'Lime'),
  ('Bondi Sparkling', 'Berry'),
  ('Bondi Sparkling', 'Tropical'),
  ('Bondi Sparkling', 'Cucumber Mint'),
  ('Drink Simple Maple Water', 'Plain'),
  ('Drink Simple Maple Water', 'Lemon'),
  ('Drink Simple Maple Water', 'Wild Blueberry'),
  ('Drink Simple Maple Water', 'Watermelon'),
  ('Mountain Birch', 'Plain'),
  ('Mountain Birch', 'Lemon'),
  ('Mountain Birch', 'Berry'),
  ('Vita Coco Sparkling', 'Original'),
  ('Vita Coco Sparkling', 'Lemon Ginger'),
  ('Vita Coco Sparkling', 'Pineapple'),
  ('Vita Coco Sparkling', 'Mango'),
  ('Phocus', 'Caffeinated Black Cherry'),
  ('Phocus', 'Caffeinated Pomegranate Lime'),
  ('Phocus', 'Caffeinated Lemon'),
  ('Phocus', 'Caffeinated Mint'),
  ('Phocus', 'Caffeinated Peach'),
  ('Liquid I.V. Sparkling', 'Strawberry'),
  ('Liquid I.V. Sparkling', 'Lemon Lime'),
  ('Liquid I.V. Sparkling', 'Tropical Punch'),
  ('Liquid I.V. Sparkling', 'Watermelon'),
  ('Cure Hydration', 'Pineapple Coconut'),
  ('Cure Hydration', 'Watermelon'),
  ('Cure Hydration', 'Citrus Berry'),
  ('Cure Hydration', 'Lemonade'),
  ('Cure Hydration', 'Grape'),
  ('Cure Hydration', 'Tropical Fruit'),
  ('Phocus Caffeinated', 'Original'),
  ('Phocus Caffeinated', 'Yuzu Lime'),
  ('Phocus Caffeinated', 'Pomegranate Berry'),
  ('Phocus Caffeinated', 'Grapefruit'),
  ('Phocus Caffeinated', 'Cucumber'),
  ('Phocus Caffeinated', 'Peach'),
  ('Hiyo', 'Watermelon Lime'),
  ('Hiyo', 'Strawberry Guava'),
  ('Hiyo', 'Mango Passionfruit'),
  ('Hiyo', 'Blackberry Lemon'),
  ('Hiyo', 'Peach Mango'),
  ('Recess', 'Mood Lemon Ginger'),
  ('Recess', 'Mood Magnesium Citrus'),
  ('Recess', 'Mood Strawberry Hibiscus'),
  ('Wild Wonder', 'Citrus Burst'),
  ('Wild Wonder', 'Berry Bliss'),
  ('Wild Wonder', 'Mango Mate'),
  ('Wild Wonder', 'Cucumber Lime'),
  ('Wild Wonder', 'Peach Apricot'),
  ('Lemon Perfect', 'Just Lemon'),
  ('Lemon Perfect', 'Strawberry Passion Fruit'),
  ('Lemon Perfect', 'Peach Raspberry'),
  ('Lemon Perfect', 'Dragon Fruit Mango'),
  ('Lemon Perfect', 'Blueberry Acai'),
  ('Lemon Perfect', 'Pineapple Coconut'),
  ('Lemon Perfect', 'Cherry Hibiscus'),
  ('Joy Fizz', 'Original'),
  ('Joy Fizz', 'Lemon'),
  ('Joy Fizz', 'Lime'),
  ('Joy Fizz', 'Mango'),
  ('Mountain Valley', 'Sparkling Lemon Essence'),
  ('Mountain Valley', 'Sparkling Lime Essence'),
  ('Mountain Valley', 'Sparkling Blueberry Essence'),
  ('Mountain Valley', 'Sparkling Pomegranate Essence'),
  ('Saratoga', 'Mineral Water'),
  ('Saratoga', 'Sparkling Cucumber'),
  ('Saratoga', 'Sparkling Pink Grapefruit'),
  ('Saratoga', 'Sparkling Berry'),
  ('Voss', 'Still Plain'),
  ('Voss', 'Still Lemon Cucumber'),
  ('Voss', 'Flavored Black Currant'),
  ('Voss', 'Flavored Strawberry Mint'),
  ('Voss', 'Sparkling Watermelon Mint'),
  ('LaCroix', 'Watermelon'),
  ('LaCroix', 'Mango'),
  ('LaCroix', 'Strawberry'),
  ('LaCroix', 'Cherry Blossom'),
  ('LaCroix', 'Pineapple Strawberry'),
  ('LaCroix', 'Lemon Cello Limoncello'),
  ('LaCroix', 'Pear Pomegranate'),
  ('Polar', 'Pomegranate Lime'),
  ('Polar', 'Apple Cranberry'),
  ('Polar', 'Mango Pineapple'),
  ('Polar', 'Black Cherry Vanilla'),
  ('Polar', 'Cucumber Watermelon'),
  ('Polar', 'Pineapple Pomelo'),
  ('Polar', 'Sea Salt Lime'),
  ('Spindrift', 'Lemon Lime'),
  ('Spindrift', 'Half Tea Half Lemon Sparkling Water'),
  ('Spindrift', 'Cucumber Lemon Sparkling'),
  ('Spindrift', 'Yuzu Mandarin'),
  ('Spindrift', 'Cranberry Lime'),
  ('Spindrift', 'Berry Bellini'),
  ('Bubly', 'Cucumber Mint Mocktail'),
  ('Bubly', 'Pineapple Coconut'),
  ('Bubly', 'Tropical Mocktail'),
  ('Bubly', 'Tangerine Lime'),
  ('Bubly', 'Razzleberry'),
  ('Sparkling Ice', 'Cherry Lime Tea'),
  ('Sparkling Ice', 'Pomegranate Lemonade Tea'),
  ('Sparkling Ice', 'Lemon Lime Tea'),
  ('Sparkling Ice', 'Black Raspberry Tea'),
  ('Sparkling Ice', 'Strawberry Watermelon Tea'),
  ('Daytrip', 'Lavender Citrus'),
  ('Daytrip', 'Peach'),
  ('Daytrip', 'Pineapple Mint'),
  ('Daytrip', 'Blackberry Ginger'),
  ('Daytrip', 'Watermelon'),
  ('Daytrip', 'Yuzu Hops'),
  ('Plink', 'Lemon Lime'),
  ('Plink', 'Berry'),
  ('Plink', 'Tropical'),
  ('Plink', 'Citrus'),
  ('Mood Beverages', 'Lemon Ginger'),
  ('Mood Beverages', 'Magnesium Citrus'),
  ('Mood Beverages', 'Strawberry Hibiscus'),
  ('Mood Beverages', 'Black Cherry'),
  ('Mood Beverages', 'Pomegranate Acai'),
  ('Sap', 'Lemon'),
  ('Sap', 'Raspberry'),
  ('Sap', 'Original Maple'),
  ('Avec', 'Hibiscus Pomelo'),
  ('Avec', 'Jamaican Sorrel'),
  ('Avec', 'Yuzu Ginger'),
  ('Avec', 'Pineapple Jalapeño'),
  ('Avec', 'Mango Tangerine'),
  ('Avec', 'Tonic Lemonade'),
  ('Casamara Club', 'Alta'),
  ('Casamara Club', 'Onda'),
  ('Casamara Club', 'Sera'),
  ('Casamara Club', 'Como'),
  ('Casamara Club', 'Vesto'),
  ('Top Note', 'Indian Tonic'),
  ('Top Note', 'Bitter Lemon'),
  ('Top Note', 'Classic Tonic'),
  ('Top Note', 'Bitter Orange'),
  ('Top Note', 'Ginger Beer'),
  ('Top Note', 'Tonic with Citrus'),
  ('East Imperial', 'Tonic Water'),
  ('East Imperial', 'Yuzu Tonic'),
  ('East Imperial', 'Old World Tonic'),
  ('East Imperial', 'Mombasa Ginger Beer'),
  ('East Imperial', 'Grapefruit Tonic'),
  ('Pellegrino Momenti', 'Lemon Mint'),
  ('Pellegrino Momenti', 'Pomegranate Orange'),
  ('Pellegrino Momenti', 'Lemon Black Tea'),
  ('Eboost', 'Sparkling Orange'),
  ('Eboost', 'Sparkling Berry'),
  ('Eboost', 'Sparkling Lemon Lime'),
  ('Hi-Ball Energy', 'Original Sparkling'),
  ('Hi-Ball Energy', 'Lemon Lime'),
  ('Hi-Ball Energy', 'Wild Berry'),
  ('Hi-Ball Energy', 'Grapefruit'),
  ('Hi-Ball Energy', 'Peach Mango'),
  ('Hi-Ball Energy', 'Pomegranate Acai'),
  ('Hi-Ball Energy', 'Vanilla'),
  ('Hi-Ball Energy', 'Watermelon Mint'),
  ('OWYN Sparkling', 'Original'),
  ('OWYN Sparkling', 'Lemon'),
  ('OWYN Sparkling', 'Berry'),
  ('AlkaPlex Sparkling', 'Lemon'),
  ('AlkaPlex Sparkling', 'Lime'),
  ('AlkaPlex Sparkling', 'Pomegranate'),
  ('JuneShine Sparkling', 'Acai Berry'),
  ('JuneShine Sparkling', 'Honey Ginger Lemon'),
  ('JuneShine Sparkling', 'Blood Orange Mint'),
  ('JuneShine Sparkling', 'Midnight Painkiller'),
  ('Kin Euphorics', 'Lightwave'),
  ('Kin Euphorics', 'High Rhode'),
  ('Kin Euphorics', 'Dream Light'),
  ('Kin Euphorics', 'Spritz'),
  ('Ghia', 'Original Le Spritz'),
  ('Ghia', 'Berry Le Spritz'),
  ('Ghia', 'Sumac and Chili Le Spritz'),
  ('Ghia', 'Ginger Le Spritz'),
  ('Ghia', 'Sumac Le Spritz'),
  ('Wölffer Estate Spritz', 'No. 139 Dry Rosé'),
  ('Wölffer Estate Spritz', 'Sparkling No. 139'),
  ('Wölffer Estate Spritz', 'No. 139 White'),
  ('Hint Caffeine Kick', 'Black Raspberry'),
  ('Hint Caffeine Kick', 'Mango Grapefruit'),
  ('Hint Caffeine Kick', 'Strawberry Kiwi'),
  ('Sunwink', 'Hibiscus Mint'),
  ('Sunwink', 'Lemon Rose'),
  ('Sunwink', 'Raspberry Roselle'),
  ('Sunwink', 'Lime Mint'),
  ('Sunwink', 'Pineapple Turmeric'),
  ('Sunwink', 'Strawberry Lavender'),
  ('De La Calle', 'Mango Chili Tepache'),
  ('De La Calle', 'Pineapple Spice Tepache'),
  ('De La Calle', 'Passionfruit Hibiscus Tepache'),
  ('De La Calle', 'Tamarind Citrus Tepache'),
  ('Olipop Functional', 'Burning Mandarin'),
  ('Olipop Functional', 'Caffeine Cherry Cola'),
  ('Olipop Functional', 'Crisp Apple'),
  ('Olipop Functional', 'Cherry Vanilla'),
  ('Health-Ade Plus', 'Plus Magnesium'),
  ('Health-Ade Plus', 'Plus Energy'),
  ('Health-Ade Plus', 'Plus Calm'),
  ('Health-Ade Plus', 'Plus Beauty'),
  ('Roar Organic', 'Sparkling Lemonade'),
  ('Roar Organic', 'Sparkling Watermelon'),
  ('Roar Organic', 'Sparkling Strawberry Kiwi'),
  ('Wonderbrew', 'Citrus Hops'),
  ('Wonderbrew', 'Tropical Hops'),
  ('Wonderbrew', 'Lemon Ginger'),
  ('Hibiscus & Co', 'Classic Hibiscus'),
  ('Hibiscus & Co', 'Hibiscus Ginger'),
  ('Hibiscus & Co', 'Hibiscus Lemon'),
  ('Hibiscus & Co', 'Hibiscus Rose'),
  ('Tovala', 'Sparkling Lemon'),
  ('Tovala', 'Sparkling Lime'),
  ('Tovala', 'Sparkling Grapefruit'),
  ('Pop & Bottle', 'Vanilla Cold Brew Latte'),
  ('Pop & Bottle', 'Almond Latte Mocha'),
  ('Pop & Bottle', 'Salted Caramel Cold Brew'),
  ('Pop & Bottle', 'Vanilla Bean Almond Milk Latte'),
  ('Sodastream Limited Edition', 'Cherry Cola'),
  ('Sodastream Limited Edition', 'Diet Cherry Cola'),
  ('Sodastream Limited Edition', 'Tropical Mango'),
  ('Henniez', 'Sparkling Mineral Water'),
  ('Pellegrino Sparkling Tea', 'Hibiscus'),
  ('Pellegrino Sparkling Tea', 'Lemon'),
  ('Pellegrino Sparkling Tea', 'Peach'),
  ('Spindrift Light', 'Lime'),
  ('Spindrift Light', 'Lemon'),
  ('Spindrift Light', 'Grapefruit'),
  ('Spindrift Light', 'Pineapple'),
  ('Spindrift Light', 'Cucumber'),
  ('Trader Joe''s Limited', 'Cucumber Mint Sparkling Water'),
  ('Trader Joe''s Limited', 'Watermelon Strawberry Sparkling Water'),
  ('Trader Joe''s Limited', 'Lemon Verbena Sparkling Water'),
  ('Trader Joe''s Limited', 'Cranberry Pomegranate Sparkling Water'),
  ('Walmart Great Value', 'Original Sparkling Water'),
  ('Walmart Great Value', 'Lemon Sparkling Water'),
  ('Walmart Great Value', 'Lime Sparkling Water'),
  ('Walmart Great Value', 'Black Cherry Sparkling Water'),
  ('Walmart Great Value', 'Strawberry Sparkling Water'),
  ('Walmart Great Value', 'Mandarin Orange Sparkling Water'),
  ('Costco Kirkland Sparkling Mineral', 'Sparkling Italian Mineral Water'),
  ('Costco Kirkland Sparkling Mineral', 'Sparkling Apple'),
  ('Costco Kirkland Sparkling Mineral', 'Sparkling Cucumber')
on conflict do nothing;

update public.seltzers
  set image_quality_flag = 'needs_review'
  where image_url is null
    and (image_quality_flag is null or image_quality_flag <> 'replaced');

-- ════════════════════════════════════════════════════════════════
-- SECTION 5 / 5  —  SCALABILITY INDEXES + drink_stats VIEW
-- ════════════════════════════════════════════════════════════════
-- ─────────────────────────────────────────────────────────────
-- SCALABILITY INDEXES & MATERIALIZED VIEWS
-- One-shot migration adding the indexes that matter once you've got
-- more than a few thousand reviews. Idempotent.
--
-- Hot paths covered:
--   1. Trigram search on seltzers (brand/name)  — autocomplete
--   2. Reviews by seltzer (drink page)           — already indexed?
--   3. Reviews by user (profile feed)            — common
--   4. Feed query (reviews joined with follows)  — common
--   5. Likes/comments/tried-it counts by review  — every feed page
--   6. Per-drink aggregates as a materialized view (cheap reads)
-- ─────────────────────────────────────────────────────────────

-- Enable trigram extension for fast ILIKE search
create extension if not exists pg_trgm;

-- 1. Seltzer search — trigram index makes `ilike '%query%'` ~10× faster
create index if not exists seltzers_brand_trgm  on public.seltzers using gin (lower(brand)  gin_trgm_ops);
create index if not exists seltzers_name_trgm   on public.seltzers using gin (lower(name)   gin_trgm_ops);

-- 2. Drink page — fetch every review of a single seltzer, newest first
create index if not exists reviews_seltzer_created_idx
  on public.reviews (seltzer_id, created_at desc);

-- 3. Profile reviews — fetch a user's reviews, newest first
create index if not exists reviews_user_created_idx
  on public.reviews (user_id, created_at desc);

-- 4. Likes / comments / tried-it lookups by review
create index if not exists likes_review_user_idx     on public.likes (review_id, user_id);
create index if not exists comments_review_idx       on public.comments (review_id, created_at);
create index if not exists tried_it_review_idx       on public.tried_it (review_id);
create index if not exists tried_it_user_idx         on public.tried_it (user_id);

-- 5. Follows — feed-building lookups
create index if not exists follows_follower_idx      on public.follows (follower_id);
create index if not exists follows_following_idx     on public.follows (following_id);

-- 6. Notifications — inbox queries by user, newest first, unread filter
--    (column is `read` on your schema, not `is_read`)
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read)
  where read = false;

-- 7. Tier list activity feed — subscribed-list updates by created_at
create index if not exists shared_tier_list_items_list_added_idx
  on public.shared_tier_list_items (list_id, added_by);
create index if not exists shared_tier_list_items_seltzer_idx
  on public.shared_tier_list_items (seltzer_id);

-- 8. Reviews JSONB — speed up rating_contributions lookups (not used yet,
--    but cheap to add). Skipped — only add if profile aggregations grow.

-- ───── MATERIALIZED VIEW: drink stats ─────
-- For 1,000+ canonical drinks × thousands of reviews, computing
-- (count, avg_rating, latest_image_url) on every /trending and /drink
-- pageview is wasteful. This view recomputes on a schedule (cron).

drop materialized view if exists public.drink_stats cascade;
create materialized view public.drink_stats as
select
  r.seltzer_id              as seltzer_id,
  count(*)                  as review_count,
  round(avg(r.rating)::numeric, 2) as avg_rating,
  max(r.created_at)         as latest_review_at,
  -- Pick the freshest image URL from any review of this drink
  (array_agg(r.image_url order by r.created_at desc) filter (where r.image_url is not null))[1]
                            as latest_image_url
from public.reviews r
where r.seltzer_id is not null
group by r.seltzer_id;

create unique index drink_stats_seltzer_uniq on public.drink_stats (seltzer_id);
create index       drink_stats_review_count   on public.drink_stats (review_count desc);
create index       drink_stats_avg_rating     on public.drink_stats (avg_rating desc);

-- Initial populate
refresh materialized view public.drink_stats;

-- ───── Helper RPC to refresh on demand ─────
create or replace function public.refresh_drink_stats()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.drink_stats;
end;
$$;

-- Anyone authenticated can trigger a refresh (cheap; rate-limit upstream)
grant execute on function public.refresh_drink_stats() to authenticated;


select 'Drink stats rows:' as note, count(*) as count from public.drink_stats;
