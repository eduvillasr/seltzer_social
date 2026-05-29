// lib/achievements.ts
// All achievements live here as static metadata + an `evaluate` function
// that derives unlocked status from the user's stats. No DB writes needed —
// achievements are computed deterministically from existing data.
//
// To add a new achievement: append a new entry to ACHIEVEMENTS with a unique
// `id`, `tier`, `name`, `description`, `icon`, and an `evaluate(stats)` that
// returns true when unlocked.

import {
  Star, Sparkles, Trophy, Award, Crown, Medal, Flame, Heart, MessageCircle,
  ListPlus, Users, Pencil, Droplets, Zap, Target, Gem, Compass, Rocket, type LucideIcon,
} from 'lucide-react';

// ─── Tier definitions ──────────────────────────────────────────
// Tiers control the visual treatment (color, glow intensity).
export const TIER_META: Record<AchievementTier, { color: string; label: string; glow: number }> = {
  bronze:    { color: '#cd7f32', label: 'Bronze',    glow: 0.25 },
  silver:    { color: '#c0c4cc', label: 'Silver',    glow: 0.32 },
  gold:      { color: '#f4c430', label: 'Gold',      glow: 0.45 },
  platinum:  { color: '#22d3ee', label: 'Platinum',  glow: 0.55 },
  legendary: { color: '#a78bfa', label: 'Legendary', glow: 0.7  },
};

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  tier: AchievementTier;
  icon: LucideIcon;
  evaluate: (s: AchievementStats) => boolean;
  /** Optional progress getter — returns [current, target]. */
  progress?: (s: AchievementStats) => [number, number];
}

export interface AchievementStats {
  reviewCount: number;
  uniqueBrands: number;
  avgRating: number;
  lowRatingCount: number; // reviews rated <= 2.0 (for the "critic" achievement)
  totalLikesReceived: number;
  totalCommentsReceived: number;
  totalTriedItReceived: number;
  followers: number;
  following: number;
  tierListsAsMember: number;
  hasFiveStarReview: boolean;
  hasFreshReview: boolean; // posted in last 7 days
  isFounder: boolean;
  isBetaTester: boolean;
}

// ─── Helper: build a tiered ladder for a single stat ────────────
// All achievements should build on each other. A "ladder" is a series of
// achievements on the same dimension (e.g. review count) with rising
// thresholds and tiers. This factory keeps them consistent.
function ladder(opts: {
  baseId: string;                // 'reviewer'
  stat: keyof AchievementStats;  // 'reviewCount'
  unitLabel: string;             // 'reviews'
  rungs: Array<{ tier: AchievementTier; n: number; name: string; icon: LucideIcon }>;
}): Achievement[] {
  return opts.rungs.map(({ tier, n, name, icon }) => ({
    id: `${opts.baseId}_${n}`,
    name,
    description: `${n.toLocaleString()} ${opts.unitLabel}`,
    tier,
    icon,
    evaluate: (s) => (s[opts.stat] as unknown as number) >= n,
    progress: (s) => [Math.min(s[opts.stat] as unknown as number, n), n],
  }));
}

// ─── The catalog ───────────────────────────────────────────────
// All achievements are ladders by default — bronze → silver → gold → platinum
// → legendary, building on each other. A few one-off achievements live at the
// bottom for non-cumulative things (5-star streak, harsh critic, etc).
export const ACHIEVEMENTS: Achievement[] = [
  // Reviews ladder
  ...ladder({
    baseId: 'reviewer', stat: 'reviewCount', unitLabel: 'reviews',
    rungs: [
      { tier: 'bronze',    n: 1,   name: 'First Sip',     icon: Pencil },
      { tier: 'silver',    n: 10,  name: 'Regular',       icon: Star },
      { tier: 'gold',      n: 50,  name: 'Connoisseur',   icon: Trophy },
      { tier: 'platinum',  n: 100, name: 'Sommelier',     icon: Crown },
      { tier: 'legendary', n: 250, name: 'Cellar Master', icon: Gem },
    ],
  }),

  // Brand exploration ladder
  ...ladder({
    baseId: 'brands', stat: 'uniqueBrands', unitLabel: 'unique brands reviewed',
    rungs: [
      { tier: 'bronze',   n: 3,  name: 'Open Mind',          icon: Compass },
      { tier: 'silver',   n: 8,  name: 'Brand Curious',      icon: Compass },
      { tier: 'gold',     n: 15, name: 'Brand Hopper',       icon: Rocket },
      { tier: 'platinum', n: 25, name: 'Brand Encyclopedia', icon: Award },
    ],
  }),

  // Likes-received ladder
  ...ladder({
    baseId: 'liked', stat: 'totalLikesReceived', unitLabel: 'likes received',
    rungs: [
      { tier: 'bronze',    n: 5,   name: 'First Cheers',  icon: Heart },
      { tier: 'silver',    n: 25,  name: 'Crowd Pleaser', icon: Heart },
      { tier: 'gold',      n: 100, name: 'Local Legend',  icon: Flame },
      { tier: 'platinum',  n: 250, name: 'Hot Take',      icon: Flame },
      { tier: 'legendary', n: 500, name: 'Hall of Fame',  icon: Trophy },
    ],
  }),

  // Comments-received ladder
  ...ladder({
    baseId: 'discussed', stat: 'totalCommentsReceived', unitLabel: 'comments received',
    rungs: [
      { tier: 'bronze', n: 1,  name: 'Talk of the Town',   icon: MessageCircle },
      { tier: 'silver', n: 10, name: 'Sparked Discussion', icon: MessageCircle },
      { tier: 'gold',   n: 50, name: 'Lively Thread',      icon: MessageCircle },
    ],
  }),

  // Tried-It-received ladder ("people tried this because of you")
  ...ladder({
    baseId: 'tried', stat: 'totalTriedItReceived', unitLabel: 'people tried a drink because of you',
    rungs: [
      { tier: 'bronze',   n: 1,  name: 'Influencer Spark', icon: Sparkles },
      { tier: 'silver',   n: 5,  name: 'Trendsetter',      icon: Award },
      { tier: 'gold',     n: 15, name: 'Community Pick',   icon: Award },
      { tier: 'platinum', n: 50, name: 'Tastemaker',       icon: Crown },
    ],
  }),

  // Followers ladder
  ...ladder({
    baseId: 'followers', stat: 'followers', unitLabel: 'followers',
    rungs: [
      { tier: 'bronze',    n: 1,   name: 'Friend Made',        icon: Users },
      { tier: 'silver',    n: 10,  name: 'Pull',               icon: Users },
      { tier: 'gold',      n: 50,  name: 'Influencer',         icon: Medal },
      { tier: 'platinum',  n: 250, name: 'Voice of Authority', icon: Medal },
      { tier: 'legendary', n: 1000, name: 'Cult Following',    icon: Crown },
    ],
  }),

  // Tier-list memberships ladder
  ...ladder({
    baseId: 'lists', stat: 'tierListsAsMember', unitLabel: 'shared tier lists joined',
    rungs: [
      { tier: 'bronze', n: 1, name: 'Curator',          icon: ListPlus },
      { tier: 'silver', n: 3, name: 'Council Member',   icon: ListPlus },
      { tier: 'gold',   n: 5, name: 'Curator’s Circle', icon: Trophy },
    ],
  }),

  // ─── One-off achievements (don't ladder) ───────────────────────
  {
    id: 'first_five_star',
    name: 'Perfect Pour',
    description: 'Gave a 5.0 rating',
    tier: 'silver',
    icon: Sparkles,
    evaluate: (s) => s.hasFiveStarReview,
  },
  {
    id: 'harsh_critic',
    name: 'Hard to Please',
    description: 'Rated 5 drinks 2.0 or lower',
    tier: 'silver',
    icon: Target,
    evaluate: (s) => s.lowRatingCount >= 5,
    progress: (s) => [Math.min(s.lowRatingCount, 5), 5],
  },
  {
    id: 'generous',
    name: 'Glass Half Full',
    description: 'Average rating above 4.0 (10+ reviews)',
    tier: 'silver',
    icon: Heart,
    evaluate: (s) => s.reviewCount >= 10 && s.avgRating >= 4.0,
  },
  {
    id: 'on_streak',
    name: 'On The Hunt',
    description: 'Posted a review in the last 7 days',
    tier: 'bronze',
    icon: Zap,
    evaluate: (s) => s.hasFreshReview,
  },

  // Note: "Founder" and "Beta Tester" are no longer achievements — they're
  // now exclusive identity badges (see components/FounderBadge.tsx).
];

/** Returns the user's unlocked achievements + locked-with-progress. */
export function evaluateAchievements(stats: AchievementStats) {
  const unlocked: Achievement[] = [];
  const locked: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (a.evaluate(stats)) unlocked.push(a);
    else locked.push(a);
  }
  return { unlocked, locked };
}
