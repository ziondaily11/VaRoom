import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import { actingHostFor, useWorkspace } from '../lib/team/team';
import chatCache, {
  ChatConversation,
  ChatMessage,
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
import ConversationAvatar from '../components/chat/ConversationAvatar';
import { renderMessageBody } from '../components/chat/MessageBody';
import MessageActionMenu, { messageActionItems, type MessageAction } from '../components/chat/MessageActionMenu';
import { messageCopyText, messageSummary, pastedImage, photoCaption } from '../lib/chat/messageActions';
import { localUrls, mergeServerMessages, messageKey, reconcileThread, type OptimisticChatMessage } from '../lib/chat/optimisticMessages';
import { AttachmentThumb, ImagePreview, ListingCard, ListingEnquiryCard, PhotoAlbum, PhotoBubble, ReplyThumb, VoiceCard, type ViewerImage } from '../components/chat/MessageMedia';
import { loadEnquiryListing } from '../lib/chat/listingEnquiry';
import { ALBUM_MAX, addToSelection, albumAt, albumCaption, albumStatus } from '../lib/chat/photoAlbums';
import MessageMeta from '../components/chat/MessageMeta';
import MediaPreviewComposer from '../components/chat/MediaPreviewComposer';
import { useProfileChatSettings } from '../components/chat/useProfileChatSettings';
import { useQuickReplies } from '../components/chat/useQuickReplies';
import QuickReplyPicker from '../components/chat/QuickReplyPicker';
import { matchQuickReplies, slashQuery, type QuickReply } from '../lib/chat/quickReplies';
import { activeChatTheme, chatShellStyle, DEFAULT_CHAT_THEME, type ChatThemeId } from '../lib/chat/chatThemes';
import {
  archiveOnServer, archiveStatusNote, bumpInbox, conversationPreview, conversationRouteQuery, deleteChatsQuestion,
  deleteOnServer, deleteStatusNote, emptyInboxCopy, filterInbox, inboxMenuItems, requestedConversation, restoreChats,
  toggleSelection,
} from '../lib/chat/inbox';
import {
  alreadyShown, appendUnseen, bubbleStatus, canActOnMessage as canActOnThreadMessage, chatLayoutClasses, chatSettingsHref,
  endsTyping, farFromLatest, followConversationScreen, headerStatus, lastMessage, LONG_PRESS_MS, messageContextMenu,
  messageRowClass, messagesUrl, movedTooFar, newerMessagesUrl, postChatReport, railClick, railItems, runServerMessageAction,
  shouldAnnounceTyping, showsLoadError, showsTypingFrom, typingEnabled, TYPING_SHOW_MS, unseenMessages, uploadFailed,
  uploadSending,
} from '../lib/chat/thread';
import {
  clearActiveFormatting, composerKeyAction, copyText, fileDestination, newAlbumId, optimisticUpload, pendingFileLabel,
  postListingMessage, previewUrlFor, releasePreviewUrls, saveAttachmentMessages, sendComposerMessage, uploadAttachment,
  uploadContent,
} from '../lib/chat/composer';
import { awaitStylesheet, stylesheetApplied } from '../lib/chat/chatsStylesheet';
import { readStored, resolveSettings, writeStored } from '../lib/chat/chatSettings';
import { messageStatus, type ChatApi } from '../lib/chat/chatMedia';
import ShareListingSheet from '../components/chat/ShareListingSheet';
import { useElie } from '../components/chat/useElie';
import { ElieHistoryPanel, ElieThread } from '../components/chat/ElieThread';
import ConversationInfo from '../components/chat/ConversationInfo';
import ReportSheet from '../components/chat/ReportSheet';
import ChatSettings, { ChatSettingsStyles } from '../components/chat/ChatSettings';
import { useCounts } from '../lib/counts/countsStore';
import { isModifiedClick } from '../lib/navigation/clicks';
import { useChatViewport } from '../components/chat/useChatViewport';
import { keepsKeyboardOpen } from '../lib/chat/chatViewport';

const { chatsCssHref } = require('../lib/chatsCssAssets');

/** Chats' stylesheet has loaded and applies (it is in the page when /chats is opened directly). */
function chatsStylesheetApplied(): boolean {
  return stylesheetApplied(document.styleSheets, chatsCssHref);
}

const ELIE_ID = 'elie';


/** Remounts when the account starts or stops working as a company (Settings → Team), so nothing of the other inbox stays. */
export default function ChatsPage(props: { initialConversationId?: string } = {}) {
  const { user } = useAuth();
  const workspace = useWorkspace(user?.id || null);
  const inbox = workspace && workspace.roles.includes('messaging') ? workspace.hostId : 'own';
  return <ChatsView key={inbox} {...props} />;
}

function ChatsView({ initialConversationId }: { initialConversationId?: string } = {}) {
  const router = useRouter();

  // Session & User
  const [session, setSession] = useState<Session | null>(null);
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
  // The inbox shows chats, or the archived ones (Chat Settings, ?archived=1).
  const [inboxView, setInboxView] = useState<'all' | 'archived'>('all');
  // A chat's menu in the inbox (right-click, or long-press on phones).
  const [inboxMenu, setInboxMenu] = useState<{ conversation: ChatConversation; x: number; y: number } | null>(null);
  // Chats ticked in selection mode (null: not selecting), for archiving or deleting together.
  const [selectedChats, setSelectedChats] = useState<Set<string> | null>(null);
  // The conversation whose other person is typing (shown in the header).
  const [typingInConversation, setTypingInConversation] = useState<string | null>(null);
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
  // Photos waiting in the preview to be sent together (up to ALBUM_MAX).
  const [pendingPreviewFiles, setPendingPreviewFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  // The photo viewer: one photo, or an album to page through.
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<{ items: ViewerImage[]; index: number } | null>(null);
  const [reportSheetOpen, setReportSheetOpen] = useState<boolean>(false);
  const [searchPlaceholder, setSearchPlaceholder] = useState<string>('Search conversations...');
  const counts = useCounts();

  // Elie State
  const isElie = activeId === ELIE_ID;
  const [elieHistoryOpen, setElieHistoryOpen] = useState<boolean>(false);
  // Elie is the signed-in person's own assistant, also while working as a company.
  const elie = useElie(session?.user.id || null);
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
  const activeChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  // Typing indicators (Chat Settings): off means not announcing and not showing.
  const typingOnRef = useRef(true);
  const mountedRef = useRef<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const desktopEditorRef = useRef<HTMLDivElement | null>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  // A long-press opened the inbox menu: the tap that ends it must not open the chat.
  const inboxPressOpenedRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const statusNoteTimerRef = useRef<number | null>(null);
  const sendingRef = useRef<boolean>(false);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  // Active state synchronization refs to break cyclic dependencies
  const sessionRef = useRef<Session | null>(session);
  sessionRef.current = session;
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;
  const messagesStateRef = useRef<(ChatMessage | OptimisticChatMessage)[]>(messages);
  messagesStateRef.current = messages;
  // Local images of uploads, released once no message in the thread shows
  // them (another conversation opened, or the page closed).
  const localImageUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const tracked = localImageUrlsRef.current;
    const inUse = localUrls(messages);
    tracked.forEach((url) => {
      if (!inUse.has(url)) { URL.revokeObjectURL(url); tracked.delete(url); }
    });
    inUse.forEach((url) => tracked.add(url));
  }, [messages]);
  useEffect(() => {
    const tracked = localImageUrlsRef.current;
    return () => { tracked.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);
  const routerRef = useRef(router);
  routerRef.current = router;

  // Authenticated fetch helper
  const api = useCallback<ChatApi>(async (url: string, options: RequestInit = {}) => {
    const token = sessionRef.current?.access_token || (window.supabaseClient ? (await window.supabaseClient.auth.getSession())?.data?.session?.access_token : null);
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
  // The other person deactivated their account: the chat stays readable, the composer gives way to a note.
  const participantDeactivated = Boolean(!isElie && activeConversation?.participant?.deactivated);

  const isCurrentOnline = useMemo(() => {
    if (!activeId || isElie) return false;
    return onlineUsers.has(activeId);
  }, [activeId, isElie, onlineUsers]);

  useChatViewport({ shellRef: appShellRef, messagesRef, composerRef, textareaRef: mobileTextareaRef });

  const emptyCopy = emptyInboxCopy(role);

  const closePhotoPreview = useCallback(() => setSelectedPhotoPreview(null), []);

  // The photo waiting to be shared: one object URL, released when it changes.
  const previewUrlsRef = useRef(new Map<File, string>());
  const pendingPreviewUrls = useMemo(() => pendingPreviewFiles.map((file) => (
    previewUrlFor(file, previewUrlsRef.current, (f) => URL.createObjectURL(f))
  )), [pendingPreviewFiles]);
  useEffect(() => {
    releasePreviewUrls(previewUrlsRef.current, pendingPreviewFiles, (url) => URL.revokeObjectURL(url));
  }, [pendingPreviewFiles]);
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);
  useEffect(() => {
    if (!pendingPreviewFiles.length) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPendingPreviewFiles([]);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingPreviewFiles.length]);

  const pinnedMessage = useMemo(() => {
    return messages.find((m) => m.pinned_at && !m.deleted_at) || null;
  }, [messages]);

  // Scroll to bottom smoothly
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    }
  }, []);

  // "Back to latest" shows once the thread is scrolled well above the newest
  // message; the state changes only when that crosses the threshold.
  const [showScrollLatest, setShowScrollLatest] = useState(false);
  const scrollFrameRef = useRef<number | null>(null);
  const onMessagesScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const list = messagesRef.current;
      if (!list) return;
      setShowScrollLatest(farFromLatest(list));
    });
  }, []);
  useEffect(() => () => { if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current); }, []);
  // A newly opened conversation starts at its latest message.
  useEffect(() => { setShowScrollLatest(false); }, [activeId]);

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

  // Reading or sending messages changes the unread counts: refresh the
  // shared store now rather than waiting for it to go stale.
  const updateSidebarCounts = useCallback(() => {
    if (typeof window !== 'undefined' && window.VaRoomCounts) void window.VaRoomCounts.refresh();
  }, []);

  // Fetch conversations list
  const loadConversations = useCallback(async (targetUserId?: string, targetSession?: Session | null) => {
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
        const res = await api<{ conversations?: ChatConversation[] }>('/api/chat/conversations');
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
    setConversations((prev) => bumpInbox(prev, conversationId, lastMessage));
  }, []);

  // Select conversation & establish Realtime channel
  const clearTyping = useCallback(() => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    setTypingInConversation(null);
  }, []);
  const showTyping = useCallback((conversationId: string) => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    setTypingInConversation(conversationId);
    typingTimerRef.current = window.setTimeout(() => setTypingInConversation(null), TYPING_SHOW_MS);
  }, []);
  useEffect(() => () => { if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current); }, []);

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
      const nextQuery = conversationRouteQuery(routerRef.current.query, id);
      if (nextQuery) routerRef.current.replace({ pathname: '/chats', query: nextQuery }, undefined, { shallow: true });
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
        const res = await api<{ messages?: ChatMessage[] }>(messagesUrl(id, newest?.created_at));
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
        if (showsLoadError(cached)) setMessagesError(true);
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async (payload: { new?: { id?: string; sender_id?: string } }) => {
        if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current) return;
        // Their message arrived: they have stopped typing.
        if (endsTyping(payload.new, currentUserId)) clearTyping();
        // Messages this page already shows (our own sends) need no request.
        if (alreadyShown(messagesStateRef.current, payload.new?.id)) return;

        try {
          // Everything after the newest message shown: one request.
          const res = await api<{ messages?: ChatMessage[] }>(newerMessagesUrl(id, messagesStateRef.current));
          if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current || !mountedRef.current) return;
          const incoming: ChatMessage[] = unseenMessages(messagesStateRef.current, res.messages || []);
          if (!incoming.length) return;
          // Our own upload's copy takes the optimistic row's place.
          setMessagesState((prev) => mergeServerMessages(prev, incoming));
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
      // The other person is typing (sent by announceTyping on their side).
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload?: { user_id?: string } }) => {
        if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current) return;
        if (!showsTypingFrom(payload, currentUserId, typingOnRef.current)) return;
        showTyping(id);
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
  }, [api, scrollToBottom, updateSidebarCounts, bumpConversation, clearTyping, showTyping]);

  // Role follows the verified account's profile from AuthProvider.
  const { profile: ownProfile, user: ownUser } = useAuth();
  const workingAs = useWorkspace(ownUser?.id || null);
  const verifiedRole = workingAs && workingAs.roles.includes('messaging') ? 'host' : accountRole(ownProfile);
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
      // Messaging staff working as a company see its chats (Settings → Team).
      const curUserId = actingHostFor(currentSession.user.id, 'messaging');
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
            const client = window.supabaseClient;
            if (client && activeChannelRef.current) client.removeChannel(activeChannelRef.current);
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
          const client = window.supabaseClient;
          if (client && activeChannelRef.current) client.removeChannel(activeChannelRef.current);
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
  // ?archived=1 (from the phone's Chat Settings) opens the archived chats.
  const routerQueryArchived = router.query.archived === '1';
  useEffect(() => { if (routerQueryArchived) setInboxView('archived'); }, [routerQueryArchived]);

  const routerQueryC = router.query.c as string | undefined;

  // "Chat" on a listing (?c=…&listing=…): the person is asking about that
  // listing. Its card shows above the composer and travels with the next
  // message, so the host and Elie see which listing the question is about.
  const [enquiry, setEnquiry] = useState<{ conversationId: string; listing: ChatListingSummary } | null>(null);
  const routerQueryListing = typeof router.query.listing === 'string' ? router.query.listing : null;
  useEffect(() => {
    if (!routerQueryListing || !routerQueryC) return undefined;
    const conversationId = routerQueryC;
    let cancelled = false;
    loadEnquiryListing(getSupabaseClient(), routerQueryListing)
      .then((listing) => { if (!cancelled && listing) setEnquiry({ conversationId, listing }); })
      .catch(() => { /* No card: the chat still opens. */ });
    return () => { cancelled = true; };
  }, [routerQueryListing, routerQueryC]);
  // The card is used (sent with a message) or removed: the URL keeps just the conversation.
  const dropEnquiry = () => {
    setEnquiry(null);
    if (routerRef.current?.query.listing) {
      routerRef.current.replace({ pathname: '/chats', query: activeIdRef.current ? { c: activeIdRef.current } : {} }, undefined, { shallow: true });
    }
  };
  const enquiryHere = enquiry && enquiry.conversationId === activeId && !isElie ? enquiry : null;
  const routerQueryConversation = router.query.conversation as string | undefined;

  useEffect(() => {
    if (!userId) return;
    const requested = requestedConversation(routerQueryC, routerQueryConversation, activeIdRef.current);
    if (requested) {
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

  // The app's bottom navigation (phones and small tablets, up to 860px) shows
  // with the inbox only, never over a conversation's composer. Up to 760px the
  // inbox and a conversation are separate screens; from 761px they sit side by
  // side, so it hides whenever a conversation is open. Rechecked on rotation.
  useEffect(() => followConversationScreen(window, document.body, mobileView, activeId), [mobileView, activeId]);
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

    // Standard conversation message send (lib/chat/composer sendComposerMessage):
    // one at a time; the composer is cleared only after the server accepts it.
    if (sendingRef.current) return;
    const conversationId = activeId;
    const currentReply = replyTo;
    const currentEnquiry = enquiry && enquiry.conversationId === activeId ? enquiry : null;
    const fileToSend = pendingFile;
    const textareaHadFocus = document.activeElement === mobileTextareaRef.current;
    try {
      const sent = await sendComposerMessage({
        conversationId,
        content,
        plainText,
        reply: currentReply,
        listingId: currentEnquiry ? currentEnquiry.listing.id : undefined,
        file: fileToSend,
      }, {
        api,
        lock: sendingRef,
        uploadFile: (file, caption) => {
          setPendingFile(null);
          void handleUploadAttachment(file, 'file', caption);
        },
        onAccepted: () => {
          // Accepted: clear the composer (also if the user has switched conversation).
          if (currentEnquiry) dropEnquiry();
          setComposerText('');
          resetDesktopComposer();
          if (currentReply) setReplyTo(null);
          if (textareaHadFocus) mobileTextareaRef.current?.focus();
        },
      });
      if (!sent) return;
      if (sent.length && mountedRef.current && activeIdRef.current === conversationId) {
        setMessagesState((prev) => appendUnseen(prev, sent));
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
    clearActiveFormatting(document);
  };

  // Share listings (host): one listing message each, as legacy.
  const shareListings = async (listings: ChatListingSummary[]) => {
    const conversationId = activeIdRef.current;
    if (!conversationId || conversationId === ELIE_ID || !isHost) return;
    try {
      for (const listing of listings) {
        const sent = await postListingMessage(api, conversationId, listing);
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
    const destination = fileDestination(file, isHost, () => window.matchMedia('(max-width: 760px)').matches);
    if (destination === 'preview') addPreviewImages([file]);
    else if (destination === 'hold') setPendingFile(file);
    else if (destination === 'upload') void handleUploadAttachment(file, 'file');
  };

  // Chat Settings that act here: typing indicators.
  const chatPrefs = useProfileChatSettings(userId);
  typingOnRef.current = typingEnabled(chatPrefs);
  useEffect(() => { if (chatPrefs && !chatPrefs.typingIndicators) clearTyping(); }, [chatPrefs, clearTyping]);

  // Bubble colours (Chat Settings → Theme): the account's theme, or this
  // browser's copy of it until the account's settings have loaded.
  const [storedTheme, setStoredTheme] = useState<ChatThemeId>(DEFAULT_CHAT_THEME);

  // Chats' stylesheet: part of the page when /chats is opened directly.
  // Arriving from another page it loads now, and the page stays hidden until
  // it applies, so the unstyled page never shows. Released on leaving.
  const [stylesReady, setStylesReady] = useState(() => typeof document === 'undefined' || chatsStylesheetApplied());
  const addedStylesheetRef = useRef<HTMLLinkElement | null>(null);
  useEffect(() => () => { addedStylesheetRef.current?.remove(); }, []);
  useEffect(() => {
    if (stylesReady) return undefined;
    // Never stays hidden: shown after 4 s whatever happens (lib/chat/chatsStylesheet).
    const { added, stop } = awaitStylesheet(document, chatsCssHref, () => setStylesReady(true), window);
    if (added) addedStylesheetRef.current = added;
    return stop;
  }, [stylesReady]);
  useEffect(() => {
    try { setStoredTheme(resolveSettings(readStored(window.localStorage), null).chatTheme); } catch { /* Default theme. */ }
  }, []);
  useEffect(() => {
    if (!chatPrefs) return;
    try { writeStored(window.localStorage, 'chatTheme', chatPrefs.chatTheme); } catch { /* Kept for this visit. */ }
  }, [chatPrefs]);
  const bubbleTheme = activeChatTheme(chatPrefs, storedTheme);
  const bubbleThemeStyle = useMemo(() => chatShellStyle(bubbleTheme, stylesReady), [bubbleTheme, stylesReady]);

  // Tell the other person "typing…" (at most every 2.5 s), unless turned off.
  const announceTyping = () => {
    const channel = activeChannelRef.current;
    const now = Date.now();
    if (!channel || !shouldAnnounceTyping({ isElie, hasChannel: true, typingOn: typingOnRef.current, lastSent: lastTypingSentRef.current, now })) return;
    lastTypingSentRef.current = now;
    void channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: userIdRef.current } });
  };

  // Archive or unarchive chats for this person (shown at once; any the server refuses go back).
  const archiveChats = async (conversationIds: string[], archived: boolean) => {
    if (!conversationIds.length) return;
    const apply = (ids: string[], value: boolean) => {
      setConversations((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, archived: value } : c)));
      if (userId) ids.forEach((id) => { updateInboxConversation(userId, id, { archived: value }).catch(() => {}); });
    };
    apply(conversationIds, archived);
    const failed = await archiveOnServer(api, conversationIds, archived);
    if (failed.length) {
      console.error('Unable to update the archive for', failed.length, 'chats');
      apply(failed, !archived);
    }
    const done = conversationIds.length - failed.length;
    const note = archiveStatusNote(done, failed.length, archived);
    showStatusNote(note.text, note.ms);
    if (done) updateSidebarCounts();
  };
  const setConversationArchived = (conversationId: string, archived: boolean) => archiveChats([conversationId], archived);

  // Closes the open conversation (it was deleted): back to the inbox.
  const closeConversation = () => {
    const client = getSupabaseClient();
    if (client && activeChannelRef.current) client.removeChannel(activeChannelRef.current);
    activeChannelRef.current = null;
    activeIdRef.current = null;
    setActiveId(null);
    setMessagesState([]);
    setReplyTo(null);
    setMobileView('inbox');
    routerRef.current?.replace({ pathname: '/chats' }, undefined, { shallow: true });
  };

  // "Delete chat": cleared for this person only (all their conversations with
  // the other person); it comes back with the next new message.
  const deleteChats = async (chats: ChatConversation[]) => {
    if (!chats.length) return;
    if (!window.confirm(deleteChatsQuestion(chats))) return;
    const ids = chats.map((c) => c.id);
    setConversations((prev) => prev.filter((c) => !ids.includes(c.id)));
    const { cleared, failed } = await deleteOnServer(api, chats);
    if (cleared.length) {
      if (activeIdRef.current && cleared.includes(activeIdRef.current)) closeConversation();
      if (userId) {
        cleared.forEach((id) => { setMessages(userId, id, []).catch(() => {}); });
        getInbox(userId).then((inbox) => (inbox ? setInbox(userId, inbox.filter((c) => !cleared.includes(c.id))) : undefined)).catch(() => {});
      }
      updateSidebarCounts();
    }
    if (failed.length) {
      console.error('Unable to delete', failed.length, 'chats');
      // The chats the server refused go back to the inbox.
      setConversations((prev) => restoreChats(prev, failed));
    }
    const note = deleteStatusNote(chats.length, failed.length);
    showStatusNote(note.text, note.ms);
  };

  // Selection mode: tick chats, then archive or delete them together.
  const toggleChatSelection = (conversationId: string) => {
    setSelectedChats((current) => toggleSelection(current, conversationId));
  };
  const selectedConversations = selectedChats ? conversations.filter((c) => selectedChats.has(c.id)) : [];
  // Another view or account: start again.
  useEffect(() => { setSelectedChats(null); }, [inboxView, userId]);
  useEffect(() => {
    if (!selectedChats) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedChats(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedChats]);

  // Desktop right-click on an inbox chat; on phones the long-press below opens the menu.
  const onInboxContextMenu = (event: React.MouseEvent, conversation: ChatConversation) => {
    event.preventDefault();
    if (window.matchMedia('(max-width: 760px)').matches) return;
    setInboxMenu({ conversation, x: event.clientX, y: event.clientY });
  };
  const onInboxTouchStart = (event: React.TouchEvent, conversation: ChatConversation) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    cancelLongPress();
    inboxPressOpenedRef.current = false;
    const press = { x: touch.clientX, y: touch.clientY, timer: 0 };
    press.timer = window.setTimeout(() => {
      longPressRef.current = null;
      inboxPressOpenedRef.current = true;
      setInboxMenu({ conversation, x: press.x, y: press.y });
    }, LONG_PRESS_MS);
    longPressRef.current = press;
  };
  const closeInboxMenu = useCallback(() => setInboxMenu(null), []);

  // Adds photos to the preview (up to ALBUM_MAX sent together).
  const addPreviewImages = (files: File[]) => {
    const { files: next, dropped } = addToSelection(pendingPreviewFiles, files);
    setPendingPreviewFiles(next);
    if (dropped) showStatusNote(`Up to ${ALBUM_MAX} photos can be sent at a time.`, 3500);
  };

  // Quick replies (Chat Settings): "/" at the start of a message, or the
  // composer's button, opens them; picking one fills the composer to edit.
  const quickReplies = useQuickReplies(userId);
  const [quickPickerOpen, setQuickPickerOpen] = useState(false);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [quickIndex, setQuickIndex] = useState(0);
  const slash = isElie ? null : slashQuery(composerText);
  const quickOpen = Boolean(activeId && !isElie && (quickPickerOpen || (slash !== null && !slashDismissed)));
  const quickMatches = matchQuickReplies(quickReplies, slash ?? '');
  useEffect(() => { setQuickIndex(0); }, [slash, quickOpen]);
  useEffect(() => { if (slash === null) setSlashDismissed(false); }, [slash]);
  useEffect(() => { setQuickPickerOpen(false); }, [activeId]);
  const closeQuickReplies = () => { setQuickPickerOpen(false); setSlashDismissed(true); };
  const pickQuickReply = (reply: QuickReply) => {
    setQuickPickerOpen(false);
    setComposerText(reply.body);
    const editor = desktopEditorRef.current;
    const onDesktop = window.matchMedia('(min-width: 761px)').matches;
    if (editor && onDesktop) {
      editor.textContent = reply.body;
      editor.focus();
      const selection = window.getSelection();
      selection?.selectAllChildren(editor);
      selection?.collapseToEnd();
    } else {
      window.requestAnimationFrame(() => { mobileTextareaRef.current?.focus(); updateComposerUI(); });
    }
  };
  /** ↑ ↓ Enter Escape while the quick replies are open; true when the key was theirs. */
  const quickReplyKey = (event: React.KeyboardEvent): boolean => {
    if (!quickOpen) return false;
    if (event.key === 'Escape') { event.preventDefault(); closeQuickReplies(); return true; }
    if (!quickMatches.length) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setQuickIndex((at) => (at + (event.key === 'ArrowDown' ? 1 : -1) + quickMatches.length) % quickMatches.length);
      return true;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      pickQuickReply(quickMatches[Math.min(quickIndex, quickMatches.length - 1)]);
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (!quickPickerOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.qr-picker, .fmt-qr')) setQuickPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [quickPickerOpen]);

  // Ctrl+V of a screenshot or a copied image opens the photo preview, as
  // choosing a photo does; text pastes are left to the composer.
  const onComposerPaste = (event: React.ClipboardEvent) => {
    if (isElie || !activeId) return;
    const image = pastedImage(event.clipboardData);
    if (!image) return;
    event.preventDefault();
    addPreviewImages([image]);
  };

  // Upload attachments & send. Photos chosen together (up to ALBUM_MAX) share
  // an album id: they upload in parallel and are saved in order, so the album
  // keeps its order and notifies once. Each shows at once (optimistic) and
  // keeps its place and image when the server's copy arrives.
  const sendAttachments = async (files: File[], kind: 'photo' | 'file', caption?: string) => {
    if (!activeId || isUploading || !files.length) return;
    const conversationId = activeId;
    const albumId = newAlbumId(kind, files.length, () => crypto.randomUUID());
    const uploads = files.map((file, index) => ({
      file,
      tempId: `optimistic-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
      // The caption belongs to the first photo; the others carry their file name.
      content: uploadContent(index, caption, file.name),
      localUrl: URL.createObjectURL(file),
    }));
    const createdAt = Date.now();
    setMessagesState((prev) => [...prev, ...uploads.map(({ file, tempId, content, localUrl }, index) => optimisticUpload({
      tempId,
      conversationId,
      senderId: userId || '',
      content,
      createdAt: new Date(createdAt + index).toISOString(),
      kind,
      albumId,
      fileName: file.name,
      localUrl,
    }))]);
    setPendingPreviewFiles([]);
    setTimeout(() => scrollToBottom(true), 50);

    const markFailed = (tempId: string) => setMessagesState((prev) => prev.map((m) => (m.id === tempId
      ? { ...m, _failed: true } as OptimisticChatMessage
      : m)));

    // 1–3: each file uploads straight to storage, all at once.
    const uploaded = uploads.map(({ file, tempId }) => uploadAttachment({
      api,
      fetchFn: (input, init) => fetch(input, init),
      conversationId,
      file,
      kind,
      // The server's copy of this message is recognised by its attachment.
      onReserved: (attachmentId) => setMessagesState((prev) => prev.map((m) => (m.id === tempId ? { ...m, attachment_id: attachmentId } : m))),
    }));
    // Nothing waits on a failed upload before its turn below.
    uploaded.forEach((promise) => { promise.catch(() => {}); });

    setIsUploading(true);
    try {
      // 4: the messages are saved in the chosen order.
      await saveAttachmentMessages({
        api,
        conversationId,
        kind,
        albumId,
        uploads: uploads.map(({ tempId, content }, index) => ({ tempId, content, upload: uploaded[index] })),
        onSent: (sent) => {
          if (!mountedRef.current) return;
          // The real message takes the optimistic one's place (or Realtime already
          // put it there), keeping the local image so the photo holds its size.
          if (activeIdRef.current === conversationId) setMessagesState((prev) => mergeServerMessages(prev, [sent]));
          if (userId) {
            appendMessage(userId, conversationId, sent).catch(() => {});
            updateInboxConversation(userId, conversationId, { lastMessage: sent }).catch(() => {});
          }
          bumpConversation(conversationId, sent);
        },
        onFailed: markFailed,
      });
      setTimeout(() => scrollToBottom(true), 50);
    } finally {
      setIsUploading(false);
    }
  };
  const handleUploadAttachment = (file: File, kind: 'photo' | 'file', caption?: string) => sendAttachments([file], kind, caption);

  // ── Message actions (legacy chat-data.js performMessageAction) ──

  // Person-to-person chats only (Elie messages are not stored there).
  // Every kind of message: text, photos, files, voice notes and listings.
  const canActOnMessage = (m: ChatMessage): boolean => canActOnThreadMessage(m, isElie);

  const openMessageMenu = (message: ChatMessage, x: number, y: number) => {
    if (!canActOnMessage(message)) return;
    setMessageMenu({ message, x, y });
  };

  // Desktop right-click; on phones the long-press below opens the menu.
  const onMessageContextMenu = (event: React.MouseEvent, message: ChatMessage) => {
    if (!canActOnMessage(message)) return;
    const response = messageContextMenu(window.matchMedia('(max-width: 760px)').matches, event.target as Element);
    if (response === 'native') return;
    event.preventDefault();
    if (response === 'open') openMessageMenu(message, event.clientX, event.clientY);
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
    }, LONG_PRESS_MS);
    longPressRef.current = press;
  };

  const onMessageTouchMove = (event: React.TouchEvent) => {
    const press = longPressRef.current;
    if (!press || !event.touches.length) return;
    const touch = event.touches[0];
    if (movedTooFar(press, touch)) cancelLongPress();
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
    // Clipboard API unavailable or denied: copied from a selected textarea.
    const copied = await copyText(messageCopyText(message), { clipboard: navigator.clipboard, doc: document });
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
    const res = await api<{ messages?: ChatMessage[] }>(messagesUrl(conversationId));
    const list: ChatMessage[] = res.messages || [];
    const currentUserId = userIdRef.current;
    if (currentUserId) setMessages(currentUserId, conversationId, list).catch(() => {});
    // Uploads in progress stay; a sent photo keeps its local image and size.
    if (mountedRef.current && activeIdRef.current === conversationId) setMessagesState((prev) => reconcileThread(prev, list));
    bumpConversation(conversationId, lastMessage(list));
    if (currentUserId) updateInboxConversation(currentUserId, conversationId, { lastMessage: lastMessage(list) }).catch(() => {});
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
    // Pin, delete for me, delete for everyone (confirmed): then a full refresh.
    await runServerMessageAction({
      action,
      messageId: message.id,
      conversationId: () => activeIdRef.current,
      api,
      confirm: (question) => window.confirm(question),
      alert: (text) => window.alert(text),
      refresh: refreshConversation,
    });
  };

  const closeMessageMenu = useCallback(() => setMessageMenu(null), []);

  // Report the other person (legacy openReportSheet).
  const submitReport = async (reason: string, details: string) => {
    const conversationId = activeIdRef.current;
    if (!conversationId || conversationId === ELIE_ID) return;
    try {
      await postChatReport(api, conversationId, reason, details);
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
      void router.push(chatSettingsHref(router.asPath));
      return;
    }
    setInfoCollapsed(false);
    setChatSettingsEmbedded(true);
  };

  // Generate clean, readable plain-text previews for inbox rows (no literal HTML tags)
  // Filtered inbox contacts
  const archivedCount = useMemo(() => conversations.filter((c) => c.archived).length, [conversations]);
  const filteredConversations = useMemo(() => filterInbox(conversations, inboxView, searchQuery), [conversations, inboxView, searchQuery]);

  // Attachments are served through a short-lived signed URL; the download
  // route needs the session token and returns that URL as JSON.
  const openAttachment = async (attachmentId: string) => {
    try {
      const result = await api<{ url?: string }>(`/api/chat/attachments/${encodeURIComponent(attachmentId)}/download`);
      if (result?.url) window.open(result.url, '_blank', 'noopener');
    } catch (err) {
      console.error('Attachment unavailable:', err);
      alert('Unable to open this file. Please try again.');
    }
  };

  const layoutClasses = chatLayoutClasses({ mobileView, activeId, isElie, infoCollapsed, chatSettingsEmbedded });

  return (
    <>
      <Head>
        <title>{activeConversation?.participant?.full_name ? `${activeConversation.participant.full_name} · Messages` : 'Messenger Dashboard'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
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
          <symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m5 9 7 7 7-7"/></symbol>
          <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
          <symbol id="i-archive" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></symbol>
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
          <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z"/></symbol>
          <symbol id="i-list-sq" viewBox="0 0 24 24"><rect x="3.7" y="5.2" width="1.6" height="1.6"/><rect x="3.7" y="11.2" width="1.6" height="1.6"/><rect x="3.7" y="17.2" width="1.6" height="1.6"/><path d="M9 6h11M9 12h11M9 18h11"/></symbol>
          <symbol id="i-reply" viewBox="0 0 24 24"><path d="M9 10 4 14l5 4v-3c6 0 8 2 10 5-1-6-4-10-10-10z"/></symbol>
          <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></symbol>
          <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 5.5v13l11-6.5Z"/></symbol>
          <symbol id="i-phone" viewBox="0 0 24 24"><path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1.2 1.2 0 0 1 1.3-.3c1.1.4 2.3.6 3.5.6a1.2 1.2 0 0 1 1.2 1.2V20a1.2 1.2 0 0 1-1.2 1.2C10.6 21.2 2.8 13.4 2.8 4.2A1.2 1.2 0 0 1 4 3h3.3a1.2 1.2 0 0 1 1.2 1.2c0 1.2.2 2.4.6 3.5a1.2 1.2 0 0 1-.3 1.3L6.6 10.8Z"/></symbol>
          <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/></symbol>
          <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></symbol>
        </defs>
      </svg>

      <div ref={appShellRef} className={layoutClasses.shell} style={bubbleThemeStyle}>
        
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
                  const click = railClick(item.href, isModifiedClick(e));
                  if (click === 'native') return;
                  e.preventDefault();
                  if (click === 'navigate') void router.push(item.href);
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
        <aside className={layoutClasses.contacts}>
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

          {selectedChats && (
            <div className="inbox-select-bar" role="toolbar" aria-label="Selected chats">
              <button type="button" className="inbox-select-cancel" aria-label="Cancel selection" title="Cancel" onClick={() => setSelectedChats(null)}>
                <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
              </button>
              <span className="inbox-select-count" aria-live="polite">{selectedChats.size} selected</span>
              <button
                type="button"
                className="inbox-select-action"
                title={inboxView === 'archived' ? 'Unarchive' : 'Archive'}
                onClick={() => { const ids = Array.from(selectedChats); setSelectedChats(null); void archiveChats(ids, inboxView !== 'archived'); }}
              >
                <svg className="icon" aria-hidden="true"><use href="#i-archive" /></svg>
                <span>{inboxView === 'archived' ? 'Unarchive' : 'Archive'}</span>
              </button>
              <button
                type="button"
                className="inbox-select-action danger"
                title="Delete"
                onClick={() => { const chats = selectedConversations; setSelectedChats(null); void deleteChats(chats); }}
              >
                <svg className="icon" aria-hidden="true"><use href="#i-trash" /></svg>
                <span>Delete</span>
              </button>
            </div>
          )}

          <ul className="contact-list" id="contactList">
            {inboxView === 'archived' ? (
              /* Archived chats: back to the inbox */
              <li className="contact-item archived-header" role="button" tabIndex={0} onClick={() => setInboxView('all')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInboxView('all'); } }}>
                <span className="archived-icon" aria-hidden="true"><svg className="icon"><use href="#i-chevron-left" /></svg></span>
                <div className="contact-body"><div className="contact-name">Archived</div></div>
              </li>
            ) : (
            <>
            {/* Archived chats, always first; the number shows once a chat is archived */}
            <li className="contact-item archived-entry" role="button" tabIndex={0} onClick={() => setInboxView('archived')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInboxView('archived'); } }}>
              <span className="archived-icon" aria-hidden="true"><svg className="icon"><use href="#i-archive" /></svg></span>
              <div className="contact-body">
                <div className="contact-top">
                  <div className="contact-name">Archived</div>
                  {archivedCount > 0 && <div className="contact-time">{archivedCount}</div>}
                </div>
              </div>
            </li>
            {/* Elie Assistant Permanent Row */}
            <li
              className={`contact-item ${activeId === ELIE_ID ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => { setSelectedChats(null); selectConversation(ELIE_ID); }}
            >
              <div className="avatar-wrap" style={{ background: 'transparent' }}>
                <ElieIcon size={34} state="default" />
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
            </>
            )}

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
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.875rem' }}>
                {inboxView === 'archived' && !searchQuery.trim() ? 'No archived chats' : 'No messages found'}
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isActive = c.id === activeId;
                const isItemOnline = onlineUsers.has(c.id);
                const participant = c.participant;
                const name = participant?.full_name || participant?.username || 'User';
                const timeStr = c.lastMessage?.created_at ? new Date(c.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                const lastPreview = conversationPreview(c.lastMessage);
                const isSelected = Boolean(selectedChats && selectedChats.has(c.id));

                return (
                  <li
                    key={c.id}
                    className={`contact-item ${isActive ? 'active' : ''}${isSelected ? ' selected' : ''}`}
                    style={{ position: 'relative' }}
                    role={selectedChats ? 'checkbox' : 'button'}
                    aria-checked={selectedChats ? isSelected : undefined}
                    tabIndex={0}
                    onClick={() => {
                      if (inboxPressOpenedRef.current) { inboxPressOpenedRef.current = false; return; }
                      if (selectedChats) { toggleChatSelection(c.id); return; }
                      selectConversation(c.id);
                    }}
                    onContextMenu={(e) => onInboxContextMenu(e, c)}
                    onTouchStart={(e) => onInboxTouchStart(e, c)}
                    onTouchMove={onMessageTouchMove}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                  >
                    <div className="avatar-wrap">
                      <ConversationAvatar url={participant?.avatar_url} name={name} size={46} fontSize={14} />
                      {isSelected && (
                        <span className="select-check" aria-hidden="true"><svg className="icon"><use href="#i-check" /></svg></span>
                      )}
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
        <main className={layoutClasses.chat}>
          {/* Header */}
          {/* Header: only with a conversation open (none: the empty state fills the column) */}
          {activeId && (
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
                  <ElieIcon size={34} state={elie.thinking ? 'working' : 'default'} />
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
                  <span id="statusText">{headerStatus({ isElie, activeId, typingIn: typingInConversation, presenceKnownId, online: isCurrentOnline })}</span>
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
              ) : null}
            </div>
          </header>
          )}

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
            // Opens the pinned message in the thread, as a reply quote does.
            <div
              className="pinned-message"
              id="pinnedMessage"
              aria-live="polite"
              role="button"
              tabIndex={0}
              title="Go to pinned message"
              onClick={() => scrollToMessage(pinnedMessage.id)}
              onKeyDown={replyKeyHandler(pinnedMessage.id)}
            >
              <svg className="icon" aria-hidden="true"><use href="#i-pin" /></svg>
              <span>{messageSummary(pinnedMessage).text || 'Message'}</span>
            </div>
          )}

          {/* Messages Stream */}
          <div
            ref={messagesRef}
            onScroll={onMessagesScroll}
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
                // Photos sent together show once, as a collage, on their first message.
                const album = albumAt(messages as OptimisticChatMessage[], idx);
                if (album === 'member') return null;
                const isOut = m.sender_id === (userId || session?.user?.id);
                const isElieMsg = m.sender_id === 'elie';
                const isSystem = m.message_type === 'system';
                const prev = idx > 0 ? messages[idx - 1] : null;
                const sameSender = prev && prev.sender_id === m.sender_id;
                const isDeleted = !!m.deleted_at;

                const rowClass = messageRowClass({
                  isSystem,
                  isOut,
                  isElieMessage: isElieMsg,
                  sameSender: Boolean(sameSender),
                  isDeleted,
                  highlighted: highlightedMessageId === m.id,
                });

                const hasMedia = m.message_type === 'photo' || (m.attachment && m.attachment.kind === 'photo');
                const attachmentId = m.attachment_id || m.attachment?.id || null;
                // Uploads in progress or failed (photos and files).
                const optimistic = m as OptimisticChatMessage;
                const sending = uploadSending(m);
                // Time on every message; ticks on the user's own (none once deleted or failed).
                const meta = (
                  <MessageMeta
                    time={new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    status={bubbleStatus(m, { isOut, isDeleted, sending })}
                  />
                );
                // Sending shows as the clock in the meta; a failed upload can be dismissed.
                const uploadState = uploadFailed(m) ? (
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
                ) : null;
                const actionable = canActOnMessage(m);

                // Quote of the replied-to message (legacy makeReplyReference).
                const replyReference = m.reply_to_message_id ? (() => {
                  const original = m.reply_to_message;
                  const label = original && original.sender_id === userId ? 'You' : 'Reply';
                  const summary = messageSummary(original);
                  return (
                    <div
                      className={`message-reply-reference${summary.photoAttachmentId ? ' has-thumb' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${label}: ${summary.text}`}
                      onClick={() => scrollToMessage(m.reply_to_message_id as string)}
                      onKeyDown={replyKeyHandler(m.reply_to_message_id as string)}
                    >
                      <div className="reply-text">
                        <strong>{label}</strong>
                        <span>{summary.text}</span>
                      </div>
                      {summary.photoAttachmentId && <ReplyThumb attachmentId={summary.photoAttachmentId} api={api} />}
                    </div>
                  );
                })() : null;

                return (
                  <div
                    key={messageKey(m as OptimisticChatMessage)}
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
                    ) : album ? (
                      /* Photos sent together: one collage; each tile is its own message */
                      (() => {
                        const caption = albumCaption(album);
                        const albumMeta = (
                          <MessageMeta
                            time={new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            status={isOut ? albumStatus(album.map((photo) => (photo._failed ? null : messageStatus(photo, Boolean(photo._optimistic))))) : null}
                          />
                        );
                        const captionMessage = album.find((photo) => photoCaption(photo)) || m;
                        return (
                          <PhotoAlbum
                            photos={album.map((photo) => ({
                              id: photo.id,
                              attachmentId: photo._optimistic ? null : (photo.attachment_id || photo.attachment?.id || null),
                              localUrl: photo._localUrl,
                              alt: photo.attachment?.original_filename || 'Shared image',
                              state: photo._failed ? 'failed' : photo._optimistic ? 'sending' : null,
                            }))}
                            api={api}
                            onOpen={(items, index) => setSelectedPhotoPreview({ items, index })}
                            onDismiss={(id) => setMessagesState((prev) => prev.filter((msg) => msg.id !== id))}
                            tileProps={(id) => {
                              const photo = album.find((item) => item.id === id);
                              if (!photo || !canActOnMessage(photo)) return {};
                              // Right-click or long-press on a tile acts on that photo.
                              return {
                                onContextMenu: (e: React.MouseEvent) => { e.stopPropagation(); onMessageContextMenu(e, photo); },
                                onTouchStart: (e: React.TouchEvent) => { e.stopPropagation(); onMessageTouchStart(e, photo); },
                              };
                            }}
                            overlay={caption ? undefined : albumMeta}
                            footer={caption ? (
                              <div className="chat-message-caption">{renderMessageBody(captionMessage.body || '')}{albumMeta}</div>
                            ) : undefined}
                          />
                        );
                      })()
                    ) : hasMedia ? (
                      /* Photo attachment bubble */
                      <PhotoBubble
                        attachmentId={(m as OptimisticChatMessage)._optimistic ? null : attachmentId}
                        localUrl={(m as OptimisticChatMessage)._localUrl}
                        alt={m.attachment?.original_filename || 'Shared image'}
                        api={api}
                        onOpen={(url, alt) => setSelectedPhotoPreview({ items: [{ url, alt }], index: 0 })}
                        // With a caption the time sits on its last line; without one it sits over the image.
                        footer={photoCaption(m) ? (
                          <>
                            <div className="chat-message-caption">{renderMessageBody(m.body || '')}{meta}</div>
                            {uploadState}
                          </>
                        ) : uploadState || undefined}
                        overlay={photoCaption(m) ? undefined : meta}
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
                        {meta}
                      </div>
                    ) : (
                      /* Text bubble (a question about a listing shows its card above it, as a reply) */
                      <div className={`bubble bubble-text${m.listing ? ' has-enquiry' : ''}`}>
                        {m.listing && <ListingEnquiryCard listing={m.listing} />}
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

          {/* Back to the latest message, just above the composer */}
          {activeId && (
            <div className="scroll-latest-anchor">
              <button
                type="button"
                className="scroll-latest-btn"
                aria-label="Scroll to latest messages"
                title="Latest messages"
                hidden={!showScrollLatest}
                onClick={() => scrollToBottom(true)}
              >
                <svg className="icon" aria-hidden="true"><use href="#i-chevron-down" /></svg>
              </button>
            </div>
          )}

          {participantDeactivated && (
            <div className="chat-input-area chat-input-locked" role="status" style={{ textAlign: 'center', fontSize: '0.875rem', opacity: 0.85 }}>
              This account is deactivated, so you can&apos;t send new messages. Your conversation stays here.
            </div>
          )}

          {/* Composer Input Area */}
          <div
            ref={composerRef}
            hidden={participantDeactivated}
            className={`chat-input-area ${isElie ? 'is-elie' : ''} ${composerText.trim() ? 'has-text' : ''} ${composerText.trim() || (pendingFile && !isElie) ? 'can-send' : ''}`}
            style={participantDeactivated ? { position: 'relative', display: 'none' } : { position: 'relative' }}
            onMouseDown={(e) => {
              // Phones: tapping composer buttons keeps the keyboard open.
              if (keepsKeyboardOpen(window.matchMedia('(max-width: 760px)').matches, e.target as Element)) e.preventDefault();
            }}
          >
            {/* Phone: a file waiting to be sent with the text */}
            <div className={`mobile-preview${pendingFile && !isElie ? ' has-content' : ''}`} id="mobileComposerPreview">
              {pendingFileLabel(pendingFile, isElie)}
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
              onPaste={onComposerPaste}
              onInput={(e: React.FormEvent<HTMLDivElement>) => {
                const text = e.currentTarget.textContent || '';
                setComposerText(text);
                if (text.trim()) announceTyping();
              }}
              onKeyDown={(e) => {
                if (quickReplyKey(e)) return;
                const action = composerKeyAction(e, { editor: 'desktop', isElie, replying: Boolean(replyTo), isPhone: () => window.matchMedia('(max-width: 760px)').matches });
                if (action === 'block') {
                  e.preventDefault();
                  return;
                }
                if (action === 'cancel-reply') {
                  setReplyTo(null);
                  return;
                }
                if (action === 'send') {
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
              onPaste={onComposerPaste}
              onChange={(e) => {
                setComposerText(e.target.value);
                updateComposerUI();
                if (e.target.value.trim()) announceTyping();
              }}
              onKeyDown={(e) => {
                if (quickReplyKey(e)) return;
                const action = composerKeyAction(e, { editor: 'phone', isElie, replying: Boolean(replyTo), isPhone: () => window.matchMedia('(max-width: 760px)').matches });
                if (action === 'cancel-reply') {
                  setReplyTo(null);
                  return;
                }
                if (action === 'send') {
                  e.preventDefault();
                  handleSendMessage(e.currentTarget.value);
                }
              }}
            />

            <QuickReplyPicker
              open={quickOpen}
              items={quickMatches}
              hasAny={quickReplies.length > 0}
              activeIndex={quickIndex}
              onPick={pickQuickReply}
              onHover={setQuickIndex}
              onManage={() => { closeQuickReplies(); openChatSettings(); }}
            />

            {/* The listing this chat was opened from: sent with the next message */}
            {enquiryHere && (
              <div className="composer-listing-preview">
                <ListingEnquiryCard listing={enquiryHere.listing} compact />
                <button type="button" aria-label="Don't ask about this listing" title="Remove" onClick={dropEnquiry}>
                  <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
                </button>
              </div>
            )}

            {/* Reply preview (legacy position: the mobile grid places it on its own row) */}
            {replyTo && (() => {
              const label = replyTo.sender_id === userId ? 'Replying to you' : 'Replying to message';
              const summary = messageSummary(replyTo);
              const body = summary.text;
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
                  {summary.photoAttachmentId && <ReplyThumb attachmentId={summary.photoAttachmentId} api={api} />}
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
                <span className="divider" />
                <button type="button" className="fmt-qr" aria-label="Quick replies" title="Quick replies (or type /)" aria-expanded={quickOpen}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSlashDismissed(true); setQuickPickerOpen((was) => !was); }}>
                  <svg className="icon"><use href="#i-bolt" /></svg>
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
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) addPreviewImages(files);
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
          {pendingPreviewFiles.length > 0 && (
            <MediaPreviewComposer
              images={pendingPreviewUrls}
              maxImages={ALBUM_MAX}
              sending={isUploading}
              onCancel={() => setPendingPreviewFiles([])}
              onRemove={(index) => setPendingPreviewFiles((current) => current.filter((_, i) => i !== index))}
              onAdd={() => photoInputRef.current?.click()}
              onSend={(caption) => { void sendAttachments(pendingPreviewFiles, 'photo', caption); }}
            />
          )}
        </main>

        {/* 4. INFORMATION COLUMN (Collapsible) */}
        <aside className={layoutClasses.info} id="infoCol">
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
                <ChatSettings key={role} role={role} onOpenArchived={() => { setChatSettingsEmbedded(false); setInboxView('archived'); }} />
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
                onOpenImage={(url, alt) => setSelectedPhotoPreview({ items: [{ url, alt }], index: 0 })}
                onOpenFile={(attachmentId) => { void openAttachment(attachmentId); }}
                archived={Boolean(activeConversation.archived)}
                onArchive={() => { void setConversationArchived(activeConversation.id, !activeConversation.archived); }}
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
          items={messageActionItems({ pinned: Boolean(messageMenu.message.pinned_at), ownMessage: messageMenu.message.sender_id === userId, canCopy: Boolean(messageCopyText(messageMenu.message)) })}
          onSelect={(action) => { void performMessageAction(messageMenu.message, action); }}
          onClose={closeMessageMenu}
        />
      )}

      {inboxMenu && (
        <MessageActionMenu
          x={inboxMenu.x}
          y={inboxMenu.y}
          label="Chat actions"
          items={inboxMenuItems(inboxMenu.conversation.archived)}
          onSelect={(action) => {
            const conversation = inboxMenu.conversation;
            setInboxMenu(null);
            if (action === 'select') setSelectedChats(new Set([conversation.id]));
            else if (action === 'delete') void deleteChats([conversation]);
            else void setConversationArchived(conversation.id, action === 'archive');
          }}
          onClose={closeInboxMenu}
        />
      )}

      {/* Short status notes ("Copied", send failures), announced to screen readers */}
      <div className="chat-status-note" role="status" aria-live="polite" hidden={!statusNote}>{statusNote}</div>

      {/* Full Photo Modal Viewer */}
      {selectedPhotoPreview && (
        <ImagePreview key={`${selectedPhotoPreview.items[0]?.url}:${selectedPhotoPreview.index}`} items={selectedPhotoPreview.items} index={selectedPhotoPreview.index} onClose={closePhotoPreview} />
      )}

    </>
  );
}

// The app's mobile navigation shows on the inbox (legacy loaded it on Chats).
(ChatsPage as unknown as { appNavigation: boolean }).appNavigation = true;

// Preserve self-contained full-screen dashboard app shell outside ClientLayout and HostLayout
ChatsPage.getLayout = function getLayout(page: React.ReactNode) {
  return page;
};
