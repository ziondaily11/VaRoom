(function () {
  'use strict';

  const state = { session: null, conversations: [], activeId: null, channel: null, listings: [], pendingAttachment: null, mobileView: 'inbox', mobileInfoReturn: 'conversation' };
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
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
  const avatarUrl = (profile) => {
    if (!profile || !profile.avatar_url) return '';
    if (/^(https?:|data:|blob:)/i.test(profile.avatar_url)) return profile.avatar_url;
    return window.supabaseClient.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl;
  };
  const setAvatar = (element, profile) => {
    element.style.background = '#14161c';
    const url = avatarUrl(profile);
    if (url) {
      element.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
      element.style.backgroundSize = 'cover';
      element.style.backgroundPosition = 'center';
      element.textContent = '';
    } else {
      element.textContent = initials(profile);
    }
  };

  function ensureChatPanels() {
    if (document.getElementById('chatShareSheet')) return;
    const style = document.createElement('style');
    style.textContent = `
      .chat-sheet{position:absolute;left:0;right:0;bottom:0;z-index:5;background:#fff;border-top:1px solid #e2e5ea;box-shadow:0 -8px 24px rgba(20,22,28,.12);padding:18px 28px;transform:translateY(110%);transition:transform .2s ease;max-height:70%;overflow:auto}
      .chat-sheet.open{transform:translateY(0)}
      .chat-sheet-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:14px;font-weight:700;color:#1f2937}
      .chat-sheet-close{border:0;background:transparent;color:#71798a;font-size:18px;cursor:pointer}
      .chat-sheet-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
      .chat-listing-option{border:1px solid #e2e5ea;border-radius:12px;background:#fff;text-align:left;overflow:hidden;cursor:pointer;color:#1f2937}
      .chat-listing-option.selected{border-color:#25876e;box-shadow:0 0 0 2px #dbf4ea}
      .chat-listing-option img{width:100%;height:82px;object-fit:cover;display:block;background:#f6f7f9}
      .chat-listing-option div{padding:8px;font-size:13px;color:#1f2937}.chat-listing-option strong{color:#111827;font-weight:700}.chat-listing-option small{display:block;color:#4b5563;margin-top:4px;font-size:11.5px}
      .chat-listing-card{max-width:320px;overflow:hidden;border-radius:10px;background:#f7f8f9;cursor:pointer}.chat-listing-card img{display:block;width:100%;height:150px;object-fit:cover;background:#eceff1}.chat-listing-card-body{padding:10px 12px}.chat-listing-card-title{font-weight:700;color:#14161c}.chat-listing-card-sub{margin-top:4px;color:#626b78;font-size:12px}
      .chat-sheet-action{margin-top:12px;border:0;border-radius:9px;background:#4ec1a0;color:#fff;padding:9px 14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px}.chat-sheet-action .icon{width:16px;height:16px}.chat-sheet-action:disabled{opacity:.5;cursor:default}
      .chat-report-details{width:100%;min-height:70px;border:1px solid #e2e5ea;border-radius:8px;padding:8px;font:inherit;resize:vertical}
      .chat-actions .info-action-report{display:block;width:100%;padding:9px 0;border:0;background:transparent;color:#4b5563;text-align:left;font:inherit;cursor:pointer}
      .chat-actions .info-action-report:hover,.chat-actions .info-action-report:focus-visible{color:#14161c}
      .chat-image-preview{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:32px;background:rgba(20,22,28,.86);cursor:zoom-out}
      .chat-image-preview img{max-width:90vw;max-height:90vh;width:auto;height:auto;object-fit:contain;border-radius:8px;cursor:default}
      @media(max-width:760px){.chat-sheet{padding:14px 16px}.chat-sheet-list{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
    const chatCol = $('.chat-col');
    chatCol.style.position = 'relative';
    ['chatShareSheet', 'chatReportSheet'].forEach((id) => {
      const sheet = document.createElement('section');
      sheet.id = id;
      sheet.className = 'chat-sheet';
      sheet.setAttribute('aria-hidden', 'true');
      chatCol.appendChild(sheet);
    });
    if (isMobile()) {
      $('.search-box input').placeholder = 'Search conversations...';
      const title = document.createElement('div');
      title.className = 'mobile-inbox-title';
      title.innerHTML = '<button class="mobile-menu" type="button" aria-label="Open navigation"><svg class="icon"><use href="#i-menu"/></svg></button><span>Chat</span>';
      $('.contacts-col').prepend(title);
      const preview = document.createElement('div');
      preview.className = 'mobile-preview';
      preview.id = 'mobileComposerPreview';
      $('.chat-input-area').prepend(preview);
      const plus = document.createElement('button');
      plus.type = 'button'; plus.className = 'mobile-plus'; plus.title = 'Add attachment';
      plus.setAttribute('aria-label', 'Add attachment');
      plus.textContent = '+';
      $('.attach-icons').prepend(plus);
      plus.addEventListener('click', openMobileTray);
      $('.chat-header').insertAdjacentHTML('afterbegin', '<button class="mobile-back" type="button" aria-label="Back to inbox"><svg class="icon"><path d="m15 5-7 7 7 7"/></svg></button>');
      $('.chat-header .mobile-back').addEventListener('click', showMobileInbox);
      $('.chat-header > div:first-of-type').addEventListener('click', () => {
        if (state.activeId) showMobileInfo('conversation');
      });
      $('.info-close-btn').addEventListener('click', () => {
        if (state.mobileInfoReturn === 'inbox') showMobileInbox();
        else showMobileConversation();
      });
      $('.mobile-menu').addEventListener('click', () => {
        const homeButton = document.querySelector('[data-chat-nav="home"]');
        if (homeButton) homeButton.click();
      });
    }
  }

  function showMobileInbox() {
    if (!isMobile()) return;
    state.mobileView = 'inbox';
    $('.contacts-col').classList.remove('mobile-hidden');
    $('.chat-col').classList.remove('mobile-visible');
    $('.info-col').classList.remove('mobile-visible');
  }
  function showMobileConversation() {
    if (!isMobile() || !state.activeId) return;
    state.mobileView = 'conversation';
    $('.contacts-col').classList.add('mobile-hidden');
    $('.info-col').classList.remove('mobile-visible');
    $('.chat-col').classList.add('mobile-visible');
  }
  function showMobileInfo(returnTo) {
    if (!isMobile() || !state.activeId) return;
    state.mobileInfoReturn = returnTo || 'conversation';
    state.mobileView = 'info';
    $('.contacts-col').classList.add('mobile-hidden');
    $('.chat-col').classList.remove('mobile-visible');
    $('.info-col').classList.add('mobile-visible');
  }

  async function openMobileTray() {
    const sheet = document.getElementById('chatShareSheet');
    sheet.innerHTML = '<div class="chat-sheet-head"><span>Add to message</span><button class="chat-sheet-close" type="button" aria-label="Close">×</button></div><div class="chat-sheet-list"></div>';
    sheet.querySelector('.chat-sheet-close').addEventListener('click', () => closeSheet('chatShareSheet'));
    const list = sheet.querySelector('.chat-sheet-list');
    [
      ['Share Listing', 'listing', 'i-share'],
      ['Share Photo', 'photo', 'i-image'],
      ['Share File', 'file', 'i-paperclip'],
    ].forEach(([label, kind, icon]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'chat-sheet-action';
      button.innerHTML = `<svg class="icon"><use href="#${icon}"/></svg><span></span>`;
      button.querySelector('span').textContent = label;
      button.addEventListener('click', () => {
        closeSheet('chatShareSheet');
        if (kind === 'listing') openMobileListingPicker();
        else {
          fileInputForMobile(kind);
        }
      });
      list.appendChild(button);
    });
    sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
  }

  async function openMobileListingPicker() {
    const sheet = document.getElementById('chatShareSheet');
    sheet.innerHTML = '<div class="chat-sheet-head"><span>Share Listing</span><button class="chat-sheet-close" type="button" aria-label="Close">×</button></div><div class="chat-sheet-list"></div>';
    sheet.querySelector('.chat-sheet-close').addEventListener('click', () => closeSheet('chatShareSheet'));
    if (!state.listings.length) state.listings = (await api('/api/chat/listings')).listings || [];
    const list = sheet.querySelector('.chat-sheet-list');
    state.listings.forEach((listing) => {
      const option = document.createElement('button');
      option.type = 'button'; option.className = 'chat-listing-option';
      option.textContent = listing.title || 'Listing';
      option.addEventListener('click', () => {
        state.pendingAttachment = { kind: 'listing', listing };
        updateMobilePreview();
        closeSheet('chatShareSheet');
      });
      list.appendChild(option);
    });
    sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
  }

  function updateMobilePreview() {
    const preview = $('#mobileComposerPreview');
    if (!preview) return;
    const pending = state.pendingAttachment;
    preview.textContent = pending ? `${pending.kind === 'listing' ? 'Listing' : pending.kind === 'photo' ? 'Photo' : 'File'}: ${pending.name || pending.listing?.title || ''}` : '';
    preview.classList.toggle('has-content', !!pending);
  }

  function fileInputForMobile(kind) {
    const input = document.querySelector('input[data-mobile-file-input]');
    input.accept = kind === 'photo' ? 'image/*' : '';
    input.dataset.kind = kind;
    input.click();
  }

  function closeSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
  }

  function openImagePreview(url, alt) {
    const existing = document.querySelector('.chat-image-preview');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'chat-image-preview';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Image preview');
    const image = document.createElement('img');
    image.src = url;
    image.alt = alt || '';
    overlay.appendChild(image);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function openReportSheet() {
    const sheet = document.getElementById('chatReportSheet');
    const person = state.conversations.find((item) => item.id === state.activeId)?.participant || {};
    sheet.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'chat-sheet-head';
    head.innerHTML = '<span>Report User</span><button class="chat-sheet-close" type="button" aria-label="Close">×</button>';
    head.querySelector('button').addEventListener('click', () => closeSheet('chatReportSheet'));
    const select = document.createElement('select');
    select.className = 'chat-report-details';
    select.innerHTML = '<option value="">Select a reason</option><option>Spam or scam</option><option>Harassment</option><option>Inappropriate content</option><option>Other</option>';
    const details = document.createElement('textarea');
    details.className = 'chat-report-details';
    details.placeholder = `Additional details about ${person.full_name || person.username || 'this user'}`;
    const submit = document.createElement('button');
    submit.className = 'chat-sheet-action';
    submit.type = 'button';
    submit.textContent = 'Submit report';
    submit.disabled = true;
    select.addEventListener('change', () => { submit.disabled = !select.value; });
    submit.addEventListener('click', async () => {
      submit.disabled = true;
      await api('/api/chat/reports', { method: 'POST', body: JSON.stringify({
        conversationId: state.activeId, reason: select.value, details: details.value,
      }) });
      closeSheet('chatReportSheet');
    });
    sheet.append(head, select, details, submit);
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
  }

  async function openShareSheet() {
    const sheet = document.getElementById('chatShareSheet');
    sheet.innerHTML = '<div class="chat-sheet-head"><span>Share listing</span><button class="chat-sheet-close" type="button" aria-label="Close">×</button></div><div class="chat-sheet-list"></div><button class="chat-sheet-action" type="button" disabled>Share selected listing</button>';
    sheet.querySelector('.chat-sheet-close').addEventListener('click', () => closeSheet('chatShareSheet'));
    const list = sheet.querySelector('.chat-sheet-list');
    const share = sheet.querySelector('.chat-sheet-action');
    if (!state.listings.length) {
      const result = await api('/api/chat/listings');
      state.listings = result.listings || [];
    }
    const selected = new Set();
    state.listings.forEach((listing) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'chat-listing-option';
      const photo = listing.listing_photos && listing.listing_photos[0];
      const image = document.createElement('img');
      image.alt = listing.title || '';
      image.src = photo ? window.supabaseClient.storage.from('listing-photos').getPublicUrl(photo.storage_path).data.publicUrl : '';
      const textBlock = document.createElement('div');
      textBlock.innerHTML = `<strong></strong><small></small>`;
      textBlock.querySelector('strong').textContent = listing.title || '';
      textBlock.querySelector('small').textContent = listing.location_text || '';
      option.append(image, textBlock);
      loadListingVideo(listing.id).then((video) => {
        if (!video) return;
        const player = document.createElement('video');
        player.src = video.url;
        player.poster = video.thumbnailUrl;
        player.muted = true;
        player.playsInline = true;
        player.controls = true;
        player.style.cssText = 'width:100%;height:82px;object-fit:cover;display:block;background:#f6f7f9';
        image.replaceWith(player);
      }).catch((error) => console.error('Listing video unavailable:', error));
      option.addEventListener('click', () => {
        if (selected.has(listing.id)) {
          selected.delete(listing.id);
          option.classList.remove('selected');
        } else {
          selected.add(listing.id);
          option.classList.add('selected');
        }
        share.disabled = selected.size === 0;
      });
      list.appendChild(option);
    });
    if (!state.listings.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No listings available';
      list.appendChild(empty);
    }
    share.addEventListener('click', async () => {
      if (!selected.size) return;
      share.disabled = true;
      for (const listingId of selected) {
        const listing = state.listings.find((item) => item.id === listingId);
        if (!listing) continue;
        const result = await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: listing.title, listingId: listing.id, messageType: 'listing' }),
        });
        const current = $('.messages');
        if (result.message && !current.querySelector(`[data-message-id="${result.message.id}"]`)) {
          current.appendChild(messageRow(result.message));
        }
      }
      $('.messages').scrollTop = $('.messages').scrollHeight;
      closeSheet('chatShareSheet');
    });
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
  }

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
      item.innerHTML = `<div class="avatar-wrap"><div class="avatar-fallback" style="background:#14161c;"></div></div>
        <div class="contact-body"><div class="contact-top"><span class="contact-name"></span><span class="contact-time"></span></div>
        <div class="contact-bottom"><span class="contact-preview"></span></div></div>`;
      setAvatar(item.querySelector('.avatar-fallback'), person);
      item.querySelector('.contact-name').textContent = person.full_name || person.username || '';
      item.querySelector('.contact-time').textContent = formatTime(conversation.lastMessage && conversation.lastMessage.created_at);
      item.querySelector('.contact-preview').textContent = preview;
      item.addEventListener('click', (event) => {
        if (event.target.closest('.contact-avatar-link')) {
          event.stopPropagation();
          state.activeId = conversation.id;
          renderProfile(conversation);
          api(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/messages`)
            .then((result) => renderInfoAttachments(result.messages || []))
            .catch((error) => console.error('Unable to load contact information:', error));
          showMobileInfo('inbox');
          return;
        }
        selectConversation(conversation.id);
      });
      const avatarLink = item.querySelector('.avatar-wrap');
      avatarLink.classList.add('contact-avatar-link');
      avatarLink.setAttribute('role', 'button');
      avatarLink.setAttribute('tabindex', '0');
      avatarLink.setAttribute('aria-label', `Open information for ${person.full_name || person.username || 'contact'}`);
      avatarLink.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          avatarLink.click();
        }
      });
      item.querySelector('.avatar-fallback').addEventListener('click', (event) => {
        event.stopPropagation();
        selectConversation(conversation.id).then(() => showMobileInfo());
      });
      list.appendChild(item);
    });
  }

  function updateConversationPreview(message) {
    const conversation = state.conversations.find((item) => item.id === message.conversation_id);
    if (!conversation) return;
    conversation.lastMessage = message;
    state.conversations.sort((left, right) => {
      const leftTime = left.lastMessage && left.lastMessage.created_at || left.created_at;
      const rightTime = right.lastMessage && right.lastMessage.created_at || right.created_at;
      return new Date(rightTime).getTime() - new Date(leftTime).getTime();
    });
    renderConversationList();
  }

  function renderProfile(conversation) {
    const block = $('.profile-block');
    if (!block) return;
    clear(block);
    if (!conversation) return;
    const person = conversation.participant || {};
    const avatar = document.createElement('div');
    avatar.className = 'avatar-fallback';
    avatar.style.background = '#14161c';
    setAvatar(avatar, person);
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
    } else if (message.message_type === 'listing' && message.listing) {
      const card = document.createElement('div');
      card.className = 'chat-listing-card';
      const photo = message.listing.listing_photos && message.listing.listing_photos[0];
      card.innerHTML = '<div class="chat-listing-card-body"><div class="chat-listing-card-title"></div><div class="chat-listing-card-sub"></div></div>';
      if (photo) {
        const image = document.createElement('img');
        image.src = window.supabaseClient.storage.from('listing-photos').getPublicUrl(photo.storage_path).data.publicUrl;
        image.alt = message.listing.title || 'Listing image';
        card.insertBefore(image, card.firstChild);
      }
      card.querySelector('.chat-listing-card-title').textContent = message.listing.title || '';
      card.querySelector('.chat-listing-card-sub').textContent = [message.listing.location_text, message.listing.category].filter(Boolean).join(' · ');
      card.addEventListener('click', () => { window.location.assign(`/booking?id=${encodeURIComponent(message.listing.id)}`); });
      loadListingVideo(message.listing.id).then((video) => {
        if (!video) return;
        const player = document.createElement('video');
        player.src = video.url;
        player.poster = video.thumbnailUrl;
        player.muted = true;
        player.playsInline = true;
        player.controls = true;
        player.style.cssText = 'width:180px;height:90px;object-fit:cover;border-radius:8px';
        const existingImage = card.querySelector('img');
        if (existingImage) existingImage.replaceWith(player);
        else card.insertBefore(player, card.firstChild);
      }).catch((error) => console.error('Shared listing video unavailable:', error));
      row.appendChild(card);
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
    } else if (message.message_type === 'photo' && message.attachment_id) {
      const image = document.createElement('img');
      image.className = 'chat-message-image';
      image.alt = message.attachment && message.attachment.original_filename || 'Shared image';
      image.style.cssText = 'display:block;max-width:320px;max-height:260px;width:auto;height:auto;object-fit:contain;border-radius:8px;cursor:zoom-in';
      downloadAttachment(message.attachment_id).then((url) => {
        image.src = url;
        image.addEventListener('click', () => openImagePreview(url, image.alt));
      }).catch((error) => console.error('Image message unavailable:', error));
      row.appendChild(image);
    } else if (message.attachment_id) {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.dataset.attachmentId = message.attachment_id;
      card.innerHTML = '<div class="file-icon"><svg class="icon"><use href="#i-file-text"/></svg></div><div><div class="file-name"></div><div class="file-sub"></div></div><svg class="icon dl"><use href="#i-download"/></svg>';
      card.querySelector('.file-name').textContent = message.attachment && message.attachment.original_filename
        || message.body || '';
      card.querySelector('.file-sub').textContent = message.attachment
        ? `${Math.ceil(message.attachment.file_size_bytes / 1024)} Kb`
        : '';
      card.addEventListener('click', async () => { window.open(await downloadAttachment(message.attachment_id), '_blank', 'noopener'); });
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

  async function loadListingVideo(listingId) {
    const mediaResult = await api(`/api/properties/${encodeURIComponent(listingId)}/media`);
    const video = (mediaResult.media || []).find((item) => item.type === 'video');
    if (!video) return null;
    const playback = await api(`/api/media/${encodeURIComponent(video.id)}/playback`);
    return { ...video, url: playback.url, thumbnailUrl: playback.thumbnailUrl || video.thumbnailUrl || '' };
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
      const image = document.createElement('img');
      image.alt = message.attachment && message.attachment.original_filename || '';
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.objectFit = 'cover';
      downloadAttachment(message.attachment_id).then((url) => { image.src = url; }).catch((error) => console.error('Image unavailable:', error));
      thumb.appendChild(image);
      thumb.addEventListener('click', () => downloadAttachment(message.attachment_id).then((url) => openImagePreview(url, image.alt)));
      mediaGrid.appendChild(thumb);
    });
    attachments.filter((message) => message.message_type === 'file').forEach((message) => {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = '<div class="f-icon" style="background:#e5f0ff;color:#3b7ce0;"><svg class="icon"><use href="#i-file-text"/></svg></div><div><div class="f-name"></div><div class="f-sub"></div></div><svg class="icon f-dl"><use href="#i-download"/></svg>';
      row.querySelector('.f-name').textContent = message.attachment && message.attachment.original_filename || message.body || '';
      row.querySelector('.f-sub').textContent = message.attachment
        ? `${Math.ceil(message.attachment.file_size_bytes / 1024)} Kb`
        : '';
      row.addEventListener('click', async () => { window.open(await downloadAttachment(message.attachment_id), '_blank', 'noopener'); });
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
    if (isMobile()) showMobileConversation();
    await api(`/api/chat/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' });
    state.channel = window.supabaseClient.channel(`chat:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        const current = $('.messages');
        const message = payload.new;
        if (current.querySelector(`[data-message-id="${message.id}"]`)) return;
        current.appendChild(messageRow(message)); current.scrollTop = current.scrollHeight;
        updateConversationPreview(message);
      })
      .on('presence', { event: 'sync' }, () => {
        const online = Object.keys(state.channel.presenceState()).length > 1;
        $('#statusText').textContent = online ? 'Online' : 'Offline';
        $('#statusDot').style.background = online ? 'var(--mint)' : '#c7cbd1';
      });
    await new Promise((resolve, reject) => {
      state.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await state.channel.track({ user_id: state.session.user.id });
            resolve();
          } catch (error) {
            reject(error);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          reject(new Error(`Chat realtime subscription failed: ${status}`));
        }
      });
    });
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
    state.activeId = !isMobile() && requested && state.conversations.some((item) => item.id === requested) ? requested : null;
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
    async function sendText() {
      const content = input.value.trim();
      const pending = state.pendingAttachment;
      if ((!content && !pending) || !state.activeId || input.disabled) return;
      input.disabled = true;
      try {
        let result;
        if (pending && pending.kind === 'listing') {
          result = await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/messages`, {
            method: 'POST', body: JSON.stringify({ content: content || pending.listing.title, listingId: pending.listing.id, messageType: 'listing' }),
          });
        } else if (pending && pending.file) {
          const init = await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/attachments/upload-init`, {
            method: 'POST', body: JSON.stringify({ filename: pending.file.name, mimeType: pending.file.type, fileSize: pending.file.size, kind: pending.kind }),
          });
          const uploadResponse = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pending.file.type }, body: pending.file });
          if (!uploadResponse.ok) throw new Error('Attachment upload failed');
          await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/attachments/${encodeURIComponent(init.attachmentId)}/complete`, { method: 'POST', body: '{}' });
          result = await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/messages`, {
            method: 'POST', body: JSON.stringify({ content: content || pending.file.name, attachmentId: init.attachmentId, messageType: pending.kind }),
          });
        } else {
          result = await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/messages`, {
            method: 'POST', body: JSON.stringify({ content }),
          });
        }
        input.value = '';
        state.pendingAttachment = null;
        updateMobilePreview();
        const current = $('.messages');
        if (result.message && !current.querySelector(`[data-message-id="${result.message.id}"]`)) {
          current.appendChild(messageRow(result.message));
          current.scrollTop = current.scrollHeight;
        }
        updateConversationPreview(result.message);
      } finally { input.disabled = false; }
    }
    input.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      await sendText();
    });
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.hidden = true; fileInput.dataset.mobileFileInput = 'true';
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
    const imageButton = $('.attach-icons button.share-photo');
    const fileButton = $('.attach-icons button.share-file');
    imageButton.disabled = false; fileButton.disabled = false;
    imageButton.addEventListener('click', () => { fileInput.accept = 'image/*'; fileInput.dataset.kind = 'photo'; fileInput.click(); });
    fileButton.addEventListener('click', () => { fileInput.accept = ''; fileInput.dataset.kind = 'file'; fileInput.click(); });
    fileInput.addEventListener('change', async () => {
      if (fileInput.files[0] && isMobile()) {
        state.pendingAttachment = { kind: fileInput.dataset.kind, file: fileInput.files[0], name: fileInput.files[0].name };
        updateMobilePreview();
      } else if (fileInput.files[0]) await upload(fileInput.files[0], fileInput.dataset.kind);
      fileInput.value = '';
    });
    $('.chat-header-actions button[title="Search"]').addEventListener('click', () => $('.search-box input').focus());
    ensureChatPanels();
    if (isMobile()) showMobileInbox();
    const shareButton = $('.attach-icons button[title="Share listing"]');
    shareButton.disabled = false;
    shareButton.addEventListener('click', openShareSheet);
    const sendButton = $('.attach-icons button.send-message');
    sendButton.disabled = false;
    sendButton.addEventListener('click', sendText);
    if (isMobile()) $('#infoToggleBtn').addEventListener('click', showMobileInfo);
    const actions = document.createElement('div');
    actions.className = 'info-section chat-actions';
    actions.innerHTML = '<div class="info-section-head"><span class="label">Actions</span></div><button type="button" class="info-action-report">Report User</button>';
    $('.info-col').appendChild(actions);
    actions.querySelector('.info-action-report').addEventListener('click', openReportSheet);
    document.querySelectorAll('[data-chat-nav]').forEach((button) => {
      button.addEventListener('click', async () => {
        const sessionResult = await window.supabaseClient.auth.getSession();
        const userId = sessionResult.data.session && sessionResult.data.session.user.id;
        const profileResult = userId
          ? await window.supabaseClient.from('profiles').select('role').eq('id', userId).maybeSingle()
          : { data: null };
        const routes = {
          home: profileResult.data && profileResult.data.role === 'host' ? '/host-home' : '/client-home',
          marketplace: '/marketplace',
          notifications: '/notifications',
          bookings: '/bookings',
          profile: '/profile',
        };
        if (routes[button.dataset.chatNav]) window.location.assign(routes[button.dataset.chatNav]);
      });
    });
    document.querySelectorAll('.chat-header-actions button:not(#infoToggleBtn):not([title="Search"]), .compose-btn, .icon-rail button:not([data-chat-nav]), .info-section-head .more').forEach((button) => {
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
