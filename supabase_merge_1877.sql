-- supabase_merge_1877.sql
--
-- One-off merge: collapse "1877 by HEB" into the bare "1877" (the canonical
-- name — retailer suffix dropped). Repoints reviews, merges/repoints shared
-- tier-list items (combining rating_contributions + recomputing the rating
-- and tier letter on same-list collisions), dedupes/repoints suggestions,
-- then deletes the loser row and ensures the survivor is named "1877".
--
-- Order-independent + safe to re-run: if only one of the two rows exists it
-- is simply renamed to "1877"; if neither exists it's a no-op.
-- Modeled on the merge DO block in supabase_strict_naming.sql.

do $$
declare
  keeper uuid;
  loser  uuid;
  it record;
  existing_item_id uuid;
  merged_contribs jsonb;
  avg_r numeric;
  tier_letter text;
begin
  -- Keeper = the bare "1877" if it exists, else "1877 by HEB".
  select id into keeper from public.seltzers
    where lower(trim(name)) = lower('1877') limit 1;
  if keeper is null then
    select id into keeper from public.seltzers
      where lower(trim(name)) = lower('1877 by HEB') limit 1;
  end if;

  -- Loser = "1877 by HEB" (unless it's already the keeper).
  select id into loser from public.seltzers
    where lower(trim(name)) = lower('1877 by HEB') limit 1;
  if loser = keeper then loser := null; end if;

  if keeper is null then
    raise notice 'Neither "1877" nor "1877 by HEB" found — nothing to do.';
    return;
  end if;

  -- Always normalize the survivor's name to the canonical "1877".
  update public.seltzers set name = '1877' where id = keeper;

  if loser is null then
    raise notice 'Only one row present — renamed survivor to "1877" (%).', keeper;
    return;
  end if;

  ------------------------------------------------------------------
  -- REVIEWS: just repoint. Two reviews on the same drink is fine.
  ------------------------------------------------------------------
  update public.reviews
    set seltzer_id = keeper where seltzer_id = loser;

  ------------------------------------------------------------------
  -- TIER LIST ITEMS: if both rows are on the same list, MERGE them
  -- (combine rating_contributions, recompute rating + tier),
  -- otherwise just repoint.
  ------------------------------------------------------------------
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
      -- Merge the two items: union of per-user contributions.
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

      -- Compute new average + tier letter.
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

  ------------------------------------------------------------------
  -- TIER LIST SUGGESTIONS: repoint if no collision on the same list,
  -- otherwise drop the duplicate suggestion.
  ------------------------------------------------------------------
  delete from public.shared_tier_list_suggestions s1
  using public.shared_tier_list_suggestions s2
  where s1.seltzer_id = loser
    and s2.seltzer_id = keeper
    and s1.list_id    = s2.list_id
    and s1.id <> s2.id;
  update public.shared_tier_list_suggestions
    set seltzer_id = keeper where seltzer_id = loser;

  -- Finally drop the loser seltzer row.
  delete from public.seltzers where id = loser;

  raise notice 'Merged "1877 by HEB" (%) into "1877" (%).', loser, keeper;
end$$;
