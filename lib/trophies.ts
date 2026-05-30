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
  Trophy as TrophyIcon, Compass, Heart, Sparkles, Crown, Medal, Award, Gem,
  Target, ListChecks, Users, Vote, CheckCheck, HeartHandshake, UserPlus, Megaphone,
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
  evaluate: (s: AchievementStats, unlockedIds: Set<string>) => boolean;
  /** Optional progress getter — returns [current, target]. */
  progress?: (s: AchievementStats, unlockedIds: Set<string>) => [number, number];
}

const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

// How many of a set of boolean conditions are met — for combo trophies.
function countMet(conds: boolean[]): number {
  return conds.filter(Boolean).length;
}

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
  {
    id: 'tastemaker',
    name: 'Tastemaker',
    tagline: 'People drink what you say.',
    description: '50 people tried a drink because of you',
    rarity: 'epic',
    icon: Sparkles,
    evaluate: (s) => s.totalTriedItReceived >= 50,
    progress: (s) => [Math.min(s.totalTriedItReceived, 50), 50],
  },
  {
    id: 'cult_leader',
    name: 'Cult Leader',
    tagline: 'A thousand strong.',
    description: 'Reach 1,000 followers',
    rarity: 'mythic',
    icon: Crown,
    evaluate: (s) => s.followers >= 1000,
    progress: (s) => [Math.min(s.followers, 1000), 1000],
  },
  {
    id: 'master_curator',
    name: 'Master Curator',
    tagline: 'Rankings are your art form.',
    description: 'Be a member of 5 shared tier lists',
    rarity: 'epic',
    icon: ListChecks,
    evaluate: (s) => s.tierListsAsMember >= 5,
    progress: (s) => [Math.min(s.tierListsAsMember, 5), 5],
  },
  {
    id: 'triple_threat',
    name: 'Triple Threat',
    tagline: 'Prolific, beloved, and followed.',
    description: '50+ reviews, 100+ likes, and 50+ followers',
    rarity: 'legendary',
    icon: Medal,
    evaluate: (s) => s.reviewCount >= 50 && s.totalLikesReceived >= 100 && s.followers >= 50,
    progress: (s) => [countMet([s.reviewCount >= 50, s.totalLikesReceived >= 100, s.followers >= 50]), 3],
  },
  {
    id: 'the_skeptic',
    name: 'The Skeptic',
    tagline: 'Hard to impress. Impossible to fool.',
    description: '25+ reviews with an average rating of 2.5 or lower',
    rarity: 'epic',
    icon: Target,
    evaluate: (s) => s.reviewCount >= 25 && s.avgRating <= 2.5,
    // Progress toward the review-count gate; the average condition is noted in the description.
    progress: (s) => [Math.min(s.reviewCount, 25), 25],
  },
  {
    id: 'decorated',
    name: 'Decorated',
    tagline: 'A wall of honors.',
    description: 'Unlock 15 achievements',
    rarity: 'legendary',
    icon: Award,
    evaluate: (_s, ids) => ids.size >= 15,
    progress: (_s, ids) => [Math.min(ids.size, 15), 15],
  },
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

  // ─── Community trophies — earned only by being part of the community ───
  // (built around shared tier lists: subscribers to your lists, suggestions of
  // yours approved onto others' lists, and votes you cast.)
  {
    id: 'curated_for_crowd',
    name: 'Curated for the Crowd',
    tagline: 'People follow your rankings.',
    description: 'Your shared tier lists reached 25 subscribers',
    rarity: 'epic',
    icon: Users,
    evaluate: (s) => s.tierListSubscribers >= 25,
    progress: (s) => [Math.min(s.tierListSubscribers, 25), 25],
  },
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
    id: 'voice_of_people',
    name: 'Voice of the People',
    tagline: 'You show up and weigh in.',
    description: 'Cast 25 votes on tier-list suggestions',
    rarity: 'rare',
    icon: Vote,
    evaluate: (s) => s.tierListVotesCast >= 25,
    progress: (s) => [Math.min(s.tierListVotesCast, 25), 25],
  },
  {
    id: 'stamp_of_approval',
    name: 'Stamp of Approval',
    tagline: 'Your picks make the cut.',
    description: 'Get 10 of your suggestions approved onto lists',
    rarity: 'epic',
    icon: CheckCheck,
    evaluate: (s) => s.approvedSuggestions >= 10,
    progress: (s) => [Math.min(s.approvedSuggestions, 10), 10],
  },
  {
    id: 'community_pillar',
    name: 'Community Pillar',
    tagline: 'The community runs through you.',
    description: '50+ list subscribers, 15+ approved suggestions, and 5+ tier lists',
    rarity: 'mythic',
    icon: Crown,
    evaluate: (s) => s.tierListSubscribers >= 50 && s.approvedSuggestions >= 15 && s.tierListsAsMember >= 5,
    progress: (s) => [
      countMet([s.tierListSubscribers >= 50, s.approvedSuggestions >= 15, s.tierListsAsMember >= 5]),
      3,
    ],
  },

  // ─── Referral trophies — grow the community ───
  {
    id: 'recruiter',
    name: 'Recruiter',
    tagline: 'You brought someone in.',
    description: 'Refer 1 person who joins Seltzer Social',
    rarity: 'rare',
    icon: UserPlus,
    evaluate: (s) => s.referralsMade >= 1,
    progress: (s) => [Math.min(s.referralsMade, 1), 1],
  },
  {
    id: 'ambassador',
    name: 'Ambassador',
    tagline: 'You’re spreading the fizz.',
    description: 'Refer 5 people who join',
    rarity: 'epic',
    icon: Megaphone,
    evaluate: (s) => s.referralsMade >= 5,
    progress: (s) => [Math.min(s.referralsMade, 5), 5],
  },
  {
    id: 'evangelist',
    name: 'Evangelist',
    tagline: 'A one-person growth engine.',
    description: 'Refer 25 people who join',
    rarity: 'legendary',
    icon: Crown,
    evaluate: (s) => s.referralsMade >= 25,
    progress: (s) => [Math.min(s.referralsMade, 25), 25],
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
