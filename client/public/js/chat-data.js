(function () {
  'use strict';

  const state = { session: null, conversations: [], activeId: null, channel: null };
  const $ = (selector) => document.querySelector(selector);
  const api = async (url, options) => {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}`, ...(options && options.headers) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Chat request failed');
    return body;
  };
  const initials = (profile) => (profile && (profile.full_name || profile.username) || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const clear = (element) => { while (element && element.firstChild) element.removeChild(element.firstChild); };

  function renderConversationList() {
    const list = $('#contactList');
    clear(list);
    state.conversations.forEach((conversation) => {
      const person = conversation.participant || {};
      const preview = conversation.lastMessage && conversation.lastMessage.body || '';
      const item = document.createElement('li');
      item.className = `contact-item${conversation.id === state.activeId ? ' active' : ''}`;
      item.dataset.conversationId = conversation.id;
      item.innerHTML = `<div class="avatar-wrap"><div class="avatar-fallback" style="background:#6C63FF;">${initials(person)}</div></div>
        <div class="contact-body"><div class="contact-top"><span class="contact-name"></span><span class="contact-time"></span></div>
        <div class="contact-bottom"><span class="contact-preview"></span></div></div>`;
      item.querySelector('.contact-name').textContent = person.full_name || person.username || 'VaRoom user';
      item.querySelector('.contact-time').textContent = formatTime(conversation.lastMessage && conversation.lastMessage.created_at);
      item.querySelector('.contact-preview').textContent = preview;
      item.addEventListener('click', () => selectConversation(conversation.id));
      list.appendChild(item);
    });
  }

  function renderProfile(conversation) {
    const person = conversation && conversation.participant || {};
    const block = $('.profile-block');
    if (!block) return;
    clear(block);
    const avatar = document.createElement('div');
    avatar.className = 'avatar-fallback';
    avatar.style.background = '#6C63FF';
    avatar.textContent = initials(person);
    const name = document.createElement('div');
    name.className = 'p-name';
    name.textContent = person.full_name || person.username || 'VaRoom user';
    block.append(avatar, name);
    if (person.username) { const line = document.createElement('div'); line.className = 'p-line'; line.textContent = `@${person.username}`; block.appendChild(line); }
    if (person.phone) { const line = document.createElement('div'); line.className = 'p-line'; line.textContent = person.phone; block.appendChild(line); }
  }

  function renderMessages(messages) {
    const container = $('.messages');
    clear(container);
    messages.forEach((message) => {
      const row = document.createElement('div');
      const outgoing = message.sender_id === state.session.user.id;
      row.className = `msg-row ${outgoing ? 'out' : 'in'}`;
      row.dataset.messageId = message.id;
      if (message.message_type !== 'text') return;
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = message.body || '';
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.textContent = formatTime(message.created_at);
      row.append(bubble, meta);
      container.appendChild(row);
    });
    container.scrollTop = container.scrollHeight;
  }

  async function selectConversation(id) {
    state.activeId = id;
    renderConversationList();
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) return;
    const person = conversation.participant || {};
    $('#chatName').textContent = person.full_name || person.username || 'VaRoom user';
    $('#statusText').textContent = 'Conversation';
    renderProfile(conversation);
    if (state.channel) await state.channel.unsubscribe();
    const result = await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages`);
    renderMessages(result.messages);
    state.channel = window.supabaseClient.channel(`chat:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        const current = $('.messages');
        const message = payload.new;
        if (message.message_type !== 'text' || current.querySelector(`[data-message-id="${message.id}"]`)) return;
        const row = document.createElement('div');
        row.className = `msg-row ${message.sender_id === state.session.user.id ? 'out' : 'in'}`;
        row.dataset.messageId = message.id;
        const bubble = document.createElement('div');
        bubble.className = 'bubble'; bubble.textContent = message.body || '';
        const meta = document.createElement('div');
        meta.className = 'msg-meta'; meta.textContent = formatTime(message.created_at);
        row.append(bubble, meta); current.appendChild(row); current.scrollTop = current.scrollHeight;
      }).subscribe();
  }

  async function start() {
    if (!window.supabaseClient) throw new Error('Supabase client is unavailable');
    const result = await window.supabaseClient.auth.getSession();
    state.session = result.data.session;
    if (!state.session) { window.location.assign('/login?next=/chats'); return; }
    const data = await api('/api/chat/conversations');
    state.conversations = data.conversations;
    const requested = new URLSearchParams(window.location.search).get('c') || new URLSearchParams(window.location.search).get('conversation');
    state.activeId = requested && state.conversations.some((item) => item.id === requested) ? requested : state.conversations[0] && state.conversations[0].id;
    renderConversationList();
    if (state.activeId) await selectConversation(state.activeId);
    else {
      $('#chatName').textContent = '';
      $('#statusText').textContent = '';
      clear($('.messages'));
      renderProfile(null);
    }
    const search = $('.search-box input');
    search.addEventListener('input', () => {
      const term = search.value.trim().toLowerCase();
      document.querySelectorAll('#contactList .contact-item').forEach((item) => {
        item.hidden = !item.textContent.toLowerCase().includes(term);
      });
    });
    const input = $('.chat-input-area textarea');
    input.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      const content = input.value.trim();
      if (!content || !state.activeId) return;
      input.disabled = true;
      try { await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/messages`, { method: 'POST', body: JSON.stringify({ content }) }); input.value = ''; }
      finally { input.disabled = false; }
    });
    document.querySelectorAll('.attach-icons button, .format-icons button, .chat-header-actions button:not(#infoToggleBtn), .compose-btn, .icon-rail button, .info-section-head .more').forEach((button) => {
      button.disabled = true; button.setAttribute('aria-disabled', 'true');
    });
    document.querySelectorAll('.info-section').forEach((section) => { section.hidden = true; });
  }

  start().catch((error) => { console.error('Chat initialization failed:', error); });
}());
