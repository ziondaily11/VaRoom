import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
import { ThinkingOrb } from 'thinking-orbs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://deaphymimdaygeavhyek.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlYXBoeW1pbWRheWdlYXZoeWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjAwNDQsImV4cCI6MjEwMjA5NjA0NH0.rbgVhuZCK1fZP7gKV5oO1OUvIT61ir23VhAYm8739SI';
const ELIE_ID = 'elie';
const ELIE_API_URL = 'https://elie1-0.onrender.com/elie/search';

function getOrInitSupabaseClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if ((window as any).supabaseClient?.auth) {
    return (window as any).supabaseClient;
  }
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    (window as any).supabaseClient = client;
    window.dispatchEvent(new Event('varoom_supabase_ready'));
    return client;
  } catch (e) {
    console.error('Unable to initialize Supabase client in Chats:', e);
    return null;
  }
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
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState<boolean>(true);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // UI Views & Drawers
  const [mobileView, setMobileView] = useState<'inbox' | 'conversation' | 'info'>('inbox');
  const [infoCollapsed, setInfoCollapsed] = useState<boolean>(true);
  const [chatSettingsEmbedded, setChatSettingsEmbedded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Attachments & Previews
  const [pendingPreviewFile, setPendingPreviewFile] = useState<File | null>(null);
  const [previewCaption, setPreviewCaption] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<{ url: string; alt: string } | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('');
  const [reportDetails, setReportDetails] = useState<string>('');

  // Elie State
  const isElie = activeId === ELIE_ID;
  const [elieHistoryOpen, setElieHistoryOpen] = useState<boolean>(false);
  const [elieHistorySessions, setElieHistorySessions] = useState<Array<{ id: string; title: string; date: string }>>([]);
  const [thinkingState, setThinkingState] = useState<'searching' | 'working' | 'solving' | null>(null);

  // Composer Text State
  const [composerText, setComposerText] = useState<string>('');

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

  // Active state synchronization refs to break cyclic dependencies
  const sessionRef = useRef<any>(session);
  sessionRef.current = session;
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;
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

  const pinnedMessage = useMemo(() => {
    return messages.find((m) => m.pinned_at && !m.deleted_at) || null;
  }, [messages]);

  // Scroll to bottom smoothly
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    }
  }, []);

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

  // Select conversation & establish Realtime channel
  const selectConversation = useCallback(async (id: string, updateRoute = true) => {
    if (!id) return;
    const client = (window as any).supabaseClient || getOrInitSupabaseClient();
    const selectionGen = ++selectionGenerationRef.current;

    const isSameConversation = activeIdRef.current === id;
    activeIdRef.current = id;
    setActiveId(id);
    setMobileView('conversation');
    setReplyTo(null);

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
      // Elie assistant conversation
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
        setTimeout(() => scrollToBottom(false), 50);
      }
    } catch (err) {
      console.error('Message sync failed:', err);
      if (selectionGen === selectionGenerationRef.current && mountedRef.current) {
        setLoadingMessages(false);
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
        if (!msgId) return;

        try {
          const res = await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages?since=${payload.new.created_at || ''}`);
          const newMsg = (res.messages || []).find((m: ChatMessage) => m.id === msgId) || (await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages`)).messages?.find((m: ChatMessage) => m.id === msgId);
          if (!newMsg) return;

          if (selectionGen === selectionGenerationRef.current && channelGen === channelGenerationRef.current && mountedRef.current) {
            setMessagesState((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              const next = [...prev, newMsg];
              appendMessage(currentUserId, id, newMsg).catch(() => {});
              return next;
            });
            setTimeout(() => scrollToBottom(true), 50);
            updateInboxConversation(currentUserId, id, { lastMessage: newMsg }).catch(() => {});
          }
        } catch (e) {
          console.error('Error fetching decrypted realtime message:', e);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async () => {
        if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current) return;
        try {
          const res = await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages`);
          if (selectionGen === selectionGenerationRef.current && channelGen === channelGenerationRef.current && mountedRef.current) {
            setMessagesState(res.messages || []);
          }
        } catch {}
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_user_deletions', filter: `conversation_id=eq.${id}` }, async () => {
        if (selectionGen !== selectionGenerationRef.current || channelGen !== channelGenerationRef.current) return;
        try {
          const res = await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages`);
          if (selectionGen === selectionGenerationRef.current && channelGen === channelGenerationRef.current && mountedRef.current) {
            setMessagesState(res.messages || []);
          }
        } catch {}
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
      });

    activeChannelRef.current = channel;
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED' && currentUserId) {
        channel.track({ user_id: currentUserId }).catch(() => {});
      }
    });
  }, [api, scrollToBottom, updateSidebarCounts]);

  // 1. Main Authentication & Session Hydration (Runs once on mount + account switcher)
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const initAuth = async () => {
      const client = (window as any).supabaseClient || getOrInitSupabaseClient();
      if (!client?.auth) return;

      const { data: { session: currentSession } } = await client.auth.getSession();
      if (!currentSession || !currentSession.user) {
        if (!cancelled) routerRef.current.push('/login?next=/chats');
        return;
      }

      if (cancelled) return;
      setSession(currentSession);
      const curUserId = currentSession.user.id;
      setUserId(curUserId);

      // Check role
      try {
        const cachedRaw = localStorage.getItem('varoom_cached_profile');
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && (parsed.role === 'host' || parsed.role === 'client')) {
            setRole(parsed.role);
          }
        }
      } catch {}

      client.from('profiles').select('role').eq('id', curUserId).maybeSingle()
        .then(({ data }: any) => {
          if (!cancelled && (data?.role === 'host' || data?.role === 'client')) {
            setRole(data.role);
            document.documentElement.setAttribute('data-role', data.role);
          }
        }).catch(() => {});
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
  const routerPathname = router.pathname;

  useEffect(() => {
    if (!userId) return;
    const requested = routerQueryC || routerQueryConversation || (routerPathname === '/elie' ? ELIE_ID : null);
    if (requested && requested !== activeIdRef.current) {
      selectConversation(requested, false);
    }
  }, [userId, routerQueryC, routerQueryConversation, routerPathname, selectConversation]);

  // Send message handler
  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend !== undefined ? textToSend : (desktopEditorRef.current?.innerHTML || composerText)).trim();
    const plainText = (desktopEditorRef.current?.textContent || content).trim();
    if (!plainText || !activeId) return;

    if (activeId === ELIE_ID) {
      // Send to Elie AI Assistant
      const userMessage: ChatMessage = {
        id: `elie-usr-${Date.now()}`,
        conversation_id: ELIE_ID,
        sender_id: userId || 'user',
        body: plainText,
        created_at: new Date().toISOString(),
      };
      setMessagesState((prev) => [...prev, userMessage]);
      setComposerText('');
      if (desktopEditorRef.current) desktopEditorRef.current.innerHTML = '';
      setThinkingState('searching');
      setTimeout(() => scrollToBottom(true), 50);

      try {
        const token = session?.access_token || ((window as any).supabaseClient ? (await (window as any).supabaseClient.auth.getSession())?.data?.session?.access_token : null);
        const res = await fetch(ELIE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'X-Correlation-ID': `CLIENT-${Date.now().toString(36).toUpperCase()}`,
          },
          body: JSON.stringify({ message: plainText, history: [] }),
        });
        const data = await res.json().catch(() => ({}));
        setThinkingState(null);
        const assistantText = data.reply || data.response || data.message || 'I found some options for you.';
        const assistantMessage: ChatMessage = {
          id: `elie-bot-${Date.now()}`,
          conversation_id: ELIE_ID,
          sender_id: 'elie',
          body: assistantText,
          created_at: new Date().toISOString(),
        };
        setMessagesState((prev) => [...prev, assistantMessage]);
        setTimeout(() => scrollToBottom(true), 50);
      } catch (err: any) {
        setThinkingState(null);
        const errorMsg: ChatMessage = {
          id: `elie-err-${Date.now()}`,
          conversation_id: ELIE_ID,
          sender_id: 'elie',
          body: 'Sorry, I had trouble connecting. Please try asking again.',
          created_at: new Date().toISOString(),
        };
        setMessagesState((prev) => [...prev, errorMsg]);
      }
      return;
    }

    // Standard conversation message send
    const currentReply = replyTo;
    setReplyTo(null);
    setComposerText('');
    if (desktopEditorRef.current) desktopEditorRef.current.innerHTML = '';

    try {
      const res = await api(`/api/chat/conversations/${encodeURIComponent(activeId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: content,
          messageType: 'text',
          replyToMessageId: currentReply?.id || undefined,
        }),
      });

      if (res?.message && mountedRef.current) {
        const sent = res.message;
        setMessagesState((prev) => {
          if (prev.some((m) => m.id === sent.id)) return prev;
          return [...prev, sent];
        });
        if (userId) {
          appendMessage(userId, activeId, sent).catch(() => {});
          updateInboxConversation(userId, activeId, { lastMessage: sent }).catch(() => {});
        }
        setTimeout(() => scrollToBottom(true), 50);
      }
    } catch (err) {
      console.error('Failed to send chat message:', err);
    }
  };

  // Upload attachment & send
  const handleUploadAttachment = async (file: File, kind: 'photo' | 'file') => {
    if (!activeId || isUploading) return;
    setIsUploading(true);

    try {
      // 1. Init upload
      const initRes = await api(`/api/chat/conversations/${encodeURIComponent(activeId)}/attachments/upload-init`, {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          kind: kind,
        }),
      });

      // 2. Direct PUT to Cloudflare R2
      const putRes = await fetch(initRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error('R2 direct upload failed');

      // 3. Finalize upload
      await api(`/api/chat/conversations/${encodeURIComponent(activeId)}/attachments/${encodeURIComponent(initRes.attachmentId)}/complete`, {
        method: 'POST',
        body: '{}',
      });

      // 4. Send attachment message
      const captionText = previewCaption.trim() || file.name;
      const res = await api(`/api/chat/conversations/${encodeURIComponent(activeId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: captionText,
          attachmentId: initRes.attachmentId,
          messageType: kind,
        }),
      });

      if (res?.message && mountedRef.current) {
        setMessagesState((prev) => [...prev, res.message]);
        if (userId) {
          appendMessage(userId, activeId, res.message).catch(() => {});
          updateInboxConversation(userId, activeId, { lastMessage: res.message }).catch(() => {});
        }
        setTimeout(() => scrollToBottom(true), 50);
      }

      setPendingPreviewFile(null);
      setPreviewCaption('');
    } catch (err) {
      console.error('Attachment upload failed:', err);
      alert('Unable to send attachment. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Message Action Handlers (Pin, Delete for me, Delete for everyone)
  const handleMessageAction = async (messageId: string, action: 'pin' | 'delete_for_me' | 'delete_for_everyone') => {
    if (!activeId) return;
    try {
      await api(`/api/chat/conversations/${encodeURIComponent(activeId)}/messages/${encodeURIComponent(messageId)}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      // Refresh thread
      const res = await api(`/api/chat/conversations/${encodeURIComponent(activeId)}/messages`);
      if (mountedRef.current) {
        setMessagesState(res.messages || []);
      }
    } catch (err) {
      console.error('Message action error:', err);
    }
  };

  // Submit User Report
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !reportReason) return;
    try {
      await api('/api/chat/reports', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: activeId,
          reason: reportReason,
          details: reportDetails || undefined,
        }),
      });
      alert('Thank you. Your report has been submitted to our safety team.');
      setReportModalOpen(false);
      setReportReason('');
      setReportDetails('');
    } catch (err) {
      alert('Unable to submit report. Please try again.');
    }
  };

  // Filtered inbox contacts
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => {
      const name = c.participant?.full_name?.toLowerCase() || '';
      const username = c.participant?.username?.toLowerCase() || '';
      const last = c.lastMessage?.body?.toLowerCase() || '';
      return name.includes(q) || username.includes(q) || last.includes(q);
    });
  }, [conversations, searchQuery]);

  return (
    <>
      <Head>
        <title>{activeConversation?.participant?.full_name ? `${activeConversation.participant.full_name} · Messages` : 'Messenger Dashboard'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="stylesheet" href="/js/varoom-dark-theme.css" />
        <link rel="stylesheet" href="/js/chats.css" />
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
          <symbol id="i-reply" viewBox="0 0 24 24"><path d="M9 10 4 14l5 4v-3c6 0 8 2 10 5-1-6-4-10-10-10z"/></symbol>
          <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></symbol>
        </defs>
      </svg>

      <div className={`app-shell ${mobileView === 'conversation' ? 'view-chat' : mobileView === 'info' ? 'view-info' : 'view-inbox'}`}>
        
        {/* 1. ICON RAIL (Fixed 78px navigation) */}
        <nav className="icon-rail" id="chatRoleNavigation" data-role={role} aria-label={role === 'host' ? 'Host navigation' : 'Client navigation'}>
          <div className="rail-top">
            <button type="button" className="rail-btn" title="Home" aria-label="Home" onClick={() => router.push(role === 'host' ? '/host-home' : '/client-home')}>
              <svg className="icon"><use href="#i-home" /></svg>
            </button>
            <button type="button" className="rail-btn active" title="Messages" aria-label="Messages" aria-current="page">
              <svg className="icon"><use href="#i-chat" /></svg>
            </button>
            <button type="button" className="rail-btn" title="Calendar" aria-label="Calendar" onClick={() => router.push('/bookings')}>
              <svg className="icon"><use href="#i-calendar" /></svg>
            </button>
            {role === 'host' && (
              <button type="button" className="rail-btn" title="Analytics" aria-label="Analytics" onClick={() => router.push('/analytics')}>
                <svg className="icon"><use href="#i-chart" /></svg>
              </button>
            )}
          </div>
          <div className="rail-bottom">
            <button type="button" className="rail-btn settings-btn" title="Settings" aria-label="Settings" onClick={() => router.push('/settings')}>
              <svg className="icon"><use href="#i-gear" /></svg>
            </button>
            <button type="button" className="rail-btn" title="Profile" aria-label="Profile" onClick={() => router.push('/profile')}>
              <svg className="icon"><use href="#i-user-circle" /></svg>
            </button>
          </div>
        </nav>

        {/* 2. CONTACTS / INBOX COLUMN */}
        <aside className="contacts-col">
          <div className="mobile-inbox-title">
            Messages
            <button className="mobile-chat-settings" type="button" aria-label="Chat settings" title="Chat settings" onClick={() => router.push('/chat-settings?returnTo=/chats')}>
              <svg className="icon"><use href="#i-gear" /></svg>
            </button>
          </div>

          <div className="search-bar">
            <div className="search-box">
              <svg className="icon"><use href="#i-search" /></svg>
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              className="compose-btn chat-settings-trigger"
              type="button"
              aria-label="Chat settings"
              title="Chat settings"
              onClick={() => {
                if (window.innerWidth <= 760) {
                  router.push('/chat-settings?returnTo=/chats');
                } else {
                  setInfoCollapsed(false);
                  setChatSettingsEmbedded((prev) => !prev);
                }
              }}
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
              <div className="contact-info">
                <div className="contact-top">
                  <div className="contact-name">Elie</div>
                </div>
                <div className="contact-bottom">
                  <div className="last-msg">Ask me anything about homes on VaRoom</div>
                </div>
              </div>
            </li>

            {loadingInbox && conversations.length === 0 ? (
              <div className="chat-skeleton-inbox" style={{ padding: '20px', color: 'var(--text-gray)' }}>
                Loading conversations...
              </div>
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
                const lastPreview = c.lastMessage?.body || (c.lastMessage?.message_type === 'photo' ? '📷 Photo' : c.lastMessage?.message_type === 'file' ? '📎 Attachment' : '');

                return (
                  <li
                    key={c.id}
                    className={`contact-item ${isActive ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectConversation(c.id)}
                  >
                    <div className="avatar-wrap">
                      {participant?.avatar_url ? (
                        <img src={participant.avatar_url} alt={name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div className="avatar-fallback" style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#24211e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      {isItemOnline && <span className="online-indicator" style={{ position: 'absolute', bottom: 2, right: 2, width: 10, height: 10, borderRadius: '50%', background: '#4ec1a0', border: '2px solid #fff' }} />}
                    </div>
                    <div className="contact-info">
                      <div className="contact-top">
                        <div className="contact-name">{name}</div>
                        <div className="msg-time">{timeStr}</div>
                      </div>
                      <div className="contact-bottom">
                        <div className="last-msg">{lastPreview}</div>
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* 3. CHAT COLUMN */}
        <main className={`chat-col ${isElie ? 'is-elie' : ''}`}>
          {/* Header */}
          <header className="chat-header">
            <button className="mobile-back" aria-label="Back to inbox" title="Back" onClick={() => setMobileView('inbox')}>
              <svg className="icon"><use href="#i-chevron-left" /></svg>
            </button>

            {isElie && (
              <button
                type="button"
                className="elie-history-toggle"
                id="elieHistoryToggle"
                aria-label="Search history"
                title="Search history"
                onClick={() => setElieHistoryOpen((prev) => !prev)}
              >
                <svg className="icon"><use href="#i-menu" /></svg>
              </button>
            )}

            <div className="chat-header-identity" onClick={() => { if (window.innerWidth <= 760) setMobileView('info'); }}>
              <div className="chat-header-avatar-wrap">
                {isElie ? (
                  <ElieIcon size={34} state={thinkingState !== null ? 'thinking' : 'default'} />
                ) : activeConversation?.participant?.avatar_url ? (
                  <img src={activeConversation.participant.avatar_url} alt="Avatar" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div className="avatar-fallback" style={{ width: 34, height: 34, borderRadius: '50%', background: '#24211e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {activeConversation?.participant?.full_name?.slice(0, 2).toUpperCase() || 'VA'}
                  </div>
                )}
              </div>
              <div>
                <div className="chat-header-name" id="chatName">
                  {isElie ? 'Elie' : activeConversation?.participant?.full_name || activeConversation?.participant?.username || 'Select a conversation'}
                </div>
                <div className="chat-header-status">
                  <span className={`dot ${isCurrentOnline ? 'online' : ''}`} id="statusDot" style={{ background: isCurrentOnline ? '#4ec1a0' : '#c7cbd1' }} />
                  <span id="statusText">{isElie ? 'VaRoom AI Assistant' : isCurrentOnline ? 'Online' : 'Offline'}</span>
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
              <button
                type="button"
                title="More actions"
                onClick={() => setReportModalOpen(true)}
              >
                <svg className="icon"><use href="#i-more" /></svg>
              </button>
            </div>
          </header>

          {/* Elie Search History Slide-out */}
          {isElie && elieHistoryOpen && (
            <section className="elie-history-panel open" id="elieHistoryPanel" aria-label="Search history">
              <div className="elie-history-head">
                <div className="elie-history-title">
                  <svg className="icon"><use href="#i-clock" /></svg>
                  <span>Search history</span>
                </div>
                <button type="button" className="elie-history-close" aria-label="Close search history" onClick={() => setElieHistoryOpen(false)}>
                  <svg className="icon"><use href="#i-close" /></svg>
                </button>
              </div>
              <div className="elie-history-list">
                <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-gray)' }}>
                  Recent search history is preserved on this device.
                </div>
              </div>
            </section>
          )}

          {/* Pinned Message Banner */}
          {pinnedMessage && (
            <div className="pinned-message" id="pinnedMessage" aria-live="polite">
              <svg className="icon" aria-hidden="true"><use href="#i-pin" /></svg>
              <span>{pinnedMessage.body}</span>
            </div>
          )}

          {/* Messages Stream */}
          <div className="messages">
            {loadingMessages ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-gray)' }}>
                Loading conversation messages...
              </div>
            ) : !activeId ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-gray)' }}>
                <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Your Messages</p>
                <p style={{ fontSize: '14px' }}>Select a conversation from the left to start messaging.</p>
              </div>
            ) : isElie && messages.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ marginBottom: '16px' }}><ElieIcon size={48} state="default" /></div>
                <h3 style={{ marginBottom: '8px' }}>Hi, I'm Elie</h3>
                <p style={{ color: 'var(--text-gray)', fontSize: '14px', maxWidth: '420px', margin: '0 auto' }}>
                  Ask me about properties, neighborhoods, pricing, or amenities in Nairobi and beyond.
                </p>
              </div>
            ) : (
              messages.map((m, idx) => {
                const isOut = m.sender_id === (userId || session?.user?.id);
                const prev = idx > 0 ? messages[idx - 1] : null;
                const sameSender = prev && prev.sender_id === m.sender_id;

                return (
                  <div
                    key={m.id}
                    data-message-id={m.id}
                    className={`message-row ${isOut ? 'out' : 'in'} ${sameSender ? 'same-sender' : ''}`}
                    style={{ position: 'relative', margin: '4px 0' }}
                  >
                    <div className="message-bubble" style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: '16px', background: isOut ? '#111' : '#f0ede6', color: isOut ? '#fff' : '#141414', alignSelf: isOut ? 'flex-end' : 'flex-start' }}>
                      {/* Replied quote reference */}
                      {m.reply_to_message && (
                        <div style={{ borderLeft: '3px solid #bd2337', paddingLeft: '8px', marginBottom: '6px', fontSize: '12px', opacity: 0.85 }}>
                          <strong>{m.reply_to_message.sender_id === userId ? 'You' : 'Reply'}:</strong> {m.reply_to_message.body || 'Message'}
                        </div>
                      )}

                      {/* Photo Attachment */}
                      {m.attachment && m.attachment.kind === 'photo' && (
                        <div style={{ marginBottom: '6px', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' }}>
                          <img
                            src={`/api/chat/attachments/${m.attachment.id}/download`}
                            alt={m.attachment.original_filename || 'Photo'}
                            style={{ maxWidth: '100%', maxHeight: '300px', display: 'block' }}
                            onClick={() => setSelectedPhotoPreview({ url: `/api/chat/attachments/${m.attachment!.id}/download`, alt: m.attachment!.original_filename || 'Photo' })}
                          />
                        </div>
                      )}

                      {/* File Attachment */}
                      {m.attachment && m.attachment.kind === 'file' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                          <svg className="icon" style={{ width: 20, height: 20 }}><use href="#i-file-text" /></svg>
                          <a href={`/api/chat/attachments/${m.attachment.id}/download`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontSize: '13px' }}>
                            {m.attachment.original_filename || 'Attachment'}
                          </a>
                        </div>
                      )}

                      {/* Message Content */}
                      <div style={{ fontSize: '14.5px', lineHeight: 1.45, wordBreak: 'break-word' }}>
                        {m.deleted_at ? <em>This message was deleted</em> : m.body}
                      </div>

                      {/* Timestamp & status */}
                      <div style={{ fontSize: '11px', opacity: 0.65, marginTop: '4px', textAlign: 'right' }}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {thinkingState !== null && isElie && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px' }}>
                <ThinkingOrb state={thinkingState || 'searching'} size={20} theme="dark" />
                <span style={{ fontSize: '13px', color: 'var(--text-gray)' }}>Thinking...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer Reply Preview */}
          {replyTo && (
            <div className="composer-reply-preview" style={{ padding: '8px 16px', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
              <div>
                <strong>Replying: </strong>
                <span style={{ fontSize: '13px', color: 'var(--text-gray)' }}>{replyTo.body?.slice(0, 50)}...</span>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <svg className="icon"><use href="#i-close" /></svg>
              </button>
            </div>
          )}

          {/* Composer Input Area */}
          <div className={`chat-input-area ${isElie ? 'is-elie' : ''} ${composerText.trim() ? 'can-send has-text' : ''}`} style={{ position: 'relative' }}>
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
                if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 760) {
                  e.preventDefault();
                  handleSendMessage(e.currentTarget.value);
                }
              }}
            />

            {/* Input Toolbar */}
            <div className="input-toolbar">
              <div className="format-icons" style={{ display: isElie ? 'none' : 'flex' }}>
                <button type="button" className="fmt-b" aria-label="Bold" onClick={() => document.execCommand('bold', false)}>B</button>
                <button type="button" className="fmt-i" aria-label="Italic" onClick={() => document.execCommand('italic', false)}>I</button>
                <button type="button" className="fmt-u" aria-label="Underline" onClick={() => document.execCommand('underline', false)}>U</button>
              </div>

              <div className="attach-icons" data-chat-composer-actions>
                <ChatComposerActions isElie={isElie} />
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
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadAttachment(file, 'file');
                e.target.value = '';
              }}
            />
          </div>
        </main>

        {/* 4. INFORMATION COLUMN (Collapsible) */}
        <aside className={`info-col ${infoCollapsed ? 'collapsed' : ''}`} id="infoCol">
          <div className="info-title-row">
            <div className="info-title">{chatSettingsEmbedded ? 'Chat Settings' : 'Information'}</div>
            <button className="info-close-btn" title="Close" onClick={() => { setInfoCollapsed(true); setChatSettingsEmbedded(false); }}>
              <svg className="icon"><use href="#i-close" /></svg>
            </button>
          </div>

          {chatSettingsEmbedded ? (
            <iframe
              className="chat-settings-frame"
              title="Chat Settings"
              src={`/chat-settings?embedded=1&role=${encodeURIComponent(role)}`}
              style={{ width: '100%', height: 'calc(100% - 60px)', border: 'none' }}
            />
          ) : (
            <>
              {/* Profile details */}
              <div className="profile-block" style={{ padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#24211e', color: '#fff', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                  {activeConversation?.participant?.avatar_url ? (
                    <img src={activeConversation.participant.avatar_url} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    activeConversation?.participant?.full_name?.slice(0, 2).toUpperCase() || 'VA'
                  )}
                </div>
                <h4 style={{ margin: '0 0 4px', fontSize: '16px' }}>{activeConversation?.participant?.full_name || 'VaRoom User'}</h4>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-gray)' }}>@{activeConversation?.participant?.username || 'user'}</p>
              </div>

              {/* Media gallery */}
              <div className="info-section info-media-section">
                <div className="info-section-head">
                  <span className="label">Shared Media</span>
                </div>
                <div className="media-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', padding: '10px 18px' }}>
                  {messages.filter((m) => m.attachment?.kind === 'photo').map((m) => (
                    <img
                      key={m.id}
                      src={`/api/chat/attachments/${m.attachment!.id}/download`}
                      alt="Media"
                      style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }}
                      onClick={() => setSelectedPhotoPreview({ url: `/api/chat/attachments/${m.attachment!.id}/download`, alt: 'Shared Media' })}
                    />
                  ))}
                </div>
              </div>

              {/* Actions Section */}
              <div className="info-section chat-actions" style={{ padding: '18px' }}>
                <div className="info-section-head"><span className="label">Actions</span></div>
                <button type="button" className="info-action info-action-report" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 0', border: 'none', background: 'none', color: 'var(--color-danger, #b42318)', cursor: 'pointer', fontSize: '14px' }} onClick={() => setReportModalOpen(true)}>
                  <svg className="icon"><use href="#i-flag" /></svg> Report User
                </button>
                <button type="button" className="info-action info-action-block" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 0', border: 'none', background: 'none', color: 'var(--text-gray)', cursor: 'pointer', fontSize: '14px' }} onClick={() => alert('Blocking users will be available in the upcoming release.')}>
                  <svg className="icon"><use href="#i-ban" /></svg> Block User
                </button>
              </div>
            </>
          )}
        </aside>

      </div>

      {/* Media Preview / Caption Dialog Before Send */}
      {pendingPreviewFile && (
        <div className="chat-media-preview-composer" role="dialog" aria-label="Preview image to share" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column' }}>
          <div className="chat-media-preview-header" style={{ padding: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="chat-media-preview-close" onClick={() => setPendingPreviewFile(null)} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}>
              <svg className="icon" style={{ width: 24, height: 24 }}><use href="#i-close" /></svg>
            </button>
          </div>
          <div className="chat-media-preview-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <img src={URL.createObjectURL(pendingPreviewFile)} alt="Preview" style={{ maxWidth: '90%', maxHeight: '70vh', objectFit: 'contain' }} />
          </div>
          <div className="chat-media-preview-footer" style={{ padding: '16px 24px', display: 'flex', gap: '12px', background: '#111' }}>
            <input
              type="text"
              placeholder="Add a caption..."
              value={previewCaption}
              onChange={(e) => setPreviewCaption(e.target.value)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #333', background: '#222', color: '#fff' }}
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => handleUploadAttachment(pendingPreviewFile, 'photo')}
              style={{ padding: '10px 20px', borderRadius: '8px', background: '#bd2337', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              {isUploading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* Full Photo Modal Viewer */}
      {selectedPhotoPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectedPhotoPreview(null)}>
          <img src={selectedPhotoPreview.url} alt={selectedPhotoPreview.alt} style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain' }} />
        </div>
      )}

      {/* User Report Modal */}
      {reportModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', color: '#111', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '440px' }}>
            <h3 style={{ margin: '0 0 12px' }}>Report User</h3>
            <form onSubmit={handleSubmitReport}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Reason</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inappropriate behavior, spam, fraud"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Details (optional)</label>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setReportModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ccc', background: 'none', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#bd2337', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Submit Report</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// Preserve self-contained full-screen dashboard app shell outside ClientLayout and HostLayout
ChatsPage.getLayout = function getLayout(page: React.ReactNode) {
  return page;
};
