import React, { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase/client';
import { resolveAvatarUrl } from '../resolveStoredPhotoUrl';

// A person's photo in Chats (the inbox, the chat header and the information
// column): fills its round wrapper, falls back to initials when there is no
// photo or it fails to load (never a broken-image icon).

/** The avatar's displayable URL: data and blob URLs as they are; storage keys resolved. */
export function resolveChatAvatarUrl(url?: string | null, client?: SupabaseClient | null): string | null {
  if (!url) return null;
  if (/^(data:|blob:)/i.test(url)) return url;
  try {
    const sb = client || (typeof window !== 'undefined' ? (getSupabaseClient()) : null);
    return resolveAvatarUrl(url, sb) || url;
  } catch {
    return url;
  }
}

/** Two initials for the fallback ('VA' without a name). */
export function avatarInitials(name: string): string {
  if (!name) return 'VA';
  const clean = name.replace(/[^\w\s]/gi, '').trim();
  if (!clean) return name.slice(0, 2).toUpperCase();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export default function ConversationAvatar({
  url,
  name,
  size = 46,
  className = 'avatar-fallback',
  fontSize = 14,
}: {
  url?: string | null;
  name: string;
  size?: number;
  className?: string;
  fontSize?: number;
}) {
  const [hasError, setHasError] = useState(false);

  const resolvedUrl = useMemo(() => {
    return resolveChatAvatarUrl(url);
  }, [url]);

  useEffect(() => {
    setHasError(false);
  }, [resolvedUrl]);

  const initials = useMemo(() => avatarInitials(name), [name]);

  if (resolvedUrl && !hasError) {
    return (
      <img
        src={resolvedUrl}
        alt={name}
        onError={() => setHasError(true)}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        background: '#24211e',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: `${fontSize}px`,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  );
}
