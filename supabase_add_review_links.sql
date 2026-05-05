-- Link tier list items and suggestions back to original reviews
-- Run in Supabase SQL Editor

ALTER TABLE public.shared_tier_list_items
  ADD COLUMN IF NOT EXISTS review_id uuid references public.reviews(id) on delete set null;

ALTER TABLE public.shared_tier_list_suggestions
  ADD COLUMN IF NOT EXISTS review_id uuid references public.reviews(id) on delete set null;

CREATE INDEX IF NOT EXISTS shared_tier_list_items_review_idx
  ON public.shared_tier_list_items(review_id);

CREATE INDEX IF NOT EXISTS shared_tier_list_suggestions_review_idx
  ON public.shared_tier_list_suggestions(review_id);
