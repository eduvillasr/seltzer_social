// lib/reviewDisplay.ts
// Tiny helpers for rendering reviews now that title and drink are separate.

import { Review } from '@/types';

/** Headline shown at the top of a review card. Falls back to drink name. */
export function reviewHeadline(r: Pick<Review, 'title' | 'seltzer_name'>): string {
  return r.title?.trim() || r.seltzer_name;
}

/** "Brand · Drink" subtitle. Returns null when there's nothing useful to show. */
export function reviewDrinkLabel(r: Pick<Review, 'brand' | 'seltzer_name'>): string | null {
  const brand = r.brand?.trim();
  if (brand) return `${brand} · ${r.seltzer_name}`;
  return r.seltzer_name || null;
}

/** True when the review has a custom title that differs from the drink name. */
export function hasCustomTitle(r: Pick<Review, 'title' | 'seltzer_name'>): boolean {
  const t = r.title?.trim();
  return !!t && t.toLowerCase() !== r.seltzer_name.toLowerCase();
}
