export interface User {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  /** IDs of pinned achievements (Battlefield-style dog tags). Up to 3. */
  showcase_achievements?: string[] | null;
  created_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  /** Free-text review title — falls back to seltzer_name when empty */
  title: string | null;
  /** Canonical drink reference */
  seltzer_id: string | null;
  /** Denormalised drink name (kept in sync with the canonical seltzer) */
  seltzer_name: string;
  /** Denormalised brand (kept in sync with the canonical seltzer) */
  brand: string | null;
  rating: number;
  content: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  user?: User;
  seltzer?: Seltzer;
  stats?: ReviewStats;
}

export interface Seltzer {
  id: string;
  name: string;
  brand: string;
  image_url: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface ReviewStats {
  like_count: number;
  comment_count: number;
  repost_count: number;
  tried_it_count: number;
  avg_tried_it_rating: number;
}

export interface Like {
  id: string;
  user_id: string;
  review_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  review_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  user?: User;
}

export interface Repost {
  id: string;
  user_id: string;
  review_id: string;
  created_at: string;
}

export interface TriedIt {
  id: string;
  user_id: string;
  review_id: string;
  rating: number;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface SharedTierList {
  id: string;
  name: string;
  owner_id: string;
  partner_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  owner?: User;
  partner?: User;
}

export interface SharedTierListItem {
  id: string;
  list_id: string;
  added_by: string;
  seltzer_id: string | null;
  seltzer_name: string;
  brand: string | null;
  rating: number;
  tier: string;
  note: string | null;
  review_id: string | null;
  created_at: string;
  list?: SharedTierList;
  added_by_user?: User;
  review?: { id: string; image_url: string | null; user_id: string; user?: User };
}

export interface SharedTierListSuggestion {
  id: string;
  list_id: string;
  created_by: string;
  action: 'add' | 'move' | 'remove' | 'edit';
  seltzer_id: string | null;
  seltzer_name: string;
  brand: string | null;
  proposed_rating: number;
  proposed_tier: string;
  proposed_note: string | null;
  review_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  resolved_at: string | null;
  created_at: string;
  list?: SharedTierList;
  created_by_user?: User;
  votes?: SharedTierListVote[];
  trials?: SharedTierListSuggestionTrial[];
  review?: { id: string; image_url: string | null };
}

export interface SharedTierListVote {
  id: string;
  suggestion_id: string;
  user_id: string;
  vote: 'approve' | 'reject';
  created_at: string;
}

export interface SharedTierListSuggestionTrial {
  id: string;
  suggestion_id: string;
  user_id: string;
  rating: number;
  created_at: string;
}

export type NotificationType =
  | 'suggestion'
  | 'suggestion_approved'
  | 'suggestion_rejected'
  | 'mention'
  | 'like'
  | 'comment'
  | 'follow'
  | 'tried_it'
  | 'reply';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}
