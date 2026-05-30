// lib/changelog.ts
// What's New — single source of truth for the in-app release notes.
//
// To add a new entry: prepend it to RELEASES (newest first). Bump
// CURRENT_VERSION to match. The "new release" indicator on the
// /whats-new link uses CURRENT_VERSION + a localStorage seen-key.

export type ChangeKind = 'new' | 'improved' | 'fixed';

export interface ChangeEntry {
  kind: ChangeKind;
  title: string;
  detail?: string;
}

export interface Release {
  version: string;
  date: string;          // ISO yyyy-mm-dd
  headline: string;      // one-liner mood for the release
  changes: ChangeEntry[];
}

export const CURRENT_VERSION = '0.17.0';

/** localStorage key for "last version the user opened the changelog at". */
export const SEEN_KEY = 'seltzer:last-seen-version';

/** Whether there's a release the user hasn't seen yet. Browser-safe. */
export function hasUnseenRelease(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SEEN_KEY) !== CURRENT_VERSION;
}

export const RELEASES: Release[] = [
  {
    version: '0.17.0',
    date: '2026-05-29',
    headline: 'Trophy Showroom + a shinier, more native app',
    changes: [
      {
        kind: 'new',
        title: 'Trophy Showroom',
        detail: 'Every profile now has a Trophy Showroom — a physical display cabinet where you drag your trophies onto glass shelves and arrange them however you like, then save. Visitors see your arrangement. Trophies are a small, rare set above achievements (only 8 to chase) across four rarities — earn them by reviewing, getting likes, building a following, being part of the community, and referring friends. Open it from any profile via the gold "Trophy Showroom" card.',
      },
      {
        kind: 'new',
        title: 'Community trophies',
        detail: 'Some trophies can only be earned by being part of the community — built around shared tier lists: subscribers to your lists (Curated for the Crowd, Beloved Curator), suggestions of yours approved onto other lists (Stamp of Approval), votes you cast (Voice of the People), and the Mythic Community Pillar for doing it all.',
      },
      {
        kind: 'new',
        title: 'Invite friends + referral trophies',
        detail: 'Settings → Invite friends gives you a personal link. Anyone who joins through it is credited to you — refer 1, 5, or 25 people to unlock the Recruiter, Ambassador, and Evangelist trophies.',
      },
      {
        kind: 'new',
        title: 'Unlock celebrations',
        detail: 'Earn an achievement or a trophy and you now get a confetti + badge-reveal moment (with a little haptic buzz on your phone) instead of it quietly appearing.',
      },
      {
        kind: 'improved',
        title: 'Haptic feedback',
        detail: 'The installed app now gives subtle haptic taps as you like a review, mark a drink tried, switch tabs, and place drinks in a tier — small touches that make it feel native.',
      },
      {
        kind: 'improved',
        title: 'A more polished, app-like feel',
        detail: 'A redesigned single-screen welcome, a heart-burst when you like, animated count-ups on profile and compare stats, and a glossier tier list — including a gold shimmer on the S-tier.',
      },
      {
        kind: 'fixed',
        title: 'Steadier bottom navigation',
        detail: 'The floating bottom nav no longer lags or jitters while you scroll on phones.',
      },
    ],
  },
  {
    version: '0.16.0',
    date: '2026-05-29',
    headline: 'Scan a barcode, and a safer community',
    changes: [
      {
        kind: 'new',
        title: 'Scan a barcode to find or add a drink',
        detail: 'On the Create screen, tap the scan button in the search box and point your camera at the barcode on a can or pack. If it\'s already in the catalog you jump straight to it; if it\'s new, we start an add for you and remember the barcode so the next person who scans it lands on the right drink instantly. (Barcode scanning runs on the installed app; in a browser it falls back to manual entry.)',
      },
      {
        kind: 'new',
        title: 'Report and block',
        detail: 'Every review, comment, and profile now has a "⋯" menu to report content or block someone. Block and you stop seeing their reviews and comments across your feeds. Reports go to a moderation queue our curators work through.',
      },
      {
        kind: 'new',
        title: 'Delete your account in the app',
        detail: 'Settings → Delete account permanently removes your profile, reviews, photos, and everything tied to your account. No email required — it\'s one confirm tap and it\'s gone.',
      },
      {
        kind: 'new',
        title: 'Privacy Policy & Terms',
        detail: 'Readable Privacy Policy and Terms (with our zero-tolerance policy for objectionable content) now live at /privacy and /terms, linked from Settings. New here? You\'ll agree to them once before diving in.',
      },
      {
        kind: 'fixed',
        title: 'Your profile photo actually sticks now',
        detail: 'A saved avatar could silently fail to persist while still looking uploaded — which made the "add a profile photo" tip keep coming back. Saving an avatar now confirms it landed, and tells you if something went wrong.',
      },
    ],
  },
  {
    version: '0.15.2',
    date: '2026-05-18',
    headline: 'Discover, now with tabs',
    changes: [
      {
        kind: 'improved',
        title: 'Two tabs on Discover',
        detail: 'Discover now splits into "People" and "Catalog" tabs. People searches users only; Catalog searches drinks, brands, and shared tier lists in one shot. Each tab shows a result count badge once you\'ve searched, and the search box placeholder changes to match the active tab.',
      },
      {
        kind: 'improved',
        title: 'Browse-brands shortcut moved into Catalog',
        detail: 'The "Browse brands" and "Trending" tiles now live inside the Catalog tab\'s empty state — they\'re still one tap away but no longer compete with people-search.',
      },
    ],
  },
  {
    version: '0.15.1',
    date: '2026-05-18',
    headline: 'Brand pages are now actually findable',
    changes: [
      {
        kind: 'new',
        title: '/brand index',
        detail: 'A browsable list of every brand in the catalog at /brand. Sortable by drink count, review count, or community avg rating, with a filter input. Reached from the new "Browse brands" tile on /discover.',
      },
      {
        kind: 'improved',
        title: 'Brand text is now clickable in more spots',
        detail: 'The brand label on a single review page, on profile review cards (both with and without a custom title), and the "Brands you reach for" chips on a profile — all now link to the brand hub.',
      },
      {
        kind: 'improved',
        title: 'Discover shows shortcut tiles',
        detail: '"Browse brands" and "Trending" tiles now appear above the search bar, so you can jump into either without typing anything.',
      },
    ],
  },
  {
    version: '0.15.0',
    date: '2026-05-18',
    headline: 'Brand pages, discovery, search, mentions, and more',
    changes: [
      {
        kind: 'new',
        title: 'Brand pages',
        detail: 'Tap any brand name anywhere in the app — review cards, drink pages, stats — to open a brand hub. See the full catalog, community top picks, and (if signed in) how many of the brand\'s drinks you\'ve explored.',
      },
      {
        kind: 'new',
        title: 'Discovery on an empty feed',
        detail: 'If your feed is dead (no follows yet, or nobody\'s posted), you\'ll now see a horizontal trending-drinks rail and suggested people to follow, with a one-tap Follow button.',
      },
      {
        kind: 'new',
        title: 'Pull to refresh everywhere',
        detail: 'Profile, drink pages, trending, and inbox now support pull-to-refresh — same rubber-band gesture as the feed.',
      },
      {
        kind: 'improved',
        title: 'Search drinks and brands from /discover',
        detail: 'The Discover search bar now matches drinks and brands in addition to people and tier lists. One box, four result types.',
      },
      {
        kind: 'new',
        title: 'Community photo gallery on drink pages',
        detail: 'Each canonical drink page now shows a 12-photo grid of community-uploaded review images, tap to view full-size.',
      },
      {
        kind: 'new',
        title: '@mentions in reviews',
        detail: 'Drop an @username inside a review body — it auto-links to that profile and sends them a notification.',
      },
      {
        kind: 'new',
        title: 'Tier-themed profile hero',
        detail: 'The profile header gradient and glow now match the user\'s top-rated drink tier. S-tier reviewers get amber; F-tier (sorry) gets coral.',
      },
      {
        kind: 'new',
        title: '"More from this brand" rail',
        detail: 'Drink pages now show a horizontal scroll of other drinks from the same brand, sorted by community popularity.',
      },
      {
        kind: 'improved',
        title: 'Open Graph previews for every shareable page',
        detail: 'Drink, brand, profile, review, and tier-list URLs now unfurl with rich previews in iMessage, Slack, Twitter, and Discord.',
      },
    ],
  },
  {
    version: '0.14.0',
    date: '2026-05-18',
    headline: 'Advanced stats + search inside a profile',
    changes: [
      {
        kind: 'new',
        title: 'Search a profile by brand or flavor',
        detail: 'Open any profile, hit the Reviews tab, and type a brand ("AHA") or a flavor ("Blackberry") to instantly filter that user\'s reviews. The search bar matches against brand, drink name, and review title.',
      },
      {
        kind: 'new',
        title: 'Detailed stats page',
        detail: 'Tap "Detailed stats" inside the Taste Profile card to open /profile/[username]/stats. You\'ll see catalog explored %, brand diversity, generosity vs. the platform average, last-30-day average, a 0.5-bucket rating distribution, and a per-brand explorer with % explored, your average, and a progress bar. Tap a brand to jump back to the profile with that brand pre-filtered.',
      },
      {
        kind: 'new',
        title: 'Brand superlatives',
        detail: 'A "Superlatives" card on the stats page highlights the brand you score highest, the brand you\'ve explored most thoroughly (as a % of its catalog), and the brand you reach for most often.',
      },
    ],
  },
  {
    version: '0.13.1',
    date: '2026-05-18',
    headline: 'Half-stars (and tenth-stars) for Tried It',
    changes: [
      {
        kind: 'improved',
        title: '"Tried It" supports 0.1 increments',
        detail: 'When you tap "Tried It?" on someone else\'s review, you can now drag along the row for half-step ratings or use the ± buttons for exact 0.1 nudges — same precision as creating a review.',
      },
    ],
  },
  {
    version: '0.13.0',
    date: '2026-05-10',
    headline: 'Curator tools, cleaner names, no more duplicates',
    changes: [
      {
        kind: 'new',
        title: 'Curator role for founders + beta testers',
        detail: 'Founders and beta testers can now replace any canonical drink image. On a drink page you\'ll see a small cyan upload button next to the can — tap it to upload a better photo. Every replacement is logged.',
      },
      {
        kind: 'new',
        title: 'Curator queue',
        detail: 'New /curator/queue page (linked from Settings for curators) lists every drink whose canonical image is flagged low-quality. Pick a user-uploaded review photo and one-tap promote it as the new cover, or upload your own.',
      },
      {
        kind: 'new',
        title: 'Tier list items link to drink page',
        detail: 'Tapping any drink in a shared tier list now opens its canonical drink page, where every reviewer\'s review of that drink is listed. Members still get a pencil-icon edit button on the right.',
      },
      {
        kind: 'improved',
        title: 'Average ratings on shared lists, properly',
        detail: 'When multiple members add the same drink to a tier list, the rating is now an average across contributors — and we shipped a one-shot migration that merges any pre-existing duplicates. A unique index prevents the duplicate from ever coming back.',
      },
      {
        kind: 'improved',
        title: 'Drink name standardization',
        detail: 'AHA\'s "Lime + Watermelon" became "Lime Watermelon" — and the rest of the catalog follows the same rule. Search now matches across phrasings. New drinks go through the same normalizer at submission.',
      },
      {
        kind: 'improved',
        title: 'Bigger drink-photo dataset',
        detail: 'Database expanded from 184 to 318 SKUs across 34 brands — added Trader Joe\'s, Good & Gather, 365 by Whole Foods, Member\'s Mark, Clear American, Sparkling Ice, Hint, Klarbrunn, Recess, Olipop, Zevia, Voss, Bai Bubbles, Phocus, Crystal Geyser, Saratoga, and Mountain Valley.',
      },
      {
        kind: 'improved',
        title: 'Tighter image crops',
        detail: 'Canonical drink images now fill the full 420×420 frame vertically instead of floating in whitespace.',
      },
    ],
  },
  {
    version: '0.12.0',
    date: '2026-05-09',
    headline: 'A real catalog, smarter invites, and laddered achievements',
    changes: [
      {
        kind: 'new',
        title: '184 canonical seltzers, pre-seeded',
        detail: 'Picking a drink to review now autocompletes from 17 brands across 184 SKUs (LaCroix, Bubly, Spindrift, Polar, Waterloo, San Pellegrino, Perrier, Topo Chico, Schweppes, Canada Dry, Liquid Death, Sanzo, Nixie, Hal\'s, AHA, Kirkland, Rambler). Most have a stock can image so you don\'t have to upload your own.',
      },
      {
        kind: 'new',
        title: 'Auto-fill the can image when you pick a drink',
        detail: 'When the autocomplete matches a canonical drink, its image preview snaps into the upload tile automatically. Skip the photo step or override it with your own.',
      },
      {
        kind: 'new',
        title: 'Copy a photo from a previous reviewer',
        detail: 'Reviewing the same drink someone else already shot? A horizontal strip of past reviewers\' photos now appears under the upload tile — tap to copy any one as your review image.',
      },
      {
        kind: 'new',
        title: 'Multi-member tier lists',
        detail: 'Owner-only "Add member" button on shared tier lists invites a third (or fourth, fifth…) editor with full edit access. They get an in-app invite to accept — no link copying.',
      },
      {
        kind: 'new',
        title: 'Invite a partner to a solo list later',
        detail: 'Created a solo list and now want to share it? The list menu has an "Invite a partner" option that promotes the picked user with the same invite-and-accept flow.',
      },
      {
        kind: 'new',
        title: 'Laddered achievements (30 total)',
        detail: 'Achievements now build on each other in tiers — bronze → silver → gold → platinum → legendary. New ladders for likes received (5/25/100/250/500), comments (1/10/50), tried-it (1/5/15/50), and follower milestones up to 1,000.',
      },
      {
        kind: 'new',
        title: 'Beta Tester badge',
        detail: 'Beta Tester is now a permanent purple identity badge instead of an achievement, matching the Founder badge style. Achievements stay earnable for everyone; badges mark special status.',
      },
      {
        kind: 'improved',
        title: 'Sticky back header on inner pages',
        detail: 'The Back button now stays pinned to the top of the screen when you scroll. No more hunting for it on long tier lists or review threads.',
      },
      {
        kind: 'improved',
        title: 'Showcase counts no longer count ghosts',
        detail: 'If you had old achievement IDs pinned that we\'ve since renamed, the picker now strips them and frees up your pin slots automatically the next time you open your achievements page.',
      },
      {
        kind: 'fixed',
        title: 'Founder achievement removed from the catalog',
        detail: 'Founder is now exclusively a badge (the gold checkmark). Same for Beta Tester. Achievements you can grind, badges you can\'t.',
      },
    ],
  },
  {
    version: '0.11.0',
    date: '2026-05-06',
    headline: 'Tier lists, smarter together',
    changes: [
      {
        kind: 'new',
        title: 'Shared ratings average automatically',
        detail: 'When two members add the same drink to a tier list, ratings now average across contributors instead of overwriting. Detailed view shows "avg of 2" inline so you know it\'s a group score.',
      },
      {
        kind: 'new',
        title: 'Tier list invitations',
        detail: 'You can\'t pull a friend into a shared tier list without their consent anymore. New lists with a partner start as a "pending invite". The partner gets a notification, sees an Accept / Decline banner on the list page, and the list only goes public once accepted.',
      },
      {
        kind: 'new',
        title: 'What\'s New page',
        detail: 'See every release and what changed at /whats-new (also linked from Settings). A small dot on the link tells you when there\'s something new since you last looked.',
      },
      {
        kind: 'fixed',
        title: 'Suggesting from a new review no longer triggers a vote',
        detail: 'When you publish a review and tap a tier list to add it, the drink now goes straight in for member lists — no awkward "waiting for partner to vote" detour.',
      },
    ],
  },
  {
    version: '0.10.0',
    date: '2026-05-06',
    headline: 'Reviews you can actually edit',
    changes: [
      {
        kind: 'new',
        title: 'Change the drink on a review',
        detail: 'On the edit screen there\'s now a Drink section with a search-or-add picker. Tap "Change" to swap a review onto a different canonical seltzer without rewriting it.',
      },
      {
        kind: 'improved',
        title: '0.1-precision rating on mobile',
        detail: 'Tap a star for a whole number, slide your thumb along the row to fine-tune, or use the ± buttons for exact 0.1 steps. The number input also opens the decimal keypad on iOS now.',
      },
      {
        kind: 'improved',
        title: 'Bigger star tap targets',
        detail: 'Stars in the rating input are 4–8px larger across all sizes. Easier to hit one-handed.',
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-05-05',
    headline: 'Install Seltzer Social on your home screen',
    changes: [
      {
        kind: 'new',
        title: 'Progressive Web App',
        detail: 'You can now install Seltzer Social directly from the browser. Android shows a one-tap "Install" prompt; iOS Safari shows step-by-step instructions. Launches fullscreen, no browser chrome, your own home-screen icon.',
      },
      {
        kind: 'new',
        title: 'Custom app icon + splash',
        detail: 'A cyan-gradient droplet icon shows up on your home screen, and the app launches with a matching dark-navy splash to feel native.',
      },
      {
        kind: 'improved',
        title: 'Friendly install nudge',
        detail: 'A subtle prompt slides up above the bottom nav on first visit. Dismiss it and we won\'t bother you for 14 days.',
      },
      {
        kind: 'improved',
        title: 'Offline fallback',
        detail: 'Lose connection mid-scroll? You\'ll get a small "you\'re offline" page instead of a browser error.',
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-05-05',
    headline: 'Discover, share, and earn',
    changes: [
      {
        kind: 'new',
        title: 'Discover page',
        detail: 'Trending drinks, highest-rated, active tier lists, and top reviewers — all on /discover. Linked from Search.',
      },
      {
        kind: 'new',
        title: 'Public drink pages',
        detail: 'Every canonical drink has its own page with the community tier letter, average rating, total reviews, and every review of that drink.',
      },
      {
        kind: 'new',
        title: 'Share cards',
        detail: 'Reviews and tier lists now generate beautiful preview images automatically. Paste a link in iMessage / Discord / Twitter and a rich card pops with the can photo, rating, and quote.',
      },
      {
        kind: 'new',
        title: 'Tier list invite links',
        detail: 'Share button on every tier list. Native share sheet on mobile, copy-to-clipboard on desktop. Friends land on the list and can subscribe in one tap.',
      },
      {
        kind: 'new',
        title: 'Achievements + dog tags',
        detail: '20 badges across bronze → legendary tiers. Unlock by reviewing, exploring brands, getting likes, building tier lists. Pin up to 3 to your profile as Battlefield-style "honors".',
      },
      {
        kind: 'new',
        title: 'Beta Tester badge',
        detail: 'A platinum achievement automatically granted to early beta testers. Pin it to flex.',
      },
      {
        kind: 'new',
        title: 'Comment replies',
        detail: 'Reply to any comment with one tap. Replies thread under their parent. The original commenter gets a notification.',
      },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-05-05',
    headline: 'Reviews come alive',
    changes: [
      {
        kind: 'new',
        title: 'Edit your reviews',
        detail: 'Pencil icon on your own review opens a full editor — change the title, rating, text, or re-upload a new can photo. Delete is in there too.',
      },
      {
        kind: 'new',
        title: 'Community Score callout',
        detail: 'When someone "tries" a drink you reviewed, a community-score card now appears on the review with the average plus a visual "+0.4 above your rating" comparison.',
      },
      {
        kind: 'new',
        title: 'Comment count indicator',
        detail: 'Like the like-count, the comment button now shows the number whenever a review has any comments.',
      },
      {
        kind: 'new',
        title: 'Half-star precision',
        detail: 'Stars now show 4.5 as four full stars + one half — no more 4.8 displaying as 4 stars flat.',
      },
      {
        kind: 'new',
        title: '"Read more" on long reviews',
        detail: 'Long reviews on the feed clamp to 5 lines with a Read more toggle. No need to click into the review just to see the rest.',
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-05-05',
    headline: 'A feed that feels alive',
    changes: [
      {
        kind: 'new',
        title: 'Way more notifications',
        detail: 'Likes, comments, follows, "tried it" ratings, and replies all hit your inbox now. Each gets a distinct icon and color.',
      },
      {
        kind: 'new',
        title: 'Sticky day headers',
        detail: 'The Today / Yesterday / This week / Earlier headers now stick to the top of the viewport with a frosted-glass blur as you scroll. Adds a real Twitter / Instagram cadence.',
      },
      {
        kind: 'new',
        title: 'Auto-refresh on focus',
        detail: 'Switch back to the tab after lunch and the feed silently re-fetches. Throttled to every 30 seconds so it never hammers the database.',
      },
      {
        kind: 'new',
        title: 'Taste Profile on profiles',
        detail: 'Computed from your review history: critic style (Generous → Harsh), opinion spread, brand loyalty %, sweet-spot tier, plus a tier distribution histogram and best/worst brands.',
      },
      {
        kind: 'fixed',
        title: 'Notifications were silently failing',
        detail: 'Supabase JS v2 lazy queries needed an explicit .then() — fixed. Inserts actually fire now.',
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-05-04',
    headline: 'Profile + onboarding glow-up',
    changes: [
      {
        kind: 'new',
        title: 'Onboarding flow',
        detail: 'New users get a 3-step welcome — pick a few people to follow, then choose to write your first review or start a tier list.',
      },
      {
        kind: 'new',
        title: 'Compare with @user',
        detail: 'On any other profile, tap Compare to see a side-by-side of every drink you\'ve both reviewed. Big "taste agreement %" headline plus per-drink delta bars.',
      },
      {
        kind: 'new',
        title: 'Profile redesign',
        detail: 'Bigger avatar, cleaner stats grid (Reviews / Lists / Followers / Following), top-rated review highlight, top brands strip.',
      },
      {
        kind: 'new',
        title: 'Pull-to-refresh on feed',
        detail: 'Drag the feed down past the threshold and release — silent reload, spring-back animation.',
      },
      {
        kind: 'improved',
        title: 'Avatar upload',
        detail: 'Image now stages as a preview with a cyan ring before commit. Save to confirm, ✕ to discard. Replaces the old jarring instant-upload behavior.',
      },
      {
        kind: 'improved',
        title: 'Toast notifications',
        detail: 'Glassy slide-down toasts replaced inline error banners and silent successes across the app.',
      },
      {
        kind: 'improved',
        title: 'Skeleton loaders',
        detail: 'Feed shows shimmering placeholder cards instead of an empty page while loading.',
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-05-04',
    headline: 'Reviews are about a drink, not just a string',
    changes: [
      {
        kind: 'new',
        title: 'Canonical drinks',
        detail: 'Every drink lives in a shared catalog now. When you write a review, you pick the drink from that catalog (or add it once for everyone). No more "Polar Mango" vs "polar mango" duplicates.',
      },
      {
        kind: 'new',
        title: 'Optional review titles',
        detail: 'Reviews can have a free-text title separate from the drink — write "Ultimate summer drink" while keeping the canonical drink as "Polar · Mango Lime".',
      },
      {
        kind: 'new',
        title: 'Username chooser flow',
        detail: 'Real-time availability check, validation rules, reserved-name protection, and a fallback chooser screen for OAuth users.',
      },
      {
        kind: 'new',
        title: 'Email confirmation flow',
        detail: 'After signup you land on a "check your email" screen with a resend button. Confirmation links route to a dedicated /auth/callback page.',
      },
      {
        kind: 'improved',
        title: 'Mobile optimizations',
        detail: 'Proper viewport meta, safe-area insets so the bottom nav floats above iPhone\'s home indicator, 16px input font-size to stop iOS zoom-on-focus, dynamic viewport height fixes.',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-05-04',
    headline: 'Tier lists, redone',
    changes: [
      {
        kind: 'new',
        title: 'Direct edit for list members',
        detail: 'You + your partner can now add/edit/delete drinks instantly — no suggestion + vote loop for your own list. Suggestions and voting kick in only for non-members.',
      },
      {
        kind: 'new',
        title: 'Bulk add from your reviews',
        detail: 'Multi-select your existing reviews to seed a tier list in one shot. Auto-tiered from rating, deduped by review.',
      },
      {
        kind: 'new',
        title: 'Search + collapse + compact view',
        detail: 'Top search bar filters across all tiers, each tier letter is tappable to collapse, and the default view is a dense thumbnail grid that scales to hundreds of drinks.',
      },
      {
        kind: 'new',
        title: 'Delete a tier list',
        detail: 'Three-dot menu in the header → Delete this list. Confirmation modal requires you to type the list name to proceed.',
      },
      {
        kind: 'fixed',
        title: 'Removing a drink actually works now',
        detail: 'The original migration was missing UPDATE/DELETE RLS policies, so edits silently no-op\'d. Added the policies + surfaced an explicit error message when they\'re missing.',
      },
      {
        kind: 'fixed',
        title: 'Suggestion voting was stuck',
        detail: 'The majority threshold required both members to vote approve. Now the suggester is excluded from the count, so the partner\'s single vote is decisive on a 2-person list.',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-05-03',
    headline: 'Inbox + founder badges',
    changes: [
      {
        kind: 'new',
        title: 'Inbox',
        detail: 'Suggestions, mentions, and other notifications moved out of the feed and into a dedicated inbox tab with read/unread states.',
      },
      {
        kind: 'new',
        title: 'Founder badge',
        detail: 'Tiny gold checkmark next to founder usernames — visible on review cards, comments, profile, and tier list activity.',
      },
      {
        kind: 'new',
        title: '@mentions in comments',
        detail: 'Type @username and the comment turns it into a clickable link. The mentioned user gets a notification.',
      },
      {
        kind: 'new',
        title: 'Animated bubble loader',
        detail: 'Replaced "Loading…" text with a small fizzing-bubbles animation that fits the brand.',
      },
    ],
  },
];
