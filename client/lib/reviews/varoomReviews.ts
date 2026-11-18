import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAvatarUrl } from '../../components/resolveStoredPhotoUrl';

// Reviews of VaRoom itself (table public.varoom_reviews). A signed-in person
// rates VaRoom from Help & Support; an admin approves reviews before one is
// shown. The landing page (sign-in panel and last page) shows the approved
// ones in turn, newest first.

export const COMMENT_MAX = 600;

/** What the sign-in panel shows: no account ids. */
export interface FeaturedReview {
  rating: number;
  comment: string;
  authorName: string;
  authorRole: 'host' | 'client';
  /** Without the @; null for a private profile or before migration 000072. */
  authorUsername: string | null;
  /** A ready-to-use picture URL, or null when there is none to show. */
  authorAvatarUrl: string | null;
}

export type ReviewStatus = 'pending' | 'approved' | 'hidden';

/** The signed-in person's own review. */
export interface MyReview {
  rating: number;
  comment: string;
  status: ReviewStatus;
}

type Client = Pick<SupabaseClient, 'from' | 'rpc'>;

interface FeaturedRow {
  rating: number;
  comment: string;
  author_name: string;
  author_role: string;
  author_username?: string | null;
  author_avatar_url?: string | null;
}

/** How many approved reviews the landing page takes, newest first. */
export const FEATURED_REVIEWS_MAX = 10;

type ReviewClient = Pick<SupabaseClient, 'rpc' | 'storage'>;

function toFeaturedReview(row: FeaturedRow | null | undefined, client: ReviewClient): FeaturedReview | null {
  if (!row || !row.comment || !(row.rating >= 1 && row.rating <= 5)) return null;
  return {
    rating: Math.round(row.rating),
    comment: row.comment,
    authorName: row.author_name || 'VaRoom member',
    authorRole: row.author_role === 'host' ? 'host' : 'client',
    authorUsername: row.author_username?.trim().replace(/^@+/, '') || null,
    authorAvatarUrl: resolveAvatarUrl(row.author_avatar_url?.trim() || null, client),
  };
}

/**
 * The approved reviews the landing page shows (the sign-in panel and the last
 * page), newest first: an empty list when none is approved yet, or on any
 * error. Before migration 000076 adds varoom_featured_reviews, the single
 * newest review still comes through varoom_featured_review.
 */
export async function fetchFeaturedReviews(client: ReviewClient): Promise<FeaturedReview[]> {
  const many = await client.rpc('varoom_featured_reviews', { p_limit: FEATURED_REVIEWS_MAX });
  let rows: unknown = many.data;
  if (many.error) {
    const one = await client.rpc('varoom_featured_review');
    if (one.error) {
      console.warn('VaRoom reviews unavailable', one.error.message);
      return [];
    }
    rows = one.data;
  }
  const list = (Array.isArray(rows) ? rows : rows ? [rows] : []) as FeaturedRow[];
  return list
    .map((row) => toFeaturedReview(row, client))
    .filter((review): review is FeaturedReview => review !== null)
    .slice(0, FEATURED_REVIEWS_MAX);
}

/** "@susan" when the author has a public username, otherwise their short name ("Susan W."). */
export const reviewAuthorHandle = (review: Pick<FeaturedReview, 'authorName' | 'authorUsername'>): string => (
  review.authorUsername ? `@${review.authorUsername}` : review.authorName
);

/** The signed-in person's review, or null when they have not rated VaRoom. Throws on error. */
export async function fetchMyReview(client: Client, userId: string): Promise<MyReview | null> {
  const { data, error } = await client
    .from('varoom_reviews')
    .select('rating,comment,status')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { rating: data.rating, comment: data.comment || '', status: data.status as ReviewStatus } : null;
}

/** The problem with a rating before it is sent, or null. */
export function reviewProblem(rating: number, comment: string): string | null {
  if (!(rating >= 1 && rating <= 5)) return 'Choose a rating from 1 to 5 stars.';
  if (comment.trim().length > COMMENT_MAX) return `Keep your review under ${COMMENT_MAX} characters.`;
  return null;
}

/**
 * Adds or updates the person's review. The database fills in their name and
 * role and sends the review (back) for approval. Throws a message to show.
 */
export async function saveMyReview(client: Client, userId: string, rating: number, comment: string): Promise<MyReview> {
  const problem = reviewProblem(rating, comment);
  if (problem) throw new Error(problem);
  const { data, error } = await client
    .from('varoom_reviews')
    .upsert({ user_id: userId, rating, comment: comment.trim() }, { onConflict: 'user_id' })
    .select('rating,comment,status')
    .single();
  if (error) throw new Error('Your review could not be saved. Please try again.');
  return { rating: data.rating, comment: data.comment || '', status: data.status as ReviewStatus };
}

/** "Host on VaRoom" / "Guest on VaRoom". */
export const authorRoleLabel = (role: FeaturedReview['authorRole']): string => (role === 'host' ? 'Host on VaRoom' : 'Guest on VaRoom');
