export interface User {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  seltzer_name: string;
  brand: string | null;
  rating: number;
  content: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  user?: User;
  stats?: ReviewStats;
}

export interface Seltzer {
  id: string;
  name: string;
  brand: string;
  image_url: string | null;
  flavor_notes: string | null;
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
  seltzer_name: string;
  brand: string | null;
  rating: number;
  tier: string;
  note: string | null;
  created_at: string;
  list?: SharedTierList;
  added_by_user?: User;
}

export interface SharedTierListSuggestion {
  id: string;
  list_id: string;
  created_by: string;
  action: 'add' | 'move' | 'remove' | 'edit';
  seltzer_name: string;
  brand: string | null;
  proposed_rating: number;
  proposed_tier: string;
  proposed_note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  resolved_at: string | null;
  created_at: string;
  list?: SharedTierList;
  created_by_user?: User;
  votes?: SharedTierListVote[];
  trials?: SharedTierListSuggestionTrial[];
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
