// components/AchievementWatcher.tsx
//
// Mounted once in the root layout. Watches the signed-in user's achievement
// state and pops the celebration modal when they've newly earned one. The
// achievements system is stateless (recomputes the full earned set), so we
// diff against a localStorage "seen" record (see lib/achievementsSeen).
//
// Checks happen:
//   • ~1.5s after load (catches anything earned while away),
//   • on sign-in,
//   • whenever code dispatches `window.dispatchEvent(new Event('achievements:check'))`
//     — e.g. right after publishing a review.

'use client';

import { useEffect, useState } from 'react';
import { supabase, getAchievementStats } from '@/lib/supabase';
import { evaluateAchievements, ACHIEVEMENTS, Achievement } from '@/lib/achievements';
import { evaluateTrophies, TROPHIES, Trophy } from '@/lib/trophies';
import { FOUNDERS, BETA_TESTERS } from './FounderBadge';
import { pickNewlyUnlocked, pickNewlyEarnedTrophies } from '@/lib/achievementsSeen';
import { AchievementCelebration } from './AchievementCelebration';
import { TrophyCelebration } from './TrophyCelebration';

export function AchievementWatcher() {
  const [queue, setQueue] = useState<Achievement[]>([]);
  const [trophyQueue, setTrophyQueue] = useState<Trophy[]>([]);

  useEffect(() => {
    let cancelled = false;
    let running = false;

    async function check() {
      if (running) return;       // avoid overlapping heavy stat queries
      running = true;
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user) return;

        const { data: profile } = await supabase
          .from('users').select('username').eq('id', user.id).maybeSingle();
        const username = (profile as any)?.username ?? '';

        const stats = await getAchievementStats(
          user.id, FOUNDERS.has(username), BETA_TESTERS.has(username)
        );
        const { unlocked } = evaluateAchievements(stats);
        const unlockedIds = new Set(unlocked.map((a) => a.id));

        // Achievements first…
        const freshAchIds = pickNewlyUnlocked(user.id, [...unlockedIds]);
        if (!cancelled && freshAchIds.length) {
          const freshAch = freshAchIds
            .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
            .filter(Boolean) as Achievement[];
          if (freshAch.length) setQueue(freshAch);
        }

        // …then the rarer trophies (shown after the achievement queue clears).
        const { earned } = evaluateTrophies(stats, unlockedIds);
        const freshTrophyIds = pickNewlyEarnedTrophies(user.id, earned.map((t) => t.id));
        if (!cancelled && freshTrophyIds.length) {
          const freshTrophies = freshTrophyIds
            .map((id) => TROPHIES.find((t) => t.id === id))
            .filter(Boolean) as Trophy[];
          if (freshTrophies.length) setTrophyQueue(freshTrophies);
        }
      } catch {
        // Never let a stats hiccup surface to the user.
      } finally {
        running = false;
      }
    }

    const t = setTimeout(check, 1500);
    const onCheck = () => check();
    window.addEventListener('achievements:check', onCheck);
    const { data: authListener } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) check();
    });

    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener('achievements:check', onCheck);
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // Show achievements first; once that queue clears, the trophy celebration
  // (if any) takes over for the bigger moment.
  if (queue.length > 0) {
    return <AchievementCelebration achievements={queue} onClose={() => setQueue([])} />;
  }
  if (trophyQueue.length > 0) {
    return <TrophyCelebration trophies={trophyQueue} onClose={() => setTrophyQueue([])} />;
  }
  return null;
}
