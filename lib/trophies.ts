// lib/trophies.ts
//
// Trophies are the prestige layer above achievements ("dog tags"). Where
// achievements are milestone ladders you collect steadily, trophies are RARE
// capstones — high single-stat bars, multi-condition combos, personality
// awards, and collection capstones. They're computed deterministically from the
// same AchievementStats (plus the set of unlocked achievement ids), so anyone
// can view anyone's showroom with zero extra backend.
//
// To add a trophy: append to TROPHIES with a unique id, rarity, icon, and an
// evaluate(stats, unlockedIds) returning true when earned.

import {
  Trophy as TrophyIcon, Compass, Heart, HeartHandshake, Award, Megaphone, Gem, Rocket,
  type LucideIcon,
} from 'lucide-react';
import { AchievementStats, ACHIEVEMENTS } from './achievements';

export type TrophyRarity = 'rare' | 'epic' | 'legendary' | 'mythic';

// Rarity controls the shine: color, glow strength, and the metallic gradient
// stops used by the Trophy component. Mythic gets a multi-stop iridescent sweep.
export const RARITY_META: Record<TrophyRarity, {
  label: string;
  color: string;
  glow: number;
  gradient: string[];
}> = {
  rare:      { label: 'Rare',      color: '#38bdf8', glow: 0.5,  gradient: ['#7dd3fc', '#0ea5e9'] },
  epic:      { label: 'Epic',      color: '#a78bfa', glow: 0.65, gradient: ['#c4b5fd', '#7c3aed'] },
  legendary: { label: 'Legendary', color: '#f4c430', glow: 0.8,  gradient: ['#fde68a', '#f59e0b'] },
  mythic:    { label: 'Mythic',    color: '#fb7185', glow: 1,    gradient: ['#22d3ee', '#a78bfa', '#fb7185'] },
};

// Rarity sort weight (rarest first) for the showroom layout.
export const RARITY_ORDER: TrophyRarity[] = ['mythic', 'legendary', 'epic', 'rare'];

export interface Trophy {
  id: string;
  name: string;
  tagline: string;          // short flavor line
  description: string;      // how it's earned
  rarity: TrophyRarity;
  icon: LucideIcon;
  /** Marks a one-of-a-kind prestige trophy — gets extra shine + sparkles. */
  special?: boolean;
  evaluate: (s: AchievementStats, unlockedIds: Set<string>) => boolean;
  /** Optional progress getter — returns [current, target]. */
  progress?: (s: AchievementStats, unlockedIds: Set<string>) => [number, number];
}

const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

// How many of a set of boolean conditions are met — for combo trophies.
function countMet(conds: boolean[]): number {
  return conds.filter(Boolean).length;
}

// A deliberately small, iconic set — trophies should feel rare and special,
// not be a second achievements grid. Eight total, spread across rarities and
// across solo / community / referral paths.
export const TROPHIES: Trophy[] = [
  {
    id: 'centurion',
    name: 'Centurion',
    tagline: 'A hundred verdicts in.',
    description: 'Write 100 reviews',
    rarity: 'rare',
    icon: TrophyIcon,
    evaluate: (s) => s.reviewCount >= 100,
    progress: (s) => [Math.min(s.reviewCount, 100), 100],
  },
  {
    id: 'cartographer',
    name: 'Flavor Cartographer',
    tagline: 'You’ve mapped the whole shelf.',
    description: 'Review 25 different brands',
    rarity: 'epic',
    icon: Compass,
    evaluate: (s) => s.uniqueBrands >= 25,
    progress: (s) => [Math.min(s.uniqueBrands, 25), 25],
  },
  {
    id: 'peoples_champion',
    name: 'People’s Champion',
    tagline: 'The crowd has spoken.',
    description: 'Earn 500 likes across your reviews',
    rarity: 'legendary',
    icon: Heart,
    evaluate: (s) => s.totalLikesReceived >= 500,
    progress: (s) => [Math.min(s.totalLikesReceived, 500), 500],
  },
  // The one-of-a-kind pre-release trophy — every founder and beta tester gets
  // the exact same trophy for being here before launch. Extra shine + sparkles.
  {
    id: 'pioneer',
    name: 'Pioneer',
    tagline: 'Here before the fizz settled.',
    description: 'Joined as a founder or beta tester in the pre-release era',
    rarity: 'mythic',
    icon: Rocket,
    special: true,
    evaluate: (s) => s.isFounder || s.isBetaTester,
  },

  // Community — only earned by being part of the community (shared tier lists).
  {
    id: 'beloved_curator',
    name: 'Beloved Curator',
    tagline: 'Your lists are a community fixture.',
    description: 'Your shared tier lists reached 100 subscribers',
    rarity: 'legendary',
    icon: HeartHandshake,
    evaluate: (s) => s.tierListSubscribers >= 100,
    progress: (s) => [Math.min(s.tierListSubscribers, 100), 100],
  },
  {
    id: 'community_pillar',
    name: 'Community Pillar',
    tagline: 'The community runs through you.',
    description: '50+ list subscribers, 15+ approved suggestions, and 5+ tier lists',
    rarity: 'mythic',
    icon: Award,
    evaluate: (s) => s.tierListSubscribers >= 50 && s.approvedSuggestions >= 15 && s.tierListsAsMember >= 5,
    progress: (s) => [
      countMet([s.tierListSubscribers >= 50, s.approvedSuggestions >= 15, s.tierListsAsMember >= 5]),
      3,
    ],
  },

  // Referral — grow the community.
  {
    id: 'ambassador',
    name: 'Ambassador',
    tagline: 'You’re spreading the fizz.',
    description: 'Refer 5 people who join Seltzer Social',
    rarity: 'epic',
    icon: Megaphone,
    evaluate: (s) => s.referralsMade >= 5,
    progress: (s) => [Math.min(s.referralsMade, 5), 5],
  },

  // Collection capstone — the rarest of all.
  {
    id: 'completionist',
    name: 'The Completionist',
    tagline: 'Nothing left to earn.',
    description: 'Unlock every achievement',
    rarity: 'mythic',
    icon: Gem,
    evaluate: (_s, ids) => ids.size >= TOTAL_ACHIEVEMENTS,
    progress: (_s, ids) => [Math.min(ids.size, TOTAL_ACHIEVEMENTS), TOTAL_ACHIEVEMENTS],
  },
];

/** Returns earned trophies + locked-with-progress, given stats + unlocked achievement ids. */
export function evaluateTrophies(stats: AchievementStats, unlockedIds: Set<string>) {
  const earned: Trophy[] = [];
  const locked: Trophy[] = [];
  for (const t of TROPHIES) {
    if (t.evaluate(stats, unlockedIds)) earned.push(t);
    else locked.push(t);
  }
  return { earned, locked };
}
