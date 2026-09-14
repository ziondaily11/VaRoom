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
  const initials = (profile) => (profile && (profile.full_name || profile.username) || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const clear = (element) => { while (element && element.firstChild) element.removeChild(element.firstChild); };

  function clearInitialPlaceholders() {
    clear($('#contactList'));
    clear($('.messages'));
    clear($('.profile-block'));
    $('#chatName').textContent = '';
    $('#statusText').textContent = '';
    $('#statusDot').style.background = '#c7cbd1';
    document.querySelectorAll('.info-section').forEach((section) => { section.hidden = true; });
  }

  function renderConversationList() {
    const list = $('#contactList');
    clear(list);
    state.conversations.forEach((conversation) => {
      const person = conversation.participant || {};
      const preview = conversation.lastMessage && conversation.lastMessage.body || '';
      const item = document.createElement('li');
      item.className = `contact-item${conversation.id === state.activeId ? ' active' : ''}`;
      item.dataset.conversationId = conversation.id;
      item.innerHTML = `<div class="avatar-wrap"><div class="avatar-fallback" style="background:#6C63FF;"></div></div>
        <div class="contact-body"><div class="contact-top"><span class="contact-name"></span><span class="contact-time"></span></div>
        <div class="contact-bottom"><span class="contact-preview"></span></div></div>`;
      item.querySelector('.avatar-fallback').textContent = initials(person);
      item.querySelector('.contact-name').textContent = person.full_name || person.username || '';
      item.querySelector('.contact-time').textContent = formatTime(conversation.lastMessage && conversation.lastMessage.created_at);
      item.querySelector('.contact-preview').textContent = preview;
      item.addEventListener('click', () => selectConversation(conversation.id));
      list.appendChild(item);
    });
  }

  function renderProfile(conversation) {
    const block = $('.profile-block');
    if (!block) return;
    clear(block);
    if (!conversation) return;
    const person = conversation.participant || {};
    const avatar = document.createElement('div');
    avatar.className = 'avatar-fallback';
    avatar.style.background = '#6C63FF';
    avatar.textContent = initials(person);
    const name = document.createElement('div');
    name.className = 'p-name';
    name.textContent = person.full_name || person.username || '';
    block.append(avatar, name);
    if (person.username) { const line = document.createElement('div'); line.className = 'p-line'; line.textContent = `@${person.username}`; block.appendChild(line); }
    if (person.email) { const line = document.createElement('div'); line.className = 'p-line'; line.textContent = person.email; block.appendChild(line); }
    if (person.phone) { const line = document.createElement('div'); line.className = 'p-line'; line.textContent = person.phone; block.appendChild(line); }
  }

  function messageRow(message) {
    const row = document.createElement('div');
    const outgoing = message.sender_id === state.session.user.id;
    row.className = `msg-row ${outgoing ? 'out' : 'in'}`;
    row.dataset.messageId = message.id;
    if (message.message_type === 'text') {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = message.body || '';
      row.appendChild(bubble);
    } else if (message.message_type === 'voice' && message.attachment_id) {
      const card = document.createElement('div');
      card.className = 'voice-card';
      card.innerHTML = '<button class="play" type="button"><svg class="icon-fill"><use href="#i-play"/></svg></button><div class="voice-wave"></div><div class="voice-dur">Voice</div>';
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      downloadAttachment(message.attachment_id).then((url) => { audio.src = url; }).catch((error) => console.error('Voice message unavailable:', error));
      card.querySelector('.play').addEventListener('click', () => { if (audio.paused) audio.play(); else audio.pause(); });
      card.appendChild(audio);
      row.appendChild(card);
    } else if (message.attachment_id) {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.dataset.attachmentId = message.attachment_id;
      card.innerHTML = '<div class="file-icon"><svg class="icon"><use href="#i-file-text"/></svg></div><div><div class="file-name"></div><div class="file-sub">Attachment</div></div><svg class="icon dl"><use href="#i-download"/></svg>';
      card.querySelector('.file-name').textContent = message.body || (message.message_type === 'photo' ? 'Photo' : 'File');
      card.addEventListener('click', () => downloadAttachment(message.attachment_id));
      row.appendChild(card);
    }
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = message.read_at && message.sender_id === state.session.user.id
      ? `Read ${formatTime(message.read_at)}` : formatTime(message.created_at);
    row.appendChild(meta);
    return row;
  }

  async function downloadAttachment(attachmentId) {
    const result = await api(`/api/chat/attachments/${encodeURIComponent(attachmentId)}/download`);
    return result.url;
  }

  function renderMessages(messages) {
    const container = $('.messages');
    clear(container);
    messages.forEach((message) => {
      container.appendChild(messageRow(message));
    });
    container.scrollTop = container.scrollHeight;
  }

  function renderInfoAttachments(messages) {
    const attachments = messages.filter((message) => message.attachment_id && message.message_type !== 'voice');
    const sections = document.querySelectorAll('.info-section');
    const mediaSection = sections[0];
    const filesSection = sections[1];
    if (!mediaSection || !filesSection) return;
    const mediaGrid = mediaSection.querySelector('.media-grid');
    const fileRows = filesSection.querySelectorAll('.file-row');
    clear(mediaGrid);
    fileRows.forEach((row) => row.remove());
    attachments.filter((message) => message.message_type === 'photo').slice(0, 6).forEach((message) => {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.style.background = '#eaf1ff';
      thumb.innerHTML = '<svg class="icon"><use href="#i-image"/></svg>';
      thumb.addEventListener('click', () => downloadAttachment(message.attachment_id));
      mediaGrid.appendChild(thumb);
    });
    attachments.filter((message) => message.message_type === 'file').forEach((message) => {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = '<div class="f-icon" style="background:#e5f0ff;color:#3b7ce0;"><svg class="icon"><use href="#i-file-text"/></svg></div><div><div class="f-name"></div><div class="f-sub">Attachment</div></div><svg class="icon f-dl"><use href="#i-download"/></svg>';
      row.querySelector('.f-name').textContent = message.body || 'File';
      row.addEventListener('click', () => downloadAttachment(message.attachment_id));
      filesSection.appendChild(row);
    });
    mediaSection.hidden = !mediaGrid.children.length;
    filesSection.hidden = !filesSection.querySelector('.file-row');
    sections[2].hidden = true;
  }

  async function selectConversation(id) {
    state.activeId = id;
    renderConversationList();
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) return;
    const person = conversation.participant || {};
    $('#chatName').textContent = person.full_name || person.username || '';
    $('#statusText').textContent = '';
    $('#statusDot').style.background = '#c7cbd1';
    renderProfile(conversation);
    if (state.channel) await state.channel.unsubscribe();
    const result = await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages`);
    renderMessages(result.messages);
    renderInfoAttachments(result.messages);
    await api(`/api/chat/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' });
    state.channel = window.supabaseClient.channel(`chat:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        const current = $('.messages');
        const message = payload.new;
        if (message.message_type !== 'text' || current.querySelector(`[data-message-id="${message.id}"]`)) return;
        current.appendChild(messageRow(message)); current.scrollTop = current.scrollHeight;
      }).subscribe();
    state.channel.on('presence', { event: 'sync' }, () => {
      const online = Object.keys(state.channel.presenceState()).length > 1;
      $('#statusText').textContent = online ? 'Online' : 'Offline';
      $('#statusDot').style.background = online ? 'var(--mint)' : '#c7cbd1';
    });
    await state.channel.track({ user_id: state.session.user.id });
  }

  async function start() {
    clearInitialPlaceholders();
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
      $('#statusDot').style.background = '#c7cbd1';
      clear($('.messages'));
      renderProfile(null);
      renderInfoAttachments([]);
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
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.hidden = true;
    document.body.appendChild(fileInput);
    const upload = async (file, kind) => {
      if (!state.activeId) return;
      const init = await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/attachments/upload-init`, {
        method: 'POST', body: JSON.stringify({ filename: file.name, mimeType: file.type, fileSize: file.size, kind }),
      });
      const uploadResponse = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadResponse.ok) throw new Error('Attachment upload failed');
      await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/attachments/${encodeURIComponent(init.attachmentId)}/complete`, { method: 'POST', body: '{}' });
      await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: file.name, attachmentId: init.attachmentId, messageType: kind }),
      });
    };
    const imageButton = $('.attach-icons button:nth-child(1)');
    const fileButton = $('.attach-icons button:nth-child(2)');
    imageButton.disabled = false; fileButton.disabled = false;
    imageButton.addEventListener('click', () => { fileInput.accept = 'image/*'; fileInput.dataset.kind = 'photo'; fileInput.click(); });
    fileButton.addEventListener('click', () => { fileInput.accept = ''; fileInput.dataset.kind = 'file'; fileInput.click(); });
    fileInput.addEventListener('change', async () => {
      if (fileInput.files[0]) await upload(fileInput.files[0], fileInput.dataset.kind);
      fileInput.value = '';
    });
    $('.chat-header-actions button[title="Search"]').addEventListener('click', () => $('.search-box input').focus());
    const micButton = $('.attach-icons button:nth-child(3)');
    let recorder;
    let chunks = [];
    micButton.disabled = false;
    micButton.addEventListener('click', async () => {
      if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        await upload(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }), 'voice');
      };
      recorder.start();
    });
    document.querySelectorAll('.chat-header-actions button:not(#infoToggleBtn):not([title="Search"]), .compose-btn, .icon-rail button, .info-section-head .more').forEach((button) => {
      button.disabled = true; button.setAttribute('aria-disabled', 'true');
    });
    document.querySelectorAll('.format-icons button').forEach((button) => {
      button.addEventListener('click', () => {
        const marker = button.classList.contains('fmt-b') ? '**' : button.classList.contains('fmt-i') ? '_' : button.classList.contains('fmt-u') ? '__' : '- ';
        const input = $('.chat-input-area textarea');
        const start = input.selectionStart; const end = input.selectionEnd;
        if (start === end) return;
        input.setRangeText(`${marker}${input.value.slice(start, end)}${marker}`, start, end, 'select');
        input.focus();
      });
    });
    document.querySelectorAll('.info-section').forEach((section, index) => {
      if (index === 2) section.hidden = true;
    });
  }

  start().catch((error) => { console.error('Chat initialization failed:', error); });
}());
