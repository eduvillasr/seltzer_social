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

// ─── The catalog ───────────────────────────────────────────────
export const ACHIEVEMENTS: Achievement[] = [
  // Onboarding ladder
  {
    id: 'first_review',
    name: 'First Sip',
    description: 'Wrote your first review',
    tier: 'bronze',
    icon: Pencil,
    evaluate: (s) => s.reviewCount >= 1,
    progress: (s) => [Math.min(s.reviewCount, 1), 1],
  },
  {
    id: 'reviewer_10',
    name: 'Regular',
    description: 'Wrote 10 reviews',
    tier: 'silver',
    icon: Star,
    evaluate: (s) => s.reviewCount >= 10,
    progress: (s) => [Math.min(s.reviewCount, 10), 10],
  },
  {
    id: 'reviewer_50',
    name: 'Connoisseur',
    description: 'Wrote 50 reviews',
    tier: 'gold',
    icon: Trophy,
    evaluate: (s) => s.reviewCount >= 50,
    progress: (s) => [Math.min(s.reviewCount, 50), 50],
  },
  {
    id: 'reviewer_100',
    name: 'Sommelier',
    description: 'Wrote 100 reviews',
    tier: 'platinum',
    icon: Crown,
    evaluate: (s) => s.reviewCount >= 100,
    progress: (s) => [Math.min(s.reviewCount, 100), 100],
  },

  // Brand exploration
  {
    id: 'brands_5',
    name: 'Open Mind',
    description: 'Reviewed drinks from 5 different brands',
    tier: 'bronze',
    icon: Compass,
    evaluate: (s) => s.uniqueBrands >= 5,
    progress: (s) => [Math.min(s.uniqueBrands, 5), 5],
  },
  {
    id: 'brands_15',
    name: 'Brand Hopper',
    description: 'Reviewed drinks from 15 different brands',
    tier: 'gold',
    icon: Rocket,
    evaluate: (s) => s.uniqueBrands >= 15,
    progress: (s) => [Math.min(s.uniqueBrands, 15), 15],
  },

  // Quality / generosity
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
    description: 'Average rating below 3.0 (10+ reviews)',
    tier: 'silver',
    icon: Target,
    evaluate: (s) => s.reviewCount >= 10 && s.avgRating < 3.0,
  },
  {
    id: 'generous',
    name: 'Glass Half Full',
    description: 'Average rating above 4.0 (10+ reviews)',
    tier: 'silver',
    icon: Heart,
    evaluate: (s) => s.reviewCount >= 10 && s.avgRating >= 4.0,
  },

  // Social pull
  {
    id: 'liked_25',
    name: 'Crowd Pleaser',
    description: 'Earned 25 likes across all reviews',
    tier: 'silver',
    icon: Heart,
    evaluate: (s) => s.totalLikesReceived >= 25,
    progress: (s) => [Math.min(s.totalLikesReceived, 25), 25],
  },
  {
    id: 'liked_100',
    name: 'Local Legend',
    description: 'Earned 100 likes across all reviews',
    tier: 'gold',
    icon: Flame,
    evaluate: (s) => s.totalLikesReceived >= 100,
    progress: (s) => [Math.min(s.totalLikesReceived, 100), 100],
  },
  {
    id: 'discussed',
    name: 'Sparked Discussion',
    description: 'Got 10 comments on your reviews',
    tier: 'silver',
    icon: MessageCircle,
    evaluate: (s) => s.totalCommentsReceived >= 10,
    progress: (s) => [Math.min(s.totalCommentsReceived, 10), 10],
  },
  {
    id: 'community_pick',
    name: 'Community Pick',
    description: '15 people tried a drink because of you',
    tier: 'gold',
    icon: Award,
    evaluate: (s) => s.totalTriedItReceived >= 15,
    progress: (s) => [Math.min(s.totalTriedItReceived, 15), 15],
  },

  // Network
  {
    id: 'first_follow',
    name: 'Friend Made',
    description: 'Got your first follower',
    tier: 'bronze',
    icon: Users,
    evaluate: (s) => s.followers >= 1,
  },
  {
    id: 'followers_10',
    name: 'Pull',
    description: '10 followers',
    tier: 'silver',
    icon: Users,
    evaluate: (s) => s.followers >= 10,
    progress: (s) => [Math.min(s.followers, 10), 10],
  },
  {
    id: 'followers_50',
    name: 'Influencer',
    description: '50 followers',
    tier: 'gold',
    icon: Medal,
    evaluate: (s) => s.followers >= 50,
    progress: (s) => [Math.min(s.followers, 50), 50],
  },

  // Tier lists
  {
    id: 'list_creator',
    name: 'Curator',
    description: 'Member of a shared tier list',
    tier: 'silver',
    icon: ListPlus,
    evaluate: (s) => s.tierListsAsMember >= 1,
  },
  {
    id: 'list_collector',
    name: 'Tastemaker',
    description: 'Member of 5 shared tier lists',
    tier: 'gold',
    icon: ListPlus,
    evaluate: (s) => s.tierListsAsMember >= 5,
    progress: (s) => [Math.min(s.tierListsAsMember, 5), 5],
  },

  // Activity
  {
    id: 'on_streak',
    name: 'On The Hunt',
    description: 'Posted a review in the last 7 days',
    tier: 'bronze',
    icon: Zap,
    evaluate: (s) => s.hasFreshReview,
  },

  // Identity
  {
    id: 'founder',
    name: 'Founder',
    description: 'One of the originals',
    tier: 'legendary',
    icon: Gem,
    evaluate: (s) => s.isFounder,
  },
  {
    id: 'beta_tester',
    name: 'Beta Tester',
    description: 'Helped shape Seltzer Social during the closed beta',
    tier: 'platinum',
    icon: Rocket,
    evaluate: (s) => s.isBetaTester,
  },
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
