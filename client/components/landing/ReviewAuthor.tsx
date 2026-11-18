import React, { useState } from 'react';
import type { FeaturedReview } from '../../lib/reviews/varoomReviews';

// Who wrote a VaRoom review: their profile picture, or the first letter of
// their handle when they have none. Used on dark surfaces (the sign-in panel
// and the landing page's last page).

/** The author's round picture, 36 px, with no outline. */
export function ReviewAvatar({ review }: { review: FeaturedReview }) {
  const [failed, setFailed] = useState(false);
  if (review.authorAvatarUrl && !failed) {
    return (
      <img
        src={review.authorAvatarUrl}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initial = (review.authorUsername || review.authorName).replace(/^@+/, '').charAt(0).toUpperCase() || 'V';
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
      {initial}
    </span>
  );
}
