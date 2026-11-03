import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import chatCache, {
  ChatConversation,
  ChatMessage,
  ChatAttachment,
  ChatListingSummary,
  getInbox,
  setInbox,
  syncInbox,
  getMessages,
  setMessages,
  syncConversationMessages,
  appendMessage,
  updateInboxConversation,
  clearUser,
} from '../lib/chatCache';
import ChatComposerActions from '../components/ChatComposerActions';
import ElieComposerBeam from '../components/ElieComposerBeam';
import ElieIcon from '../components/ElieIcon';
import { hasMessageMarkup, messagePlainText, parseMessageBody, type MessageBodyNode } from '../lib/chat/messageBody';
import MessageActionMenu, { messageActionItems, type MessageAction } from '../components/chat/MessageActionMenu';
import { AttachmentThumb, ImagePreview, ListingCard, PhotoBubble, VoiceCard } from '../components/chat/MessageMedia';
import { messageMetaText } from '../lib/chat/chatMedia';
import ShareListingSheet from '../components/chat/ShareListingSheet';
import { useElie } from '../components/chat/useElie';
import { ElieHistoryPanel, ElieThread } from '../components/chat/ElieThread';
import ConversationInfo from '../components/chat/ConversationInfo';
import ReportSheet from '../components/chat/ReportSheet';
import ChatSettings, { ChatSettingsStyles } from '../components/chat/ChatSettings';
import { useCounts } from '../lib/counts/countsStore';
import { isModifiedClick } from '../lib/navigation/clicks';
import { KEEP_FOCUS_SELECTOR, useChatViewport } from '../components/chat/useChatViewport';

const { chatsCssHref } = require('../lib/chatsCssAssets');

const ELIE_ID = 'elie';

const { resolveAvatarUrl } = require('../components/resolveStoredPhotoUrl');

function resolveChatAvatarUrl(url?: string | null, client?: any): string | null {
  if (!url) return null;
  if (/^(data:|blob:)/i.test(url)) return url;
  try {
    const sb = client || (typeof window !== 'undefined' ? (getSupabaseClient()) : null);
    return resolveAvatarUrl(url, sb) || url;
  } catch {
    return url;
  }
}

function ConversationAvatar({
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

  const initials = useMemo(() => {
    if (!name) return 'VA';
    const clean = name.replace(/[^\w\s]/gi, '').trim();
    if (!clean) return name.slice(0, 2).toUpperCase();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }, [name]);

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

/** Extension-to-MIME-type map — defined at module level to avoid re-creation per call. */
const MIME_EXT_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function inferMimeType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return MIME_EXT_MAP[ext] || 'application/octet-stream';
}

/**
 * Extends ChatMessage with fields present only during the optimistic-send window.
 * The optimistic message is replaced by the server-confirmed message after upload.
 */
interface OptimisticChatMessage extends ChatMessage {
  /** True while the upload / persistence request is in-flight. */
  _optimistic?: boolean;
  /** Local blob URL created from the selected file for instant display. */
  _localUrl?: string;
  /** True when the upload or persistence request failed. */
  _failed?: boolean;
}

export default function ChatsPage({ initialConversationId }: { initialConversationId?: string } = {}) {
  const router = useRouter();

  // Session & User
  const [session, setSession] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<'host' | 'client'>('client');

  // Conversations & Messages
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId || null);
  const [messages, setMessagesState] = useState<(ChatMessage | OptimisticChatMessage)[]>([]);
  const [loadingInbox, setLoadingInbox] = useState<boolean>(true);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<boolean>(false);

  // UI Views & Drawers
  const [mobileView, setMobileView] = useState<'inbox' | 'conversation' | 'info'>('inbox');
  const [messageMenu, setMessageMenu] = useState<{ message: ChatMessage; x: number; y: number } | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string>('');
  const [infoCollapsed, setInfoCollapsed] = useState<boolean>(true);
  const [chatSettingsEmbedded, setChatSettingsEmbedded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  // Presence has synced for this conversation (legacy left the status blank until then).
  const [presenceKnownId, setPresenceKnownId] = useState<string | null>(null);

  // Attachments & Previews
  const [pendingPreviewFile, setPendingPreviewFile] = useState<File | null>(null);
  const [previewCaption, setPreviewCaption] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<{ url: string; alt: string } | null>(null);
  const [reportSheetOpen, setReportSheetOpen] = useState<boolean>(false);
  const [searchPlaceholder, setSearchPlaceholder] = useState<string>('Search conversations...');
  const counts = useCounts();

  // Elie State
  const isElie = activeId === ELIE_ID;
  const [elieHistoryOpen, setElieHistoryOpen] = useState<boolean>(false);
  const elie = useElie(userId);
  const elieResetRef = useRef(elie.reset);
  elieResetRef.current = elie.reset;

  // Composer Text State
  const [composerText, setComposerText] = useState<string>('');
  const [mobileAttachMenuOpen, setMobileAttachMenuOpen] = useState(false);
  // A non-image file picked on a phone waits here and is sent with the text (legacy).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const isHost = role === 'host';

  // Refs for Realtime & Lifecycle Guards
  const selectionGenerationRef = useRef<number>(0);
  const channelGenerationRef = useRef<number>(0);
  const activeChannelRef = useRef<any>(null);
  const mountedRef = useRef<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const desktopEditorRef = useRef<HTMLDivElement | null>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const statusNoteTimerRef = useRef<number | null>(null);
  const sendingRef = useRef<boolean>(false);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  // Active state synchronization refs to break cyclic dependencies
  const sessionRef = useRef<any>(session);
  sessionRef.current = session;
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;
  const messagesStateRef = useRef<(ChatMessage | OptimisticChatMessage)[]>(messages);
  messagesStateRef.current = messages;
  const routerRef = useRef(router);
  routerRef.current = router;

  // Authenticated fetch helper
  const api = useCallback(async (url: string, options: any = {}) => {
    const token = sessionRef.current?.access_token || ((window as any).supabaseClient ? (await (window as any).supabaseClient.auth.getSession())?.data?.session?.access_token : null);
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options && options.headers),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Request failed');
    return body;
  }, []);

  const activeConversation = useMemo(() => {
    if (activeId === ELIE_ID) {
      return {
        id: ELIE_ID,
        isElie: true,
        participant: { full_name: 'Elie', username: 'Your VaRoom search assistant' },
        lastMessage: null,
      } as ChatConversation;
    }
    return conversations.find((c) => c.id === activeId) || null;
  }, [conversations, activeId]);

  const isCurrentOnline = useMemo(() => {
    if (!activeId || isElie) return false;
    return onlineUsers.has(activeId);
  }, [activeId, isElie, onlineUsers]);

  useChatViewport({ shellRef: appShellRef, messagesRef, composerRef, textareaRef: mobileTextareaRef });

  const emptyCopy = role === 'host'
    ? { heading: 'No conversations yet', detail: 'When clients reach out, your conversations will appear here.' }
    : { heading: 'Start a conversation', detail: 'Chat with a host and your conversations will appear here.' };

  const closePhotoPreview = useCallback(() => setSelectedPhotoPreview(null), []);

  // The photo waiting to be shared: one object URL, released when it changes.
  const pendingPreviewUrl = useMemo(() => (pendingPreviewFile ? URL.createObjectURL(pendingPreviewFile) : null), [pendingPreviewFile]);
  useEffect(() => () => { if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl); }, [pendingPreviewUrl]);
  useEffect(() => {
    if (!pendingPreviewFile) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPendingPreviewFile(null);
      setPreviewCaption('');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingPreviewFile]);

  const pinnedMessage = useMemo(() => {
    return messages.find((m) => m.pinned_at && !m.deleted_at) || null;
  }, [messages]);

  // Scroll to bottom smoothly
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    }
  }, []);

  // Keep the newest Elie entry in view.
  useEffect(() => {
    if (isElie) setTimeout(() => scrollToBottom(true), 50);
  }, [isElie, elie.entries, elie.thinking, scrollToBottom]);

  // Update composer state classes & height
  const updateComposerUI = useCallback(() => {
    if (mobileTextareaRef.current) {
      const ta = mobileTextareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 112)}px`;
    }
  }, []);

  // Sync unread counts with VaroomSidebar
  const updateSidebarCounts = useCallback(() => {
    if (typeof window === 'undefined') return;
    // Reading or sending messages changes the unread counts: refresh the
    // shared store now rather than waiting for it to go stale.
    if (window.VaRoomCounts) {
      void window.VaRoomCounts.refresh();
      return;
    }
    try {
      if ((window as any).VaroomSidebar && typeof (window as any).VaroomSidebar.initCounts === 'function') {
        (window as any).VaroomSidebar.initCounts({ supabaseClient: (window as any).supabaseClient });
      }
    } catch {}
  }, []);

  // Fetch conversations list
  const loadConversations = useCallback(async (targetUserId?: string, targetSession?: any) => {
    const currentUserId = targetUserId || userIdRef.current;
    const currentSession = targetSession || sessionRef.current;
    if (!currentUserId) return;

    try {
      let list: ChatConversation[] = [];
      if (chatCache && typeof chatCache.syncInbox === 'function') {
        list = await syncInbox(currentUserId, {
          accessToken: currentSession?.access_token,
          fetchFn: (url) => api(url),
        });
      } else {
        const res = await api('/api/chat/conversations');
        list = res.conversations || [];
      }

      if (mountedRef.current) {
        setConversations(list);
        setLoadingInbox(false);
      }
    } catch (err) {
      console.error('Failed to sync conversations:', err);
      if (mountedRef.current) setLoadingInbox(false);
    }
  }, [api]);

  // The inbox follows the newest message: preview updated, newest first
  // (legacy updateConversationPreview). `null` when a thread is empty.
  const bumpConversation = useCallback((conversationId: string, lastMessage: ChatMessage | null) => {
    setConversations((prev) => {
      const index = prev.findIndex((c) => c.id === conversationId);
      if (index < 0) return prev;
      const current = prev[index];
      const unchanged = (current.lastMessage?.id || null) === (lastMessage?.id || null)
        && (current.lastMessage?.deleted_at || null) === (lastMessage?.deleted_at || null);
      if (unchanged) return prev;
      const next = prev.slice();
      next[index] = { ...current, lastMessage };
      const time = (c: ChatConversation) => new Date(c.lastMessage?.created_at || c.created_at || 0).getTime();
      return next.sort((a, b) => time(b) - time(a));
    });
  }, []);

  // Select conversation & establish Realtime channel
  const selectConversation = useCallback(async (id: string, updateRoute = true) => {
    if (!id) return;
    const client = getSupabaseClient();
    const selectionGen = ++selectionGenerationRef.current;

    const previousConversationId = activeIdRef.current;
    const isSameConversation = previousConversationId === id;
    if (previousConversationId && !isSameConversation) {
      setOnlineUsers((prev) => {
        if (!prev.has(previousConversationId)) return prev;
        const next = new Set(prev);
        next.delete(previousConversationId);
        return next;
      });
      setPresenceKnownId(null);
    }
    activeIdRef.current = id;
    setActiveId(id);
    setMobileView('conversation');
    setReplyTo(null);
    setMessagesError(false);
    setPendingFile(null);
    setShareSheetOpen(false);
    setReportSheetOpen(false);

    // Update URL query without full page reload if requested
    if (updateRoute) {
      const currentQuery = routerRef.current.query;
      if (currentQuery.c !== id && currentQuery.conversation !== id) {
        const nextQuery: Record<string, any> = { ...currentQuery, c: id };
        delete nextQuery.conversation;
        routerRef.current.replace({ pathname: '/chats', query: nextQuery }, undefined, { shallow: true });
      }
    }

    if (id === ELIE_ID) {
      // Elie assistant conversation: a new search each time it is opened.
      if (!isSameConversation) elieResetRef.current();
      setElieHistoryOpen(false);
      setInfoCollapsed(true);
      if (activeChannelRef.current) {
        try {
          if (client) client.removeChannel(activeChannelRef.current);
        } catch {}
        activeChannelRef.current = null;
      }
      setMessagesState([]);
      setLoadingMessages(false);
      return;
    }

    if (window.matchMedia('(min-width: 761px)').matches) setInfoCollapsed(false);

    const currentUserId = userIdRef.current;
    if (!currentUserId) return;

    // 1. Instant Cache Read (if not already active)
    let cached: ChatMessage[] | null = null;
    try {
      cached = await getMessages(currentUserId, id);
      if (cached && cached.length > 0 && selectionGen === selectionGenerationRef.current) {
        setMessagesState(cached);
        setLoadingMessages(false);
        setTimeout(() => scrollToBottom(false), 50);
      } else if (!isSameConversation) {
        setLoadingMessages(true);
      }
    } catch (e) {
      if (!isSameConversation) setLoadingMessages(true);
    }

    // 2. Clean up previous channel
    if (activeChannelRef.current) {
      try {
        if (client) client.removeChannel(activeChannelRef.current);
      } catch {}
      activeChannelRef.current = null;
    }

    // 3. Delta network sync
    try {
      let finalMsgs: ChatMessage[] = [];
      if (chatCache && typeof chatCache.syncConversationMessages === 'function') {
        finalMsgs = await syncConversationMessages(currentUserId, id, {
          accessToken: sessionRef.current?.access_token,
          fetchFn: (url) => api(url),
        });
      } else {
        const newest = cached && cached.length ? cached[cached.length - 1] : null;
        let url = `/api/chat/conversations/${encodeURIComponent(id)}/messages`;
        if (newest?.created_at) url += `?since=${encodeURIComponent(newest.created_at)}`;
        const res = await api(url);
        finalMsgs = res.messages || [];
      }

      if (selectionGen === selectionGenerationRef.current && mountedRef.current) {
        setMessagesState(finalMsgs);
        setLoadingMessages(false);
        if (finalMsgs.length) bumpConversation(id, finalMsgs[finalMsgs.length - 1]);
        setTimeout(() => scrollToBottom(false), 50);
      }
    } catch (err) {
      console.error('Message sync failed:', err);
      if (selectionGen === selectionGenerationRef.current && mountedRef.current) {
        setLoadingMessages(false);
        if (!cached || cached.length === 0) setMessagesError(true);
      }
    }

    // 4. Mark conversation as read
    api(`/api/chat/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' })
      .then(() => updateSidebarCounts())
      .catch(() => {});

    // 5. Establish Supabase Realtime channel
    if (!client) return;
    const channelGen = ++channelGenerationRef.current;
    const channel = client.channel(`chat:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async (payload: any) => {
        if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current) return;
        const msgId = payload.new?.id;
        // Messages this page already shows (our own sends) need no request.
        if (!msgId || messagesStateRef.current.some((m) => m.id === msgId)) return;

        try {
          // Everything after the newest message shown: one request.
          const newest = [...messagesStateRef.current].reverse().find((m) => !(m as OptimisticChatMessage)._optimistic && m.created_at);
          let url = `/api/chat/conversations/${encodeURIComponent(id)}/messages`;
          if (newest) url += `?since=${encodeURIComponent(newest.created_at)}`;
          const res = await api(url);
          if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current || !mountedRef.current) return;
          const incoming: ChatMessage[] = (res.messages || []).filter((m: ChatMessage) => !messagesStateRef.current.some((existing) => existing.id === m.id));
          if (!incoming.length) return;
          setMessagesState((prev) => [...prev, ...incoming.filter((m) => !prev.some((existing) => existing.id === m.id))]);
          incoming.forEach((m) => { appendMessage(currentUserId, id, m).catch(() => {}); });
          const latest = incoming[incoming.length - 1];
          updateInboxConversation(currentUserId, id, { lastMessage: latest }).catch(() => {});
          bumpConversation(id, latest);
          setTimeout(() => scrollToBottom(true), 50);
        } catch (e) {
          console.error('Unable to load new chat message:', e);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async () => {
        if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current) return;
        try {
          await refreshConversation(id);
        } catch (error) {
          console.error('Unable to refresh changed chat message:', error);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_user_deletions', filter: `conversation_id=eq.${id}` }, async () => {
        if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current) return;
        try {
          await refreshConversation(id);
        } catch (error) {
          console.error('Unable to refresh deleted chat message:', error);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current) return;
        const presence = channel.presenceState();
        const isOnline = Object.keys(presence).length > 1;
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          if (isOnline) next.add(id); else next.delete(id);
          return next;
        });
        setPresenceKnownId(id);
      });

    activeChannelRef.current = channel;
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED' && currentUserId) {
        channel.track({ user_id: currentUserId }).catch((error: unknown) => console.error('Chat presence failed:', error));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`Chat realtime subscription failed: ${status}`);
      }
    });
    // refreshConversation uses refs only, so a stale closure is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, scrollToBottom, updateSidebarCounts, bumpConversation]);

  // Role follows the verified account's profile from AuthProvider.
  const verifiedRole = accountRole(useAuth().profile);
  useEffect(() => {
    if (!verifiedRole) return;
    setRole(verifiedRole);
    document.documentElement.setAttribute('data-role', verifiedRole);
  }, [verifiedRole]);

  // 1. Main Authentication & Session Hydration (Runs once on mount + account switcher)
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const initAuth = async () => {
      const client = getSupabaseClient();
      if (!client?.auth) return;

      const { data: { session: currentSession } } = await client.auth.getSession();
      if (!currentSession || !currentSession.user) {
        if (!cancelled) routerRef.current.push(loginUrl('/chats'));
        return;
      }

      if (cancelled) return;
      setSession(currentSession);
      const curUserId = currentSession.user.id;
      setUserId(curUserId);
    };

    initAuth();

    // Listen for multi-account switcher events
    const handleAccountChange = () => {
      const activeAccount = localStorage.getItem('varoom_active_account_id');
      if (activeAccount && activeAccount !== userIdRef.current) {
        setUserId(activeAccount);
        setConversations([]);
        setActiveId(null);
        activeIdRef.current = null;
        setMessagesState([]);
        setLoadingInbox(true);
        if (activeChannelRef.current) {
          try {
            const client = (window as any).supabaseClient;
            if (client) client.removeChannel(activeChannelRef.current);
          } catch {}
          activeChannelRef.current = null;
        }
        initAuth();
      }
    };
    window.addEventListener('varoom_active_account_changed', handleAccountChange);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.removeEventListener('varoom_active_account_changed', handleAccountChange);
      if (activeChannelRef.current) {
        try {
          const client = (window as any).supabaseClient;
          if (client) client.removeChannel(activeChannelRef.current);
        } catch {}
        activeChannelRef.current = null;
      }
    };
  }, []);

  // 2. Inbox Loading & Background Sync (Triggered when authenticated user is resolved)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    // Instant cache render
    getInbox(userId).then((cachedInbox) => {
      if (!cancelled && cachedInbox && cachedInbox.length > 0) {
        setConversations(cachedInbox);
        setLoadingInbox(false);
      }
    }).catch(() => {});

    // Fresh background sync
    loadConversations(userId, sessionRef.current);

    return () => {
      cancelled = true;
    };
  }, [userId, loadConversations]);

  // 3. Deep link & URL query conversation selection
  const routerQueryC = router.query.c as string | undefined;
  const routerQueryConversation = router.query.conversation as string | undefined;

  useEffect(() => {
    if (!userId) return;
    const requested = routerQueryC || routerQueryConversation || null;
    if (requested && requested !== activeIdRef.current) {
      selectConversation(requested, false);
    }
  }, [userId, routerQueryC, routerQueryConversation, selectConversation]);

  // Close mobile attach menu when clicking outside
  useEffect(() => {
    if (!mobileAttachMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const menu = document.getElementById('mobileAttachMenu');
      const btn = document.querySelector('.mobile-attach');
      if (menu && !menu.contains(e.target as Node) && btn && !btn.contains(e.target as Node)) {
        setMobileAttachMenuOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [mobileAttachMenuOpen]);

  // Phones: the app's bottom navigation shows on the inbox and hides inside a
  // conversation or its information (legacy showMobileInbox/Conversation).
  useEffect(() => {
    const inConversation = mobileView !== 'inbox' && window.matchMedia('(max-width: 760px)').matches;
    document.body.classList.toggle('chat-page-context', inConversation);
  }, [mobileView]);
  useEffect(() => () => document.body.classList.remove('chat-page-context'), []);

  // Search placeholder as legacy: "Search" on desktop.
  useEffect(() => {
    if (window.matchMedia('(min-width: 761px)').matches) setSearchPlaceholder('Search');
  }, []);

  // Timers for the reply highlight and the "Copied" note.
  useEffect(() => () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    if (statusNoteTimerRef.current) window.clearTimeout(statusNoteTimerRef.current);
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer);
  }, []);

  // The menu belongs to one conversation.
  useEffect(() => {
    setMessageMenu(null);
  }, [activeId]);

  // Send message handler
  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend !== undefined ? textToSend : (desktopEditorRef.current?.innerHTML || composerText)).trim();
    const plainText = (desktopEditorRef.current?.textContent || content).trim();
    if (!activeId) return;
    if (!plainText && (activeId === ELIE_ID || !pendingFile)) return;

    if (activeId === ELIE_ID) {
      setComposerText('');
      resetDesktopComposer();
      void elie.send(plainText);
      return;
    }

    // Standard conversation message send (legacy sendText). Text is cleared
    // only after the server accepts it; one send at a time.
    if (sendingRef.current) return;
    sendingRef.current = true;
    const conversationId = activeId;
    const currentReply = replyTo;
    const fileToSend = pendingFile;
    const textareaHadFocus = document.activeElement === mobileTextareaRef.current;
    try {
      let res: { message?: ChatMessage; messages?: ChatMessage[] } | null = null;
      if (fileToSend) {
        // The upload shows its own sending and failed states in the thread.
        setPendingFile(null);
        void handleUploadAttachment(fileToSend, 'file', plainText ? content : fileToSend.name);
      } else if (!currentReply && plainText.toLowerCase() === '@reply') {
        res = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/reply`, {
          method: 'POST',
          body: JSON.stringify({ command: '@reply' }),
        });
      } else {
        res = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: content,
            messageType: 'text',
            replyToMessageId: currentReply?.id || undefined,
          }),
        });
      }

      // Accepted: clear the composer (also if the user has switched conversation).
      setComposerText('');
      resetDesktopComposer();
      if (currentReply) setReplyTo(null);
      if (textareaHadFocus) mobileTextareaRef.current?.focus();

      const sent = res ? (res.messages || (res.message ? [res.message] : [])) : [];
      if (sent.length && currentReply && res?.message) {
        // Show the quote at once; the server row has only the id.
        res.message.reply_to_message = {
          id: currentReply.id,
          sender_id: currentReply.sender_id,
          body: currentReply.body,
          deleted_at: currentReply.deleted_at,
        };
      }
      if (sent.length && mountedRef.current && activeIdRef.current === conversationId) {
        setMessagesState((prev) => [...prev, ...sent.filter((m) => !prev.some((existing) => existing.id === m.id))]);
        setTimeout(() => scrollToBottom(true), 50);
      }
      if (sent.length && userId) {
        sent.forEach((m) => { appendMessage(userId, conversationId, m).catch(() => {}); });
        updateInboxConversation(userId, conversationId, { lastMessage: sent[sent.length - 1] }).catch(() => {});
      }
      if (sent.length) bumpConversation(conversationId, sent[sent.length - 1]);
    } catch (err) {
      console.error('Failed to send chat message:', err);
      showStatusNote('Message not sent. Please try again.', 3500);
    } finally {
      sendingRef.current = false;
    }
  };

  // Empty the desktop editor and turn off any formatting left active (legacy resetDesktopComposer).
  const resetDesktopComposer = () => {
    const editor = desktopEditorRef.current;
    if (!editor) return;
    editor.innerHTML = '';
    editor.removeAttribute('style');
    if (!window.matchMedia('(min-width: 761px)').matches) return;
    editor.focus();
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(true);
      selection.addRange(range);
    }
    ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'].forEach((command) => {
      if (document.queryCommandState(command)) document.execCommand(command, false);
    });
  };

  // Share listings (host): one listing message each, as legacy.
  const shareListings = async (listings: ChatListingSummary[]) => {
    const conversationId = activeIdRef.current;
    if (!conversationId || conversationId === ELIE_ID || !isHost) return;
    try {
      for (const listing of listings) {
        const res = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: listing.title, listingId: listing.id, messageType: 'listing' }),
        });
        const sent: ChatMessage | undefined = res?.message;
        if (!sent) continue;
        if (mountedRef.current && activeIdRef.current === conversationId) {
          setMessagesState((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        }
        if (userId) {
          appendMessage(userId, conversationId, sent).catch(() => {});
          updateInboxConversation(userId, conversationId, { lastMessage: sent }).catch(() => {});
        }
        bumpConversation(conversationId, sent);
      }
      setTimeout(() => scrollToBottom(true), 50);
    } catch (err) {
      console.error('Unable to share listing:', err);
      showStatusNote('Listing not shared. Please try again.', 3500);
      throw err;
    }
  };

  // Files chosen with the file button: images go to the photo preview; on
  // phones other files wait for the send button; on desktop they upload at once.
  const onFileChosen = (file: File) => {
    if (!isHost) return;
    if (/^image\//i.test(file.type || '') || /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i.test(file.name || '')) {
      setPendingPreviewFile(file);
    } else if (window.matchMedia('(max-width: 760px)').matches) {
      setPendingFile(file);
    } else {
      void handleUploadAttachment(file, 'file');
    }
  };

  // Upload attachment & send
  const handleUploadAttachment = async (file: File, kind: 'photo' | 'file', caption?: string) => {
    if (!activeId || isUploading) return;

    // --- Optimistic: create a temporary message immediately ---
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const captionAtSend = (caption ?? previewCaption).trim() || file.name;
    const localObjectUrl = URL.createObjectURL(file);
    const tempMsg: OptimisticChatMessage = {
      id: tempId,
      conversation_id: activeId,
      sender_id: userId || '',
      body: captionAtSend,
      created_at: new Date().toISOString(),
      message_type: kind,
      // attachment is null initially; the image is shown via localObjectUrl below
      attachment: kind === 'photo' ? ({
        id: tempId,
        original_filename: file.name,
        kind: 'photo',
        status: 'pending',
      } as ChatAttachment) : null,
      _optimistic: true,
      _localUrl: localObjectUrl,
    } satisfies OptimisticChatMessage;

    setMessagesState((prev) => [...prev, tempMsg]);
    setPendingPreviewFile(null);
    setPreviewCaption('');
    setTimeout(() => scrollToBottom(true), 50);

    setIsUploading(true);
    try {
      const fileMimeType = inferMimeType(file);
      // 1. Init upload
      const initRes = await api(`/api/chat/conversations/${encodeURIComponent(activeId)}/attachments/upload-init`, {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          mimeType: fileMimeType,
          fileSize: file.size,
          kind: kind,
        }),
      });

      // 2. Direct PUT to Cloudflare R2
      const putRes = await fetch(initRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': fileMimeType },
        body: file,
      });
      if (!putRes.ok) throw new Error('R2 direct upload failed');

      // 3. Finalize upload
      await api(`/api/chat/conversations/${encodeURIComponent(activeId)}/attachments/${encodeURIComponent(initRes.attachmentId)}/complete`, {
        method: 'POST',
        body: '{}',
      });

      // 4. Send attachment message
      const res = await api(`/api/chat/conversations/${encodeURIComponent(activeId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: captionAtSend,
          attachmentId: initRes.attachmentId,
          messageType: kind,
        }),
      });

      if (res?.message && mountedRef.current) {
        // Replace the optimistic message with the real one; dedup against Realtime
        setMessagesState((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (withoutTemp.some((m) => m.id === res.message.id)) return withoutTemp;
          return [...withoutTemp, res.message];
        });
        if (userId) {
          appendMessage(userId, activeId, res.message).catch(() => {});
          updateInboxConversation(userId, activeId, { lastMessage: res.message }).catch(() => {});
        }
        bumpConversation(activeId, res.message);
        // The persisted message fetches its own signed URL. It must not reuse this
        // local blob URL, because it is about to be released.
        URL.revokeObjectURL(localObjectUrl);
        setTimeout(() => scrollToBottom(true), 50);
      }
    } catch (err) {
      console.error('Attachment upload failed:', err);
      // Mark optimistic message as failed so the user can dismiss it.
      setMessagesState((prev) => prev.map((m) => m.id === tempId
        ? { ...m, _failed: true } as OptimisticChatMessage
        : m
      ));
    } finally {
      setIsUploading(false);
    }
  };

  // ── Message actions (legacy chat-data.js performMessageAction) ──

  // Text messages in person-to-person chats only: the server accepts actions
  // on text messages, and Elie messages are not stored there.
  const canActOnMessage = (m: ChatMessage): boolean => (
    !isElie
    && m.message_type === 'text'
    && !m.deleted_at
    && !(m as OptimisticChatMessage)._optimistic
  );

  const openMessageMenu = (message: ChatMessage, x: number, y: number) => {
    if (!canActOnMessage(message)) return;
    setMessageMenu({ message, x, y });
  };

  // Desktop right-click; on phones the long-press below opens the menu.
  const onMessageContextMenu = (event: React.MouseEvent, message: ChatMessage) => {
    if (!canActOnMessage(message)) return;
    if (window.matchMedia('(max-width: 760px)').matches) {
      event.preventDefault();
      return;
    }
    if ((event.target as Element).closest('a,button,input,textarea,video,audio')) return;
    event.preventDefault();
    openMessageMenu(message, event.clientX, event.clientY);
  };

  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  };

  const onMessageTouchStart = (event: React.TouchEvent, message: ChatMessage) => {
    if (event.touches.length !== 1 || !canActOnMessage(message)) return;
    const touch = event.touches[0];
    cancelLongPress();
    const press = { x: touch.clientX, y: touch.clientY, timer: 0 };
    press.timer = window.setTimeout(() => {
      longPressRef.current = null;
      openMessageMenu(message, press.x, press.y);
    }, 500);
    longPressRef.current = press;
  };

  const onMessageTouchMove = (event: React.TouchEvent) => {
    const press = longPressRef.current;
    if (!press || !event.touches.length) return;
    const touch = event.touches[0];
    if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 12) cancelLongPress();
  };

  // Scroll to a replied-to message and replay its highlight.
  const scrollToMessage = (messageId: string) => {
    const target = Array.from(document.querySelectorAll<HTMLElement>('.messages [data-message-id]'))
      .find((row) => row.dataset.messageId === String(messageId));
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    setHighlightedMessageId(null);
    window.requestAnimationFrame(() => setHighlightedMessageId(messageId));
    highlightTimerRef.current = window.setTimeout(() => setHighlightedMessageId(null), 1600);
  };

  const replyKeyHandler = (messageId: string) => (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    scrollToMessage(messageId);
  };

  const showStatusNote = (text: string, ms = 2000) => {
    if (statusNoteTimerRef.current) window.clearTimeout(statusNoteTimerRef.current);
    setStatusNote(text);
    statusNoteTimerRef.current = window.setTimeout(() => setStatusNote(''), ms);
  };

  const copyMessage = async (message: ChatMessage) => {
    const text = messagePlainText(message.body);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // Clipboard API unavailable or denied: fall back to a selected textarea.
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { copied = document.execCommand('copy'); } catch { copied = false; }
      area.remove();
    }
    showStatusNote(copied ? 'Copied' : 'Unable to copy');
  };

  const startReply = (message: ChatMessage) => {
    setReplyTo(message);
    window.requestAnimationFrame(() => {
      if (window.matchMedia('(min-width: 761px)').matches) desktopEditorRef.current?.focus();
      else mobileTextareaRef.current?.focus();
    });
  };

  // A full fetch: pins and deletions change existing messages, which the
  // cache's `since` delta sync does not return. The cache is rewritten too.
  const refreshConversation = async (conversationId: string) => {
    const res = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`);
    const list: ChatMessage[] = res.messages || [];
    const currentUserId = userIdRef.current;
    if (currentUserId) setMessages(currentUserId, conversationId, list).catch(() => {});
    if (mountedRef.current && activeIdRef.current === conversationId) setMessagesState(list);
    bumpConversation(conversationId, list.length ? list[list.length - 1] : null);
    if (currentUserId) updateInboxConversation(currentUserId, conversationId, { lastMessage: list.length ? list[list.length - 1] : null }).catch(() => {});
  };

  const performMessageAction = async (message: ChatMessage, action: MessageAction) => {
    setMessageMenu(null);
    if (action === 'reply') {
      startReply(message);
      return;
    }
    if (action === 'copy') {
      await copyMessage(message);
      return;
    }
    if (action === 'delete_for_everyone'
      && !window.confirm('Delete this message for everyone? This cannot be undone.')) return;
    const conversationId = activeIdRef.current;
    if (!conversationId) return;
    try {
      await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await refreshConversation(conversationId);
    } catch (err) {
      console.error('Unable to perform message action:', err);
      window.alert((err instanceof Error && err.message) || 'Unable to update message');
    }
  };

  const closeMessageMenu = useCallback(() => setMessageMenu(null), []);

  // Report the other person (legacy openReportSheet).
  const submitReport = async (reason: string, details: string) => {
    const conversationId = activeIdRef.current;
    if (!conversationId || conversationId === ELIE_ID) return;
    try {
      await api('/api/chat/reports', {
        method: 'POST',
        body: JSON.stringify({ conversationId, reason, details: details || undefined }),
      });
      showStatusNote('Report submitted. Thank you.', 3500);
    } catch (err) {
      console.error('Unable to submit report:', err);
      showStatusNote('Unable to submit report. Please try again.', 3500);
      throw err;
    }
  };

  // Chat settings: embedded in the information column on desktop, its own
  // page on phones (returning to this conversation).
  const openChatSettings = () => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      void router.push(`/chat-settings?returnTo=${encodeURIComponent(router.asPath || '/chats')}`);
      return;
    }
    setInfoCollapsed(false);
    setChatSettingsEmbedded(true);
  };

  // Generate clean, readable plain-text previews for inbox rows (no literal HTML tags)
  const formatConversationPreview = useCallback((m?: ChatMessage | null): string => {
    if (!m) return '';
    if (m.deleted_at) return 'This message was deleted';

    const raw = m.body || '';
    let plain = '';
    if (raw) {
      if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
        try {
          const doc = new DOMParser().parseFromString(raw, 'text/html');
          doc.querySelectorAll('script, style, template').forEach((el) => el.remove());
          doc.querySelectorAll('br').forEach((el) => el.replaceWith(' '));
          doc.querySelectorAll('p, div, li').forEach((el) => el.appendChild(doc.createTextNode(' ')));
          plain = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
        } catch {
          plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      } else {
        plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }

    if (plain) return plain;

    // Handle media / attachment previews when there is no text caption
    if (m.message_type === 'photo' || (m.attachment && m.attachment.kind === 'photo')) {
      return 'Photo';
    }
    if (m.message_type === 'file' || (m.attachment && m.attachment.kind === 'file')) {
      return m.attachment?.original_filename || 'Attachment';
    }
    if (m.attachment) {
      return m.attachment.original_filename || 'Attachment';
    }

    return '';
  }, []);

  // Filtered inbox contacts
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => {
      const name = c.participant?.full_name?.toLowerCase() || '';
      const username = c.participant?.username?.toLowerCase() || '';
      const last = formatConversationPreview(c.lastMessage).toLowerCase();
      return name.includes(q) || username.includes(q) || last.includes(q);
    });
  }, [conversations, searchQuery, formatConversationPreview]);

  // Message body: plain text unless it carries the editor's formatting, which
  // is rebuilt from allowlisted elements with no attributes (lib/chat/messageBody).
  const renderMessageBody = (body: string): React.ReactNode => {
    if (!body) return null;
    if (!hasMessageMarkup(body)) {
      return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body}</span>;
    }
    const renderNodes = (nodes: MessageBodyNode[]): React.ReactNode[] => nodes.map((node, index) => (
      typeof node === 'string'
        ? node
        : React.createElement(node.tag, { key: index }, node.tag === 'br' ? undefined : renderNodes(node.children))
    ));
    return <span style={{ wordBreak: 'break-word' }}>{renderNodes(parseMessageBody(body))}</span>;
  };

  // Attachments are served through a short-lived signed URL; the download
  // route needs the session token and returns that URL as JSON.
  const openAttachment = async (attachmentId: string) => {
    try {
      const result = await api(`/api/chat/attachments/${encodeURIComponent(attachmentId)}/download`);
      if (result?.url) window.open(result.url, '_blank', 'noopener');
    } catch (err) {
      console.error('Attachment unavailable:', err);
      alert('Unable to open this file. Please try again.');
    }
  };

  return (
    <>
      <Head>
        <title>{activeConversation?.participant?.full_name ? `${activeConversation.participant.full_name} · Messages` : 'Messenger Dashboard'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="stylesheet" href={chatsCssHref} />
      </Head>

      {/* Inline SVG sprite for clean icon resolution */}
      <svg width="0" height="0" style={{ position: 'absolute', display: 'none' }}>
        <defs>
          <symbol id="i-share" viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.2M8.2 13.2l7.5 4.2"/></symbol>
          <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></symbol>
          <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
          <symbol id="i-send" viewBox="0 0 24 24"><path d="m3 3 18 9-18 9 3.5-9L3 3Z"/><path d="M6.5 12H21"/></symbol>
          <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></symbol>
          <symbol id="i-store" viewBox="0 0 24 24"><path d="M4 9V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4"/><path d="M3 9h18l-1.2 3.2a2 2 0 0 1-1.9 1.3H6.1a2 2 0 0 1-1.9-1.3L3 9Z"/><path d="M5 13.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5.5"/><path d="M9 20v-4h6v4"/></symbol>
          <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M8.5 14.5l2 2 4-4"/></symbol>
          <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></symbol>
          <symbol id="i-flag" viewBox="0 0 24 24"><path d="M5 21V4.5"/><path d="M5 5c3-2 5 2 8 0s5 2 6 0v9c-1 2-3-2-6 0s-5-2-8 0"/></symbol>
          <symbol id="i-ban" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/></symbol>
          <symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></symbol>
          <symbol id="i-bell" viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></symbol>
          <symbol id="i-user-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.2a6 6 0 0 1 11.6 0"/></symbol>
          <symbol id="i-bookmark" viewBox="0 0 24 24"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.8L6 21V4.5Z"/></symbol>
          <symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></symbol>
          <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.8 7.8 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.9 7.9 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.9 7.9 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.9 7.9 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.9 7.9 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5Z"/></symbol>
          <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></symbol>
          <symbol id="i-more" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></symbol>
          <symbol id="i-file-text" viewBox="0 0 24 24"><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4"/><path d="M8.5 12.5h7M8.5 15.5h7M8.5 9.5h3"/></symbol>
          <symbol id="i-image" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5a1.5 1.5 0 0 1 2 0L15 16l1.5-1.5a1.5 1.5 0 0 1 2 0L21 17"/></symbol>
          <symbol id="i-paperclip" viewBox="0 0 24 24"><path d="M16.5 6.5 8.9 14.1a3 3 0 1 0 4.2 4.2l7.1-7.1a5 5 0 1 0-7.1-7.1L5.9 11.3a7 7 0 1 0 9.9 9.9"/></symbol>
          <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
          <symbol id="i-panel" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/></symbol>
          <symbol id="i-chevron-left" viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></symbol>
          <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
          <symbol id="i-pin" viewBox="0 0 24 24"><path d="m16 3 5 5-4 1-4 4v5l-2 2-2-6-6-2 2-2h5l4-4z"/><path d="m9 15-5 5"/></symbol>
          <symbol id="i-list-dot" viewBox="0 0 24 24"><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/></symbol>
          <symbol id="i-list-sq" viewBox="0 0 24 24"><rect x="3.7" y="5.2" width="1.6" height="1.6"/><rect x="3.7" y="11.2" width="1.6" height="1.6"/><rect x="3.7" y="17.2" width="1.6" height="1.6"/><path d="M9 6h11M9 12h11M9 18h11"/></symbol>
          <symbol id="i-reply" viewBox="0 0 24 24"><path d="M9 10 4 14l5 4v-3c6 0 8 2 10 5-1-6-4-10-10-10z"/></symbol>
          <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></symbol>
          <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 5.5v13l11-6.5Z"/></symbol>
          <symbol id="i-phone" viewBox="0 0 24 24"><path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1.2 1.2 0 0 1 1.3-.3c1.1.4 2.3.6 3.5.6a1.2 1.2 0 0 1 1.2 1.2V20a1.2 1.2 0 0 1-1.2 1.2C10.6 21.2 2.8 13.4 2.8 4.2A1.2 1.2 0 0 1 4 3h3.3a1.2 1.2 0 0 1 1.2 1.2c0 1.2.2 2.4.6 3.5a1.2 1.2 0 0 1-.3 1.3L6.6 10.8Z"/></symbol>
          <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/></symbol>
          <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></symbol>
        </defs>
      </svg>

      <div ref={appShellRef} className={`app-shell ${mobileView === 'conversation' ? 'view-chat' : mobileView === 'info' ? 'view-info' : 'view-inbox'}`}>
        
        {/* 1. ICON RAIL (Fixed 78px navigation) */}
        <nav className="icon-rail" id="chatRoleNavigation" data-role={role} aria-label={role === 'host' ? 'Host navigation' : 'Client navigation'}>
          <div className="rail-top">
            {railItems(role).map((item) => (
              <a
                key={item.href}
                className={`rail-btn${item.href === '/chats' ? ' active' : ''}`}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={item.href === '/chats' ? 'page' : undefined}
                onClick={(e) => {
                  if (item.href === '/chats' || isModifiedClick(e)) { if (item.href === '/chats') e.preventDefault(); return; }
                  e.preventDefault();
                  void router.push(item.href);
                }}
              >
                <svg className="icon"><use href={`#${item.icon}`} /></svg>
                {item.count && counts[item.count] > 0 && (
                  <span className="varoom-count-badge" data-count-kind={item.count} aria-label={`${counts[item.count]} ${item.count === 'chats' ? 'unread conversations' : 'new bookings'}`}>
                    {counts[item.count]}
                  </span>
                )}
              </a>
            ))}
          </div>
          <div className="rail-bottom">
            <a className="rail-btn settings-btn" href="/settings" title="Settings" aria-label="Settings"
              onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); void router.push('/settings'); }}>
              <svg className="icon"><use href="#i-gear" /></svg>
            </a>
            <a className="rail-btn" href="/profile" title="Profile" aria-label="Profile"
              onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); void router.push('/profile'); }}>
              <svg className="icon"><use href="#i-user-circle" /></svg>
            </a>
          </div>
        </nav>

        {/* 2. CONTACTS / INBOX COLUMN */}
        <aside className={`contacts-col${mobileView !== 'inbox' ? ' mobile-hidden' : ''}`}>
          <div className="mobile-inbox-title">
            Messages
            <button className="mobile-chat-settings" type="button" aria-label="Chat settings" title="Chat settings" onClick={openChatSettings}>
              <svg className="icon"><use href="#i-gear" /></svg>
            </button>
          </div>

          <div className="search-bar">
            <div className="search-box">
              <svg className="icon"><use href="#i-search" /></svg>
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              className="compose-btn chat-settings-trigger"
              type="button"
              aria-label="Chat settings"
              title="Chat settings"
              onClick={openChatSettings}
            >
              <svg className="icon"><use href="#i-gear" /></svg>
            </button>
          </div>

          <ul className="contact-list" id="contactList">
            {/* Elie Assistant Permanent Row */}
            <li
              className={`contact-item ${activeId === ELIE_ID ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => selectConversation(ELIE_ID)}
            >
              <div className="avatar-wrap" style={{ background: 'transparent' }}>
                <ElieIcon size={34} state={activeId === ELIE_ID ? 'drop' : 'default'} />
              </div>
              <div className="contact-body">
                <div className="contact-top">
                  <div className="contact-name">Elie</div>
                </div>
                <div className="contact-bottom">
                  <div className="contact-preview">Your VaRoom search assistant</div>
                </div>
              </div>
            </li>

            {loadingInbox && conversations.length === 0 ? (
              Array.from({ length: 6 }, (_, index) => (
                <li key={`inbox-skeleton-${index}`} className="inbox-skeleton" aria-hidden="true">
                  <span className="inbox-skeleton-avatar" />
                  <span className="inbox-skeleton-copy">
                    <span className="inbox-skeleton-line name" />
                    <span className="inbox-skeleton-line preview" />
                  </span>
                </li>
              ))
            ) : conversations.length === 0 ? (
              <li className="inbox-empty-state" aria-label={`${emptyCopy.heading}. ${emptyCopy.detail}`}>
                <strong>{emptyCopy.heading}</strong>
                <span>{emptyCopy.detail}</span>
              </li>
            ) : filteredConversations.length === 0 && !loadingInbox ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-gray)', fontSize: '14px' }}>
                No messages found
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isActive = c.id === activeId;
                const isItemOnline = onlineUsers.has(c.id);
                const participant = c.participant;
                const name = participant?.full_name || participant?.username || 'User';
                const timeStr = c.lastMessage?.created_at ? new Date(c.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                const lastPreview = formatConversationPreview(c.lastMessage);

                return (
                  <li
                    key={c.id}
                    className={`contact-item ${isActive ? 'active' : ''}`}
                    style={{ position: 'relative' }}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectConversation(c.id)}
                  >
                    <div className="avatar-wrap">
                      <ConversationAvatar url={participant?.avatar_url} name={name} size={46} fontSize={14} />
                      {isItemOnline && <span className="online-indicator" style={{ position: 'absolute', bottom: 2, right: 2, width: 10, height: 10, borderRadius: '50%', background: '#4ec1a0', border: '2px solid #fff' }} />}
                    </div>
                    <div className="contact-body">
                      <div className="contact-top">
                        <div className="contact-name">{name}</div>
                        <div className="contact-time">{timeStr}</div>
                      </div>
                      <div className="contact-bottom">
                        <div className="contact-preview">{lastPreview}</div>
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* 3. CHAT COLUMN */}
        <main className={`chat-col${isElie ? ' is-elie' : ''}${!activeId ? ' empty-conversation' : ''}${mobileView === 'conversation' ? ' mobile-visible' : ''}`}>
          {/* Header */}
          <header className="chat-header">
            <button
              className="mobile-back"
              aria-label="Back to inbox"
              title="Back"
              onClick={() => {
                setMobileView('inbox');
                routerRef.current?.replace({ pathname: '/chats' }, undefined, { shallow: true });
              }}
            >
              <svg className="icon"><use href="#i-chevron-left" /></svg>
            </button>

            {isElie && (
              <button
                type="button"
                className="elie-history-toggle"
                id="elieHistoryToggle"
                aria-label="Search history"
                title="Search history"
                aria-expanded={elieHistoryOpen}
                onClick={() => setElieHistoryOpen((prev) => !prev)}
              >
                <svg className="icon"><use href="#i-menu" /></svg>
              </button>
            )}

            <div
              className="chat-header-identity"
              role="button"
              tabIndex={0}
              aria-label="Open conversation information"
              onClick={() => { if (window.matchMedia('(max-width: 760px)').matches) setMobileView('info'); }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && window.matchMedia('(max-width: 760px)').matches) {
                  e.preventDefault();
                  setMobileView('info');
                }
              }}
            >
              <div className="chat-header-avatar-wrap">
                {isElie ? (
                  <ElieIcon size={34} state={elie.thinking ? 'thinking' : 'default'} />
                ) : (
                  <ConversationAvatar
                    url={activeConversation?.participant?.avatar_url}
                    name={activeConversation?.participant?.full_name || activeConversation?.participant?.username || 'User'}
                    size={34}
                    fontSize={12}
                  />
                )}
              </div>
              <div>
                <div className="chat-header-name" id="chatName">
                  {isElie ? 'Elie' : activeConversation?.participant?.full_name || activeConversation?.participant?.username || 'Select a conversation'}
                </div>
                <div className="chat-header-status">
                  <span className={`dot ${isCurrentOnline ? 'online' : ''}`} id="statusDot" style={{ background: isCurrentOnline ? '#4ec1a0' : '#c7cbd1' }} />
                  <span id="statusText">{isElie ? 'Your VaRoom search assistant' : presenceKnownId === activeId ? (isCurrentOnline ? 'Online' : 'Offline') : ''}</span>
                </div>
              </div>
            </div>

            <div className="chat-header-actions">
              <button
                type="button"
                title="Toggle information panel"
                id="toggle-info-panel"
                aria-label="Toggle information panel"
                aria-expanded={!infoCollapsed}
                onClick={() => {
                  if (window.innerWidth <= 760) setMobileView('info');
                  else {
                    setChatSettingsEmbedded(false);
                    setInfoCollapsed((prev) => !prev);
                  }
                }}
              >
                <svg className="icon"><use href="#i-panel" /></svg>
              </button>
              {isElie ? (
                <button
                  type="button"
                  id="elieHistoryMore"
                  title="Search history"
                  aria-label="Search history"
                  aria-expanded={elieHistoryOpen}
                  onClick={() => setElieHistoryOpen((prev) => !prev)}
                >
                  <svg className="icon"><use href="#i-clock" /></svg>
                </button>
              ) : (
                <button
                  type="button"
                  title="More actions"
                  onClick={() => setReportSheetOpen(true)}
                >
                  <svg className="icon"><use href="#i-more" /></svg>
                </button>
              )}
            </div>
          </header>

          {/* Elie search history */}
          {isElie && (
            <ElieHistoryPanel
              open={elieHistoryOpen}
              onClose={() => setElieHistoryOpen(false)}
              listSessions={elie.listSessions}
              onOpenSession={(sessionId) => { void elie.loadSession(sessionId); }}
              ignoreSelector="#elieHistoryToggle, #elieHistoryMore"
            />
          )}

          {/* Pinned Message Banner */}
          {pinnedMessage && (
            <div className="pinned-message" id="pinnedMessage" aria-live="polite">
              <svg className="icon" aria-hidden="true"><use href="#i-pin" /></svg>
              <span>{messagePlainText(pinnedMessage.body) || 'Message'}</span>
            </div>
          )}

          {/* Messages Stream */}
          <div
            ref={messagesRef}
            className={`messages${loadingMessages ? ' chat-loading' : ''}${!activeId ? ' empty-state' : ''}`}
            aria-busy={loadingMessages || undefined}
          >
            {loadingMessages ? (
              [['in', ['medium', 'short']], ['out', ['long', 'short']], ['in', ['long', 'medium', 'short']], ['out', ['medium', 'short']]].map(([side, widths], index) => (
                <div key={`chat-skeleton-${index}`} className={`chat-skeleton-row ${side}`}>
                  {(widths as string[]).map((width, lineIndex) => <span key={lineIndex} className={`chat-skeleton-line ${width}`} />)}
                </div>
              ))
            ) : messagesError && !isElie && messages.length === 0 ? (
              <div className="system-notice">Unable to load messages. Please check your connection.</div>
            ) : !activeId ? (
              <div className="chat-empty-state" role="status">
                {!loadingInbox && conversations.length === 0 ? (
                  <><h2>{emptyCopy.heading}</h2><p>{emptyCopy.detail}</p></>
                ) : (
                  <><h2>Select a conversation</h2><p>Choose a conversation from your inbox to view messages.</p></>
                )}
              </div>
            ) : isElie ? (
              <ElieThread entries={elie.entries} thinking={elie.thinking} onPrompt={(prompt) => { void elie.send(prompt); }} onRetry={elie.retry} />
            ) : (
              <>
              {!isElie && <div className="system-notice">Your messages are encrypted and private.</div>}
              {messages.map((m, idx) => {
                const isOut = m.sender_id === (userId || session?.user?.id);
                const isElieMsg = m.sender_id === 'elie';
                const isSystem = m.message_type === 'system';
                const prev = idx > 0 ? messages[idx - 1] : null;
                const sameSender = prev && prev.sender_id === m.sender_id;
                const isDeleted = !!m.deleted_at;

                const rowClass = [
                  'msg-row',
                  isSystem ? 'system' : isOut ? 'out' : 'in',
                  isElieMsg && !isOut ? 'elie-message' : '',
                  sameSender ? 'same-sender' : '',
                  isDeleted ? 'msg-deleted' : '',
                  highlightedMessageId === m.id ? 'reply-target-highlight' : '',
                ].filter(Boolean).join(' ');

                const hasMedia = m.message_type === 'photo' || (m.attachment && m.attachment.kind === 'photo');
                const attachmentId = m.attachment_id || m.attachment?.id || null;
                const metaText = messageMetaText(m, isOut, (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                const meta = <div className="msg-meta">{metaText}</div>;
                // Uploads in progress or failed (photos and files).
                const optimistic = m as OptimisticChatMessage;
                const uploadState = optimistic._optimistic ? (
                  optimistic._failed ? (
                    <div className="msg-failed">
                      Failed
                      <button
                        type="button"
                        className="msg-failed-dismiss"
                        onClick={() => {
                          // Dismiss: release the blob URL and remove the failed message.
                          if (optimistic._localUrl) URL.revokeObjectURL(optimistic._localUrl);
                          setMessagesState((prev) => prev.filter((msg) => msg.id !== m.id));
                        }}
                      >Dismiss</button>
                    </div>
                  ) : <div className="msg-sending">Sending…</div>
                ) : null;
                const actionable = canActOnMessage(m);

                // Quote of the replied-to message (legacy makeReplyReference).
                const replyReference = m.reply_to_message_id ? (() => {
                  const original = m.reply_to_message;
                  const label = original && original.sender_id === userId ? 'You' : 'Reply';
                  const body = original && !original.deleted_at ? messagePlainText(original.body) : 'This message is unavailable';
                  return (
                    <div
                      className="message-reply-reference"
                      role="button"
                      tabIndex={0}
                      aria-label={`${label}: ${body}`}
                      onClick={() => scrollToMessage(m.reply_to_message_id as string)}
                      onKeyDown={replyKeyHandler(m.reply_to_message_id as string)}
                    >
                      <strong>{label}</strong>
                      <span>{body}</span>
                    </div>
                  );
                })() : null;

                return (
                  <div
                    key={m.id}
                    data-message-id={m.id}
                    className={rowClass}
                    style={{ position: 'relative' }}
                    onContextMenu={actionable ? (e) => onMessageContextMenu(e, m) : undefined}
                    onTouchStart={actionable ? (e) => onMessageTouchStart(e, m) : undefined}
                    onTouchMove={actionable ? onMessageTouchMove : undefined}
                    onTouchEnd={actionable ? cancelLongPress : undefined}
                    onTouchCancel={actionable ? cancelLongPress : undefined}
                  >
                    {isDeleted ? (
                      /* Deleted message, any type (legacy messageRow) */
                      <div className="bubble">
                        <svg className="icon" aria-hidden="true"><use href="#i-trash" /></svg>
                        <span>This message was deleted</span>
                        {meta}
                      </div>
                    ) : m.message_type === 'listing' && m.listing ? (
                      /* Shared listing */
                      <ListingCard listing={m.listing} api={api} meta={meta} />
                    ) : m.message_type === 'voice' && attachmentId ? (
                      /* Voice note */
                      <VoiceCard attachmentId={attachmentId} api={api} meta={meta} />
                    ) : hasMedia ? (
                      /* Photo attachment bubble */
                      <PhotoBubble
                        attachmentId={(m as OptimisticChatMessage)._optimistic ? null : attachmentId}
                        localUrl={(m as OptimisticChatMessage)._localUrl}
                        alt={m.attachment?.original_filename || 'Shared image'}
                        api={api}
                        onOpen={(url, alt) => setSelectedPhotoPreview({ url, alt })}
                        footer={(
                          <>
                            {m.body && m.body.trim() !== m.attachment?.original_filename && (
                              <div className="chat-message-caption">{renderMessageBody(m.body)}</div>
                            )}
                            {uploadState}
                            {meta}
                          </>
                        )}
                      >
                        {replyReference}
                      </PhotoBubble>
                    ) : m.attachment && m.attachment.kind === 'file' ? (
                      /* File card */
                      <div className="file-card" onClick={() => { void openAttachment(m.attachment!.id); }}>
                        <div className="file-icon">
                          <svg className="icon"><use href="#i-file-text" /></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="file-name">{m.attachment.original_filename || 'Attachment'}</div>
                          {Boolean(m.attachment.file_size || m.attachment.file_size_bytes) && <div className="file-sub">{Math.round(((m.attachment.file_size || m.attachment.file_size_bytes) as number) / 1024)} KB</div>}
                        </div>
                        <a
                          href={`/api/chat/attachments/${m.attachment.id}/download`}
                          className="dl"
                          aria-label="Download"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void openAttachment(m.attachment!.id); }}
                        >
                          <svg className="icon"><use href="#i-paperclip" /></svg>
                        </a>
                        <div className="msg-meta" style={{ width: '100%', textAlign: 'right' }}>{metaText}</div>
                      </div>
                    ) : (
                      /* Text bubble */
                      <div className="bubble">
                        {replyReference}
                        {renderMessageBody(m.body || '')}
                        {uploadState}
                        {meta}
                      </div>
                    )}

                    {/* Message actions button (hover); right-click and long-press open the same menu */}
                    {actionable && (
                      <div className="msg-action-wrap" style={{ position: 'absolute', top: 0, [isOut ? 'left' : 'right']: '100%', display: 'flex', alignItems: 'center', paddingLeft: isOut ? 0 : 4, paddingRight: isOut ? 4 : 0 }}>
                        <button
                          type="button"
                          className="msg-action-btn"
                          aria-label="Message actions"
                          aria-haspopup="menu"
                          aria-expanded={messageMenu?.message.id === m.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (messageMenu?.message.id === m.id) { setMessageMenu(null); return; }
                            const rect = e.currentTarget.getBoundingClientRect();
                            openMessageMenu(m, rect.left, rect.bottom + 4);
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, color: 'var(--text-gray)', opacity: 0.7 }}
                        >
                          <svg className="icon" style={{ width: 14, height: 14 }}><use href="#i-more" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer Input Area */}
          <div
            ref={composerRef}
            className={`chat-input-area ${isElie ? 'is-elie' : ''} ${composerText.trim() ? 'has-text' : ''} ${composerText.trim() || (pendingFile && !isElie) ? 'can-send' : ''}`}
            style={{ position: 'relative' }}
            onMouseDown={(e) => {
              // Phones: tapping composer buttons keeps the keyboard open.
              if (window.matchMedia('(max-width: 760px)').matches && (e.target as Element).closest(KEEP_FOCUS_SELECTOR)) e.preventDefault();
            }}
          >
            {/* Phone: a file waiting to be sent with the text */}
            <div className={`mobile-preview${pendingFile && !isElie ? ' has-content' : ''}`} id="mobileComposerPreview">
              {pendingFile && !isElie ? `File: ${pendingFile.name}` : ''}
            </div>
            <ElieComposerBeam isElie={isElie} />

            {/* Desktop WYSIWYG editor */}
            <div
              className="desktop-composer-editor"
              contentEditable={true}
              role="textbox"
              aria-multiline="true"
              aria-label="Write a message"
              data-placeholder={isElie ? 'Ask Elie about spaces, prices, amenities...' : 'Write a message...'}
              ref={desktopEditorRef}
              onInput={(e: any) => {
                const text = e.target.textContent || '';
                setComposerText(text);
              }}
              onKeyDown={(e) => {
                if (isElie && (e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
                  e.preventDefault();
                  return;
                }
                if (e.key === 'Escape' && replyTo) {
                  setReplyTo(null);
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />

            {/* Mobile Textarea */}
            <textarea
              ref={mobileTextareaRef}
              placeholder={isElie ? 'Ask Elie...' : 'Write a message...'}
              value={composerText}
              onChange={(e) => {
                setComposerText(e.target.value);
                updateComposerUI();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && replyTo) {
                  setReplyTo(null);
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(max-width: 760px)').matches) {
                  e.preventDefault();
                  handleSendMessage(e.currentTarget.value);
                }
              }}
            />

            {/* Reply preview (legacy position: the mobile grid places it on its own row) */}
            {replyTo && (() => {
              const label = replyTo.sender_id === userId ? 'Replying to you' : 'Replying to message';
              const body = messagePlainText(replyTo.body) || 'This message is unavailable';
              return (
                <div className="composer-reply-preview" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'default' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`${label}: ${body}`}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => scrollToMessage(replyTo.id)}
                    onKeyDown={replyKeyHandler(replyTo.id)}
                  >
                    <strong>{label}</strong>
                    <span>{body}</span>
                  </div>
                  <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}>
                    <svg className="icon" aria-hidden="true" style={{ width: 14, height: 14 }}><use href="#i-close" /></svg>
                  </button>
                </div>
              );
            })()}

            {/* Input Toolbar */}
            <div className="input-toolbar">
              <div className={`format-icons${isElie ? ' format-icons-hidden' : ''}`}>
                <button type="button" className="fmt-b" aria-label="Bold"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { desktopEditorRef.current?.focus(); document.execCommand('bold', false); }}>B</button>
                <button type="button" className="fmt-i" aria-label="Italic"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { desktopEditorRef.current?.focus(); document.execCommand('italic', false); }}>I</button>
                <button type="button" className="fmt-u" aria-label="Underline"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { desktopEditorRef.current?.focus(); document.execCommand('underline', false); }}>U</button>
                <span className="divider" />
                <button type="button" className="fmt-ul" aria-label="Bulleted list"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { desktopEditorRef.current?.focus(); document.execCommand('insertUnorderedList', false); }}>
                  <svg className="icon"><use href="#i-list-dot" /></svg>
                </button>
                <button type="button" className="fmt-ol" aria-label="Numbered list"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { desktopEditorRef.current?.focus(); document.execCommand('insertOrderedList', false); }}>
                  <svg className="icon"><use href="#i-list-sq" /></svg>
                </button>
              </div>

              <div className="attach-icons" data-chat-composer-actions>
                <ChatComposerActions
                  isElie={isElie}
                  canSend={!!composerText.trim() || (!!pendingFile && !isElie)}
                  role={role}
                  onShareListing={() => setShareSheetOpen(true)}
                  onSend={() => { void handleSendMessage(); }}
                  onPhotoClick={() => photoInputRef.current?.click()}
                  onFileClick={() => fileInputRef.current?.click()}
                  onMobileAttach={() => setMobileAttachMenuOpen((prev) => !prev)}
                />
                {!isElie && (
                  <div
                    className="mobile-attach-menu"
                    id="mobileAttachMenu"
                    role="menu"
                    aria-label="Attach"
                    hidden={!mobileAttachMenuOpen}
                  >
                    <button type="button" className="mobile-attach-item" role="menuitem"
                      onClick={() => { setMobileAttachMenuOpen(false); photoInputRef.current?.click(); }}>
                      <span className="ico ico-photos"><svg className="icon"><use href="#i-image" /></svg></span>Photos
                    </button>
                    <button type="button" className="mobile-attach-item" role="menuitem" hidden={!isHost} data-attach="files"
                      onClick={() => { setMobileAttachMenuOpen(false); fileInputRef.current?.click(); }}>
                      <span className="ico ico-files"><svg className="icon"><use href="#i-file-text" /></svg></span>Files
                    </button>
                    <button type="button" className="mobile-attach-item" role="menuitem" hidden={!isHost} data-attach="listing"
                      onClick={() => { setMobileAttachMenuOpen(false); setShareSheetOpen(true); }}>
                      <span className="ico ico-listing"><svg className="icon"><use href="#i-store" /></svg></span>Listing
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Hidden file inputs for attachments */}
            <input
              type="file"
              ref={photoInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPendingPreviewFile(file);
                e.target.value = '';
              }}
            />
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileChosen(file);
                e.target.value = '';
              }}
            />
          </div>

          {/* Report the other person */}
          {!isElie && (
            <ReportSheet
              open={reportSheetOpen}
              personName={activeConversation?.participant?.full_name || activeConversation?.participant?.username || ''}
              onClose={() => setReportSheetOpen(false)}
              onSubmit={submitReport}
            />
          )}

          {/* Host: share listings into the conversation */}
          {isHost && !isElie && (
            <ShareListingSheet
              open={shareSheetOpen}
              userId={userId}
              api={api}
              onClose={() => setShareSheetOpen(false)}
              onShare={shareListings}
            />
          )}

          {/* In-Conversation Media Preview / Composer Before Send */}
          {pendingPreviewFile && (
            <div
              className="chat-media-preview-composer"
              id="chatMediaPreviewModal"
              role="dialog"
              aria-label="Preview image to share"
            >
              <div className="chat-media-preview-header">
                <button
                  type="button"
                  className="chat-media-preview-close"
                  id="chatMediaPreviewClose"
                  aria-label="Cancel image share"
                  title="Cancel"
                  onClick={() => {
                    setPendingPreviewFile(null);
                    setPreviewCaption('');
                  }}
                >
                  <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
                </button>
              </div>
              <div className="chat-media-preview-body">
                <img
                  id="chatMediaPreviewImg"
                  className="chat-media-preview-image"
                  src={pendingPreviewUrl || undefined}
                  alt="Selected image preview"
                />
              </div>
              <div className="chat-media-preview-footer">
                <div className="chat-media-preview-caption-wrap">
                  <input
                    type="text"
                    id="chatMediaPreviewCaption"
                    className="chat-media-preview-caption-input"
                    placeholder="Type a message"
                    aria-label="Type a message"
                    value={previewCaption}
                    autoFocus
                    onChange={(e) => setPreviewCaption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleUploadAttachment(pendingPreviewFile, 'photo');
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="chat-media-preview-send-btn"
                  id="chatMediaPreviewSend"
                  aria-label="Send photo"
                  title="Send photo"
                  disabled={isUploading}
                  onClick={() => handleUploadAttachment(pendingPreviewFile, 'photo')}
                >
                  <svg className="icon" aria-hidden="true"><use href="#i-send" /></svg>
                </button>
              </div>
            </div>
          )}
        </main>

        {/* 4. INFORMATION COLUMN (Collapsible) */}
        <aside className={`info-col ${infoCollapsed ? 'collapsed' : ''}${chatSettingsEmbedded ? ' chat-settings-open' : ''}${mobileView === 'info' ? ' mobile-visible' : ''}`} id="infoCol">
          {chatSettingsEmbedded ? (
            <>
              <div className="chat-settings-panel-head">
                <span>Chat Settings</span>
                <button type="button" className="info-close-btn" aria-label="Close Chat Settings" title="Close Chat Settings" onClick={() => setChatSettingsEmbedded(false)}>
                  <svg className="icon"><use href="#i-close" /></svg>
                </button>
              </div>
              {/* Rendered here directly (it was an iframe of the settings page). */}
              <ChatSettingsStyles />
              <div className="cs-embedded">
                <ChatSettings key={role} role={role} onOpenArchived={() => setChatSettingsEmbedded(false)} />
              </div>
            </>
          ) : (
          <>
          <div className="info-title-row">
            <div className="info-title">Information</div>
            <button className="info-close-btn" title="Close" onClick={() => { setInfoCollapsed(true); if (mobileView === 'info') setMobileView('conversation'); }}>
              <svg className="icon"><use href="#i-close" /></svg>
            </button>
          </div>

          {isElie ? (
            <>
              <div className="profile-block">
                <div className="avatar-fallback" style={{ background: '#f6f7f9' }}>
                  <ElieIcon size={40} />
                </div>
                <div className="p-name">Elie</div>
                <div className="p-line">Your VaRoom search assistant</div>
              </div>
              <section className="info-section elie-about">
                <div className="info-section-head"><span className="label">About Elie</span></div>
                <p>Elie helps you find real VaRoom spaces using natural language. Ask about stays, event venues, offices, locations, budgets, or guest capacity.</p>
              </section>
            </>
          ) : (
            activeConversation && (
              <ConversationInfo
                conversation={activeConversation}
                avatar={(
                  <ConversationAvatar
                    url={activeConversation.participant?.avatar_url}
                    name={activeConversation.participant?.full_name || activeConversation.participant?.username || 'User'}
                    size={40}
                    fontSize={14}
                  />
                )}
                online={presenceKnownId === activeId ? isCurrentOnline : null}
                messages={messages}
                api={api}
                onOpenImage={(url, alt) => setSelectedPhotoPreview({ url, alt })}
                onOpenFile={(attachmentId) => { void openAttachment(attachmentId); }}
                onReport={() => setReportSheetOpen(true)}
                onBlock={() => {
                  const person = activeConversation.participant;
                  window.alert(`Blocking ${person?.full_name || person?.username || 'this user'} is not available yet.`);
                }}
              />
            )
          )}
          </>
          )}
        </aside>

      </div>



      {/* Message actions menu (one at a time) */}
      {messageMenu && (
        <MessageActionMenu
          x={messageMenu.x}
          y={messageMenu.y}
          items={messageActionItems({ pinned: Boolean(messageMenu.message.pinned_at), ownMessage: messageMenu.message.sender_id === userId })}
          onSelect={(action) => { void performMessageAction(messageMenu.message, action); }}
          onClose={closeMessageMenu}
        />
      )}

      {/* Short status notes ("Copied", send failures), announced to screen readers */}
      <div className="chat-status-note" role="status" aria-live="polite" hidden={!statusNote}>{statusNote}</div>

      {/* Full Photo Modal Viewer */}
      {selectedPhotoPreview && (
        <ImagePreview url={selectedPhotoPreview.url} alt={selectedPhotoPreview.alt} onClose={closePhotoPreview} />
      )}

    </>
  );
}

// The icon rail (legacy chats.html): Home, Messages, Calendar, and Analytics for hosts.
type RailItem = { label: string; href: string; icon: string; count?: 'chats' | 'bookings' };
function railItems(role: 'host' | 'client'): RailItem[] {
  return [
    { label: 'Home', href: role === 'host' ? '/host-home' : '/client-home', icon: 'i-home' },
    { label: 'Messages', href: '/chats', icon: 'i-chat', count: 'chats' },
    { label: 'Calendar', href: '/bookings', icon: 'i-calendar', count: 'bookings' },
    ...(role === 'host' ? [{ label: 'Analytics', href: '/analytics', icon: 'i-chart' }] : []),
  ];
}

// The app's mobile navigation shows on the inbox (legacy loaded it on Chats).
(ChatsPage as unknown as { appNavigation: boolean }).appNavigation = true;

// Preserve self-contained full-screen dashboard app shell outside ClientLayout and HostLayout
ChatsPage.getLayout = function getLayout(page: React.ReactNode) {
  return page;
};
