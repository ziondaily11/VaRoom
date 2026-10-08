(function () {
  'use strict';

  const ELIE_ID = 'elie';
  const ELIE_API_URL = 'https://elie1-0.onrender.com/elie/search';
  const state = { session: null, role: 'client', conversations: [], activeId: null, channel: null, channelGeneration: 0, selectionGeneration: 0, onlineConversationIds: new Set(), listings: [], pendingAttachment: null, replyToMessage: null, messageMenu: null, messageMenuCleanup: null, mobileView: 'inbox', mobileInfoReturn: 'conversation', elie: { sessionId: null, history: [] } };
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const $ = (selector) => document.querySelector(selector);
  const elieAvatarMarkup = (size, state = 'default') => `<span data-elie-bot-avatar="true" data-avatar-size="${size}" data-avatar-state="${state}" class="elie-icon" aria-label="Elie, AI assistant"></span>`;
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
  const previewText = (value) => {
    const source = new DOMParser().parseFromString(String(value || ''), 'text/html').body;
    source.querySelectorAll('script, style, template').forEach((element) => element.remove());
    source.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
    source.querySelectorAll('p, div, li').forEach((element) => element.appendChild(document.createTextNode('\n')));
    return source.textContent
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };
  const scrollToRepliedMessage = (messageId) => {
    const target = Array.from(document.querySelectorAll('.messages [data-message-id]'))
      .find((row) => row.dataset.messageId === String(messageId));
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('reply-target-highlight');
    void target.offsetWidth;
    target.classList.add('reply-target-highlight');
    window.setTimeout(() => target.classList.remove('reply-target-highlight'), 1600);
  };
  const makeReplyReference = (messageId, label, body) => {
    const reference = document.createElement('div');
    reference.className = 'message-reply-reference';
    reference.setAttribute('role', 'button');
    reference.tabIndex = 0;
    reference.setAttribute('aria-label', `${label}: ${body}`);
    const referenceLabel = document.createElement('strong');
    referenceLabel.textContent = label;
    const referenceBody = document.createElement('span');
    referenceBody.textContent = body;
    reference.append(referenceLabel, referenceBody);
    reference.addEventListener('click', () => scrollToRepliedMessage(messageId));
    reference.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      scrollToRepliedMessage(messageId);
    });
    return reference;
  };
  const clear = (element) => { while (element && element.firstChild) element.removeChild(element.firstChild); };
  const isElie = () => state.activeId === ELIE_ID;
  const elieConversation = () => ({ id: ELIE_ID, isElie: true, participant: { full_name: 'Elie', username: 'Your VaRoom search assistant' }, lastMessage: null });
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

  let activePreviewUrl = null;
  let pendingPhotoFile = null;

  function ensureMediaPreviewModal() {
    let modal = document.getElementById('chatMediaPreviewModal');
    const chatCol = $('.chat-col');
    if (!modal && chatCol) {
      modal = document.createElement('div');
      modal.id = 'chatMediaPreviewModal';
      modal.className = 'chat-media-preview-composer';
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-label', 'Preview image to share');
      modal.innerHTML = `
        <div class="chat-media-preview-header">
          <button type="button" class="chat-media-preview-close" id="chatMediaPreviewClose" aria-label="Cancel image share" title="Cancel">
            <svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>
          </button>
        </div>
        <div class="chat-media-preview-body">
          <img id="chatMediaPreviewImg" class="chat-media-preview-image" alt="Selected image preview" />
        </div>
        <div class="chat-media-preview-footer">
          <div class="chat-media-preview-caption-wrap">
            <input type="text" id="chatMediaPreviewCaption" class="chat-media-preview-caption-input" placeholder="Type a message" aria-label="Type a message" />
          </div>
          <button type="button" class="chat-media-preview-send-btn" id="chatMediaPreviewSend" aria-label="Send photo" title="Send photo">
            <svg class="icon" aria-hidden="true"><use href="#i-send"/></svg>
          </button>
        </div>
      `;
      chatCol.appendChild(modal);
    }
    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = 'true';
      const closeBtn = modal.querySelector('#chatMediaPreviewClose');
      const sendBtn = modal.querySelector('#chatMediaPreviewSend');
      const captionInput = modal.querySelector('#chatMediaPreviewCaption');

      if (closeBtn) closeBtn.addEventListener('click', closeMediaPreview);
      if (sendBtn) sendBtn.addEventListener('click', sendMediaPreview);
      if (captionInput) {
        captionInput.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeMediaPreview();
          } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMediaPreview();
          }
        });
      }
    }
  }

  function openMediaPreview(file) {
    if (!file || !state.activeId) return;
    if (activePreviewUrl) {
      URL.revokeObjectURL(activePreviewUrl);
      activePreviewUrl = null;
    }
    pendingPhotoFile = file;
    activePreviewUrl = URL.createObjectURL(file);

    ensureMediaPreviewModal();

    const modal = document.getElementById('chatMediaPreviewModal');
    const img = document.getElementById('chatMediaPreviewImg');
    const captionInput = document.getElementById('chatMediaPreviewCaption');
    const sendBtn = document.getElementById('chatMediaPreviewSend');

    if (!modal || !img || !captionInput || !sendBtn) return;

    img.src = activePreviewUrl;
    img.alt = file.name || 'Selected image preview';
    captionInput.value = '';
    sendBtn.disabled = false;
    sendBtn.removeAttribute('aria-busy');

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
      captionInput.focus();
    }, 50);
  }

  function closeMediaPreview() {
    const modal = document.getElementById('chatMediaPreviewModal');
    const img = document.getElementById('chatMediaPreviewImg');
    const captionInput = document.getElementById('chatMediaPreviewCaption');
    const sendBtn = document.getElementById('chatMediaPreviewSend');

    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }
    if (img) img.src = '';
    if (captionInput) captionInput.value = '';
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.removeAttribute('aria-busy');
    }
    if (activePreviewUrl) {
      URL.revokeObjectURL(activePreviewUrl);
      activePreviewUrl = null;
    }
    pendingPhotoFile = null;
  }

  async function sendMediaPreview() {
    if (!pendingPhotoFile || !state.activeId) return;
    const sendBtn = document.getElementById('chatMediaPreviewSend');
    const captionInput = document.getElementById('chatMediaPreviewCaption');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.setAttribute('aria-busy', 'true');
    }

    const file = pendingPhotoFile;
    const caption = captionInput ? captionInput.value.trim() : '';
    const conversationId = state.activeId;

    try {
      const init = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/upload-init`, {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, mimeType: file.type, fileSize: file.size, kind: 'photo' }),
      });
      const uploadResponse = await fetch(init.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error('Photo upload failed');
      await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(init.attachmentId)}/complete`, {
        method: 'POST',
        body: '{}',
      });
      const result = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: caption || '', attachmentId: init.attachmentId, messageType: 'photo' }),
      });

      closeMediaPreview();

      const replyMessages = result.messages || (result.message ? [result.message] : []);
      if (window.VaRoomChatCache && state.session && state.session.user && state.session.user.id) {
        replyMessages.forEach((msg) => {
          window.VaRoomChatCache.appendMessage(state.session.user.id, conversationId, msg).catch(() => {});
        });
        const lastSent = replyMessages[replyMessages.length - 1] || result.message;
        if (lastSent) {
          window.VaRoomChatCache.updateInboxConversation(state.session.user.id, conversationId, { lastMessage: lastSent }).catch(() => {});
        }
      }

      if (state.activeId !== conversationId) return;

      const current = $('.messages');
      replyMessages.forEach((message) => {
        if (message && !current.querySelector(`[data-message-id="${message.id}"]`)) {
          current.appendChild(messageRow(message));
        }
      });
      if (replyMessages.length) current.scrollTop = current.scrollHeight;
      updateConversationPreview(replyMessages[replyMessages.length - 1] || result.message);
      if (window.VaRoomChatCache && state.session && state.session.user) {
        replyMessages.forEach((msg) => {
          window.VaRoomChatCache.appendMessage(state.session.user.id, conversationId, msg).catch(() => {});
        });
      }
    } catch (error) {
      console.error('Failed to send image message:', error);
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.removeAttribute('aria-busy');
      }
      alert('Failed to send image. Please try again.');
    }
  }

  window.openMediaPreview = openMediaPreview;
  window.closeMediaPreview = closeMediaPreview;
  document.addEventListener('varoom:open-media-preview', (event) => {
    if (event.detail && event.detail.file) {
      openMediaPreview(event.detail.file);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const modal = document.getElementById('chatMediaPreviewModal');
      if (modal && !modal.hidden) {
        closeMediaPreview();
      }
    }
  });

  function ensureChatPanels() {
    if (document.getElementById('chatShareSheet')) {
      ensureMediaPreviewModal();
      return;
    }
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
      .chat-actions .info-action-report{color:inherit}
      .chat-image-preview{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:32px;background:rgba(20,22,28,.86);cursor:zoom-out}
      .chat-image-preview img{max-width:90vw;max-height:90vh;width:auto;height:auto;object-fit:contain;border-radius:8px;cursor:default}
      .chat-media-preview-composer{position:absolute;inset:0;z-index:35;display:flex;flex-direction:column;background-repeat:repeat!important;background-position:left top!important;background-size:min(100%,414px) auto!important;background-attachment:scroll!important;border:none!important;box-shadow:none!important;overflow:hidden}
      .chat-media-preview-composer[hidden]{display:none!important}
      [data-theme="dark"] .chat-media-preview-composer{background-color:#0F0D0D!important;background-image:url("/assets/chatbackground.png")!important;color:var(--text-dark,#F5EFEC)}
      html:not([data-theme="dark"]) .chat-media-preview-composer{background-color:var(--white,#ffffff)!important;background-image:url("/assets/chatbackground-light.png")!important;color:var(--text-dark,#14161c)}
      .chat-media-preview-header{display:flex;align-items:center;justify-content:flex-start;padding:16px 24px 8px;background:transparent!important;flex-shrink:0}
      .chat-media-preview-close{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;cursor:pointer;transition:background .15s ease,transform .1s ease}
      [data-theme="dark"] .chat-media-preview-close{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:var(--text-dark,#F5EFEC)}
      [data-theme="dark"] .chat-media-preview-close:hover{background:rgba(255,255,255,.16)}
      html:not([data-theme="dark"]) .chat-media-preview-close{background:rgba(0,0,0,.05);border:1px solid rgba(0,0,0,.08);color:var(--text-dark,#14161c)}
      html:not([data-theme="dark"]) .chat-media-preview-close:hover{background:rgba(0,0,0,.1)}
      .chat-media-preview-close:active{transform:scale(.95)}
      .chat-media-preview-close .icon{width:18px;height:18px}
      .chat-media-preview-body{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px 24px;background:transparent!important;overflow:hidden;user-select:none}
      .chat-media-preview-image{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border-radius:8px;pointer-events:none}
      .chat-media-preview-footer{display:flex;align-items:center;gap:12px;padding:14px 24px 20px;flex-shrink:0;max-width:760px;width:100%;margin:0 auto;box-sizing:border-box;background:transparent!important;border:none!important;box-shadow:none!important}
      .chat-media-preview-caption-wrap{flex:1;min-width:0;border-radius:24px;padding:10px 18px;display:flex;align-items:center;transition:border-color .15s ease,background .15s ease}
      [data-theme="dark"] .chat-media-preview-caption-wrap{background:#18181B;border:1px solid #27272A}
      [data-theme="dark"] .chat-media-preview-caption-wrap:focus-within{border-color:rgba(255,255,255,.3)}
      html:not([data-theme="dark"]) .chat-media-preview-caption-wrap{background:#ffffff;border:1px solid #e2e5ea}
      html:not([data-theme="dark"]) .chat-media-preview-caption-wrap:focus-within{border-color:#9ca3af}
      .chat-media-preview-caption-input{width:100%;border:0;outline:none;background:transparent!important;font-family:inherit;font-size:14px;line-height:20px}
      [data-theme="dark"] .chat-media-preview-caption-input{color:var(--text-dark,#F5EFEC)}
      [data-theme="dark"] .chat-media-preview-caption-input::placeholder{color:var(--text-gray,rgba(245,239,236,.58))}
      html:not([data-theme="dark"]) .chat-media-preview-caption-input{color:var(--text-dark,#14161c)}
      html:not([data-theme="dark"]) .chat-media-preview-caption-input::placeholder{color:var(--text-gray,#6f737a)}
      .chat-media-preview-send-btn{width:44px;height:44px;border-radius:50%;border:0;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:transform .15s ease,opacity .15s ease,background-color .15s ease}
      [data-theme="dark"] .chat-media-preview-send-btn{background:#27272A;border:1px solid rgba(255,255,255,.1);color:#ffffff}
      [data-theme="dark"] .chat-media-preview-send-btn:hover{background:#3f3f46;transform:scale(1.04)}
      html:not([data-theme="dark"]) .chat-media-preview-send-btn{background:#18181B;border:1px solid #27272A;color:#ffffff}
      html:not([data-theme="dark"]) .chat-media-preview-send-btn:hover{background:#27272A;transform:scale(1.04)}
      .chat-media-preview-send-btn:active{transform:scale(.94)}
      .chat-media-preview-send-btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
      .chat-media-preview-send-btn .icon{width:18px;height:18px}
      .chat-message-caption{margin-top:6px;font-size:13.5px;line-height:1.45;word-break:break-word;white-space:pre-wrap;padding:0 2px;color:var(--text-dark,#14161c)}
      [data-theme="dark"] .chat-message-caption{color:var(--ink,#fbfbfc)}
      @media(max-width:760px){
        .chat-media-preview-header{padding:12px 14px 6px}
        .chat-media-preview-body{padding:8px 12px}
        .chat-media-preview-footer{padding:10px 14px calc(14px + env(safe-area-inset-bottom,0px));gap:10px}
        .chat-media-preview-send-btn{width:42px;height:42px}
        .chat-sheet{padding:14px 16px}
        .chat-sheet-list{grid-template-columns:1fr 1fr}
      }
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
    ensureMediaPreviewModal();
    let savedInformationContent = null;
    const restoreInformationPanel = async () => {
      const info = $('.info-col');
      if (info) info.classList.remove('chat-settings-open');
      if (info && savedInformationContent) {
        clear(info);
        info.appendChild(savedInformationContent);
        savedInformationContent = null;
        return;
      }
      if (state.activeId) {
        await selectConversation(state.activeId);
      } else {
        renderProfile(null);
        renderInfoAttachments([]);
      }
    };
    const openChatSettings = () => {
      const currentPath = `${window.location.pathname}${window.location.search || ''}`;
      if (!isMobile()) {
        const info = $('.info-col');
        if (!info) return;
        if (info.classList.contains('chat-settings-open')) return;
        info.classList.remove('collapsed');
        info.classList.add('chat-settings-open');
        const toggle = $('#toggle-info-panel');
        if (toggle) toggle.classList.add('active');
        savedInformationContent = document.createDocumentFragment();
        while (info.firstChild) savedInformationContent.appendChild(info.firstChild);
        const heading = document.createElement('div');
        heading.className = 'chat-settings-panel-head';
        const title = document.createElement('span');
        title.textContent = 'Chat Settings';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'info-close-btn';
        close.setAttribute('aria-label', 'Close Chat Settings');
        close.title = 'Close Chat Settings';
        close.innerHTML = '<svg class="icon"><use href="#i-close"/></svg>';
        close.addEventListener('click', restoreInformationPanel);
        heading.append(title, close);
        const frame = document.createElement('iframe');
        frame.className = 'chat-settings-frame';
        frame.title = 'Chat Settings';
        frame.src = `/chat-settings?embedded=1&role=${encodeURIComponent(state.role)}`;
        info.append(heading, frame);
        return;
      }
      const target = `/chat-settings?returnTo=${encodeURIComponent(currentPath)}`;
      window.location.assign(target);
    };
    window.addEventListener('varoom:chat-settings-requested', openChatSettings);
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin || !event.data || event.data.type !== 'varoom:chat-settings-close') return;
      restoreInformationPanel();
    });
    document.querySelectorAll('.chat-settings-trigger, .mobile-chat-settings').forEach((button) => {
      button.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('varoom:chat-settings-requested'));
      });
    });
    if (isMobile()) {
      $('.search-box input').placeholder = 'Search conversations...';
      const preview = document.createElement('div');
      preview.className = 'mobile-preview';
      preview.id = 'mobileComposerPreview';
      $('.chat-input-area').prepend(preview);
      $('.chat-header .mobile-back').addEventListener('click', showMobileInbox);
      const identity = $('.chat-header-identity');
      identity.setAttribute('role', 'button');
      identity.setAttribute('tabindex', '0');
      identity.setAttribute('aria-label', 'Open conversation information');
      const openConversationInfo = () => showMobileInfo('conversation');
      identity.addEventListener('click', openConversationInfo);
      identity.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openConversationInfo();
        }
      });
      $('.info-close-btn').addEventListener('click', () => {
        if (state.mobileInfoReturn === 'inbox') showMobileInbox();
        else showMobileConversation();
      });
    }
  }

  function showMobileInbox() {
    if (!isMobile()) return;
    state.mobileView = 'inbox';
    document.body.classList.remove('chat-page-context');
    $('.contacts-col').classList.remove('mobile-hidden');
    $('.chat-col').classList.remove('mobile-visible');
    $('.info-col').classList.remove('mobile-visible');
  }
  function showMobileConversation() {
    if (!isMobile() || !state.activeId) return;
    state.mobileView = 'conversation';
    document.body.classList.add('chat-page-context');
    $('.contacts-col').classList.add('mobile-hidden');
    $('.info-col').classList.remove('mobile-visible');
    $('.chat-col').classList.add('mobile-visible');
  }
  function showMobileInfo(returnTo) {
    if (!isMobile() || !state.activeId || state.mobileView !== 'conversation') return;
    state.mobileInfoReturn = returnTo || 'conversation';
    state.mobileView = 'info';
    document.body.classList.add('chat-page-context');
    $('.contacts-col').classList.add('mobile-hidden');
    $('.chat-col').classList.remove('mobile-visible');
    $('.info-col').classList.remove('collapsed');
    $('.info-col').classList.add('mobile-visible');
  }

  function updateMobilePreview() {
    const preview = $('#mobileComposerPreview');
    if (!preview) return;
    const pending = state.pendingAttachment;
    preview.textContent = pending ? `${pending.kind === 'listing' ? 'Listing' : pending.kind === 'photo' ? 'Photo' : 'File'}: ${pending.name || pending.listing?.title || ''}` : '';
    preview.classList.toggle('has-content', !!pending);
  }

  function configureAttachmentControls() {
    const isHost = state.role === 'host';
    const fileButton = $('.attach-icons button.share-file');
    const listingButton = $('.attach-icons button[title="Share listing"]');
    if (fileButton) fileButton.hidden = !isHost;
    if (listingButton) listingButton.hidden = !isHost;
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
      const fallbackUrl = photo ? window.supabaseClient.storage.from('listing-photos').getPublicUrl(photo.storage_path).data.publicUrl : '';
      image.src = fallbackUrl;
      if (window.VaRoomChatCache && photo && photo.storage_path) {
        const photoKey = 'listing-photo:' + photo.storage_path;
        window.VaRoomChatCache.getMediaUrl(photoKey).then((cached) => {
          if (cached && cached.url) {
            image.src = cached.url;
          } else {
            window.VaRoomChatCache.fetchAndCacheMedia(photoKey, fallbackUrl, { type: 'image' }).then((cachedUrl) => {
              if (cachedUrl) image.src = cachedUrl;
            }).catch(() => {});
          }
        }).catch(() => {});
      }
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
        if (window.VaRoomChatCache && video.videoId && video.rawPlaybackUrl) {
          const videoKey = 'listing-video:' + video.videoId;
          window.VaRoomChatCache.getMediaUrl(videoKey).then((cached) => {
            if (cached && cached.url) {
              player.src = cached.url;
            } else {
              player.addEventListener('play', () => {
                window.VaRoomChatCache.fetchAndCacheMedia(videoKey, video.rawPlaybackUrl, { type: 'video' }).catch(() => {});
              }, { once: true });
            }
          }).catch(() => {});
        }
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
        if (result.message) {
          if (window.VaRoomChatCache && state.session && state.session.user && state.session.user.id) {
            window.VaRoomChatCache.appendMessage(state.session.user.id, state.activeId, result.message).catch(() => {});
            window.VaRoomChatCache.updateInboxConversation(state.session.user.id, state.activeId, { lastMessage: result.message }).catch(() => {});
          }
          if (!current.querySelector(`[data-message-id="${result.message.id}"]`)) {
            current.appendChild(messageRow(result.message));
          }
        }
        if (result.message && window.VaRoomChatCache && state.session && state.session.user) {
          window.VaRoomChatCache.appendMessage(state.session.user.id, state.activeId, result.message).catch(() => {});
        }
      }
      $('.messages').scrollTop = $('.messages').scrollHeight;
      closeSheet('chatShareSheet');
    });
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
  }

  function emptyStateCopy() {
    return state.role === 'host'
      ? { heading: 'No conversations yet', detail: 'When clients reach out, your conversations will appear here.' }
      : { heading: 'Start a conversation', detail: 'Chat with a host and your conversations will appear here.' };
  }

  function renderEmptyState() {
    closeMediaPreview();
    renderPinnedMessage([]);
    const copy = emptyStateCopy();
    const list = $('#contactList');
    clear(list);
    list.removeAttribute('aria-busy');
    const inboxState = document.createElement('li');
    inboxState.className = 'inbox-empty-state';
    inboxState.setAttribute('aria-label', `${copy.heading}. ${copy.detail}`);
    inboxState.innerHTML = '<strong></strong><span></span>';
    inboxState.querySelector('strong').textContent = copy.heading;
    inboxState.querySelector('span').textContent = copy.detail;
    list.appendChild(inboxState);

    const messages = $('.messages');
    clear(messages);
    messages.classList.remove('chat-loading');
    messages.classList.add('empty-state');
    const conversationState = document.createElement('div');
    conversationState.className = 'chat-empty-state';
    conversationState.setAttribute('role', 'status');
    conversationState.innerHTML = '<h2></h2><p></p>';
    conversationState.querySelector('h2').textContent = copy.heading;
    conversationState.querySelector('p').textContent = copy.detail;
    messages.appendChild(conversationState);
    $('.chat-col').classList.add('empty-conversation');
    $('.info-col').classList.add('collapsed');
  }

  function showConversationInterface() {
    $('.messages').classList.remove('empty-state');
    $('.chat-col').classList.remove('empty-conversation');
    $('.info-col').classList.remove('collapsed');
    if (!isMobile()) {
      const toggle = $('#toggle-info-panel');
      if (toggle) { toggle.classList.add('active'); toggle.setAttribute('aria-expanded', 'true'); }
    }
  }

  function renderChatSkeleton() {
    renderPinnedMessage([]);
    const messages = $('.messages');
    clear(messages);
    messages.classList.remove('empty-state');
    messages.classList.add('chat-loading');
    messages.setAttribute('aria-busy', 'true');
    [
      ['in', ['medium', 'short']],
      ['out', ['long', 'short']],
      ['in', ['long', 'medium', 'short']],
      ['out', ['medium', 'short']],
    ].forEach(([side, widths]) => {
      const row = document.createElement('div');
      row.className = `chat-skeleton-row ${side}`;
      widths.forEach((width) => {
        const line = document.createElement('span');
        line.className = `chat-skeleton-line ${width}`;
        row.appendChild(line);
      });
      messages.appendChild(row);
    });
  }

  function renderInboxSkeleton() {
    const list = $('#contactList');
    clear(list);
    list.setAttribute('aria-busy', 'true');
    for (let index = 0; index < 6; index += 1) {
      const row = document.createElement('li');
      row.className = 'inbox-skeleton';
      row.setAttribute('aria-hidden', 'true');
      row.innerHTML = '<span class="inbox-skeleton-avatar"></span><span class="inbox-skeleton-copy"><span class="inbox-skeleton-line name"></span><span class="inbox-skeleton-line preview"></span></span>';
      list.appendChild(row);
    }
  }

  function renderNoSelectionState() {
    renderPinnedMessage([]);
    const messages = $('.messages');
    clear(messages);
    messages.classList.remove('chat-loading');
    messages.classList.add('empty-state');
    const stateMessage = document.createElement('div');
    stateMessage.className = 'chat-empty-state';
    stateMessage.setAttribute('role', 'status');
    stateMessage.innerHTML = '<h2>Select a conversation</h2><p>Choose a conversation from your inbox to view messages.</p>';
    messages.appendChild(stateMessage);
    $('.chat-col').classList.add('empty-conversation');
    $('.info-col').classList.add('collapsed');
  }

  function renderConversationList() {
    const list = $('#contactList');
    clear(list);
    list.removeAttribute('aria-busy');
    const conversations = state.role === 'client' ? [elieConversation(), ...state.conversations] : state.conversations;
    conversations.forEach((conversation) => {
      const person = conversation.participant || {};
      const lastMsg = conversation.lastMessage;
      const preview = lastMsg ? (lastMsg.message_type === 'photo' ? (previewText(lastMsg.body) || 'Photo') : previewText(lastMsg.body)) : '';
      const item = document.createElement('li');
      item.className = `contact-item${conversation.id === state.activeId ? ' active' : ''}`;
      item.dataset.conversationId = conversation.id;
      const online = state.onlineConversationIds.has(conversation.id);
      item.innerHTML = `<div class="avatar-wrap"><div class="avatar-fallback" style="background:#14161c;"></div>${online ? '<span class="status-dot online"></span>' : ''}</div>
        <div class="contact-body"><div class="contact-top"><span class="contact-name"></span><span class="contact-time"></span></div>
        <div class="contact-bottom"><span class="contact-preview"></span></div></div>
        <button class="conversation-menu" type="button" aria-label="Conversation actions" title="Conversation actions"><svg class="icon"><use href="#i-more"/></svg></button>`;
      if (conversation.isElie) {
        item.querySelector('.avatar-fallback').innerHTML = elieAvatarMarkup(40);
        item.querySelector('.avatar-fallback').style.background = '#f6f7f9';
      } else setAvatar(item.querySelector('.avatar-fallback'), person);
      item.querySelector('.contact-name').textContent = person.full_name || person.username || '';
      item.querySelector('.contact-time').textContent = formatTime(conversation.lastMessage && conversation.lastMessage.created_at);
      item.querySelector('.contact-preview').textContent = conversation.isElie ? 'Your VaRoom search assistant' : preview;
      item.querySelector('.conversation-menu').addEventListener('click', (event) => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent('varoom:conversation-actions-requested', {
          detail: { conversationId: conversation.id },
        }));
      });
      item.addEventListener('click', (event) => {
        selectConversation(conversation.id);
      });
      list.appendChild(item);
    });
  }

  function updateConversationPreview(message) {
    if (!message) return;
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
    const details = $('.profile-details');
    const detailList = details && details.querySelector('.detail-list');
    if (detailList) clear(detailList);
    if (details) details.hidden = !conversation;
    if (!conversation) return;
    const person = conversation.participant || {};
    const avatar = document.createElement('div');
    avatar.className = 'avatar-fallback';
    avatar.style.background = '#14161c';
    if (conversation.isElie) {
      avatar.innerHTML = elieAvatarMarkup(40);
      avatar.style.background = '#f6f7f9';
    } else setAvatar(avatar, person);
    const name = document.createElement('div');
    name.className = 'p-name';
    name.textContent = person.full_name || person.username || '';
    block.append(avatar, name);
    if (person.username) { const line = document.createElement('div'); line.className = 'p-line'; line.textContent = `@${person.username}`; block.appendChild(line); }
    const online = state.onlineConversationIds.has(conversation.id);
    const status = document.createElement('div');
    status.className = `profile-status${online ? ' online' : ''}`;
    status.innerHTML = '<span class="dot"></span><span></span>';
    status.querySelector('span:last-child').textContent = online ? 'Online' : 'Offline';
    block.appendChild(status);

    if (!detailList) return;
    const detailRow = (icon, label, value) => {
      const row = document.createElement('div');
      row.className = 'detail-row';
      row.innerHTML = `<svg class="icon"><use href="#${icon}"/></svg><span></span><span class="detail-value"></span>`;
      row.children[1].textContent = label;
      row.querySelector('.detail-value').textContent = value;
      detailList.appendChild(row);
    };
    if (person.phone) detailRow('i-phone', 'Phone', person.phone);
    if (conversation.created_at) detailRow('i-calendar', 'Member since', new Date(conversation.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' }));
    detailRow('i-clock', 'Local time', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }

  function renderHeaderProfile(conversation) {
    const avatar = $('.chat-header-avatar-wrap .avatar-fallback');
    if (!avatar) return;
    clear(avatar);
    avatar.style.background = '#14161c';
    avatar.style.backgroundImage = '';
    if (!conversation) return;
    setAvatar(avatar, conversation.participant || {});
  }

  function messageRow(message) {
    const row = document.createElement('div');
    const outgoing = message.sender_id === state.session.user.id;
    row.className = `msg-row ${outgoing ? 'out' : 'in'}`;
    row.dataset.messageId = message.id;
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = message.read_at && outgoing
      ? `Read ${formatTime(message.read_at)}` : formatTime(message.created_at);
    if (message.deleted_at) {
      row.classList.add('msg-deleted');
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg><span>This message was deleted</span>';
      bubble.appendChild(meta);
      row.appendChild(bubble);
      return row;
    }
    if (message.message_type === 'text') {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      if (message.reply_to_message_id) {
        const referenceLabel = message.reply_to_message
          ? message.reply_to_message.sender_id === state.session.user.id ? 'You' : 'Reply'
          : 'Reply';
        const referenceBody = message.reply_to_message && !message.reply_to_message.deleted_at
          ? previewText(message.reply_to_message.body)
          : 'This message is unavailable';
        bubble.appendChild(makeReplyReference(message.reply_to_message_id, referenceLabel, referenceBody));
      }
      const body = message.body || '';
      if (/<(?:strong|b|em|i|u|ul|ol|li|p|div|br)\b/i.test(body)) {
        const source = new DOMParser().parseFromString(body, 'text/html').body;
        const allowed = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'P', 'DIV', 'BR']);
        const appendSafe = (parent, node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            parent.appendChild(document.createTextNode(node.nodeValue));
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (!allowed.has(node.tagName)) {
            node.childNodes.forEach((child) => appendSafe(parent, child));
            return;
          }
          const copy = document.createElement(node.tagName.toLowerCase());
          node.childNodes.forEach((child) => appendSafe(copy, child));
          parent.appendChild(copy);
        };
        source.childNodes.forEach((child) => appendSafe(bubble, child));
      } else {
        bubble.appendChild(document.createTextNode(body));
      }
      bubble.appendChild(meta);
      row.appendChild(bubble);
    } else if (message.message_type === 'listing' && message.listing) {
      const card = document.createElement('div');
      card.className = 'chat-listing-card';
      const photo = message.listing.listing_photos && message.listing.listing_photos[0];
      card.innerHTML = '<div class="chat-listing-card-body"><div class="chat-listing-card-title"></div><div class="chat-listing-card-sub"></div></div>';
      if (photo) {
        const image = document.createElement('img');
        const fallbackUrl = window.supabaseClient.storage.from('listing-photos').getPublicUrl(photo.storage_path).data.publicUrl;
        image.src = fallbackUrl;
        image.alt = message.listing.title || 'Listing image';
        if (window.VaRoomChatCache && photo.storage_path) {
          const photoKey = 'listing-photo:' + photo.storage_path;
          window.VaRoomChatCache.getMediaUrl(photoKey).then((cached) => {
            if (cached && cached.url) {
              image.src = cached.url;
            } else {
              window.VaRoomChatCache.fetchAndCacheMedia(photoKey, fallbackUrl, { type: 'image' }).then((cachedUrl) => {
                if (cachedUrl) image.src = cachedUrl;
              }).catch(() => {});
            }
          }).catch(() => {});
        }
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
        if (window.VaRoomChatCache && video.videoId && video.rawPlaybackUrl) {
          const videoKey = 'listing-video:' + video.videoId;
          window.VaRoomChatCache.getMediaUrl(videoKey).then((cached) => {
            if (cached && cached.url) {
              player.src = cached.url;
            } else {
              player.addEventListener('play', () => {
                window.VaRoomChatCache.fetchAndCacheMedia(videoKey, video.rawPlaybackUrl, { type: 'video' }).catch(() => {});
              }, { once: true });
            }
          }).catch(() => {});
        }
        const existingImage = card.querySelector('img');
        if (existingImage) existingImage.replaceWith(player);
        else card.insertBefore(player, card.firstChild);
      }).catch((error) => console.error('Shared listing video unavailable:', error));
      card.appendChild(meta);
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
      card.appendChild(meta);
      row.appendChild(card);
    } else if (message.message_type === 'photo' && message.attachment_id) {
      const block = document.createElement('div');
      block.className = 'message-block';
      const image = document.createElement('img');
      image.className = 'chat-message-image';
      image.alt = message.attachment && message.attachment.original_filename || 'Shared image';
      image.style.cssText = 'display:block;max-width:320px;max-height:260px;width:auto;height:auto;object-fit:contain;border-radius:8px;cursor:zoom-in';
      const removeLoader = addMediaLoader(block);
      image.addEventListener('load', removeLoader, { once: true });
      image.addEventListener('error', removeLoader, { once: true });
      downloadAttachment(message.attachment_id).then((url) => {
        image.src = url;
        image.addEventListener('click', () => openImagePreview(url, image.alt));
      }).catch((error) => { removeLoader(); console.error('Image message unavailable:', error); });
      block.appendChild(image);
      const caption = (message.body || '').trim();
      const filename = message.attachment && message.attachment.original_filename;
      if (caption && caption !== filename) {
        const captionEl = document.createElement('div');
        captionEl.className = 'chat-message-caption';
        captionEl.textContent = caption;
        block.appendChild(captionEl);
      }
      block.appendChild(meta);
      row.appendChild(block);
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
      card.appendChild(meta);
      row.appendChild(card);
    }
    if (!row.contains(meta)) row.appendChild(meta);
    attachMessageActions(row, message);
    return row;
  }

  function renderPinnedMessage(messages) {
    const pinned = $('#pinnedMessage');
    const message = messages.find((item) => item.pinned_at && !item.deleted_at);
    if (!message) {
      pinned.hidden = true;
      pinned.querySelector('span').textContent = '';
      return;
    }
    pinned.querySelector('span').textContent = previewText(message.body) || 'Message';
    pinned.hidden = false;
  }

  function closeMessageMenu() {
    if (state.messageMenuCleanup) state.messageMenuCleanup();
    if (state.messageMenu) state.messageMenu.remove();
    state.messageMenu = null;
    state.messageMenuCleanup = null;
  }

  async function performMessageAction(message, action) {
    closeMessageMenu();
    if (action === 'reply') {
      state.replyToMessage = message;
      const label = previewText(message.body) || 'This message is unavailable';
      const input = $('.chat-input-area textarea');
      const editor = $('.desktop-composer-editor');
      const composerPreview = $('.composer-reply-preview');
      const previewLabel = composerPreview.querySelector('strong');
      const previewBody = composerPreview.querySelector('span');
      previewLabel.textContent = message.sender_id === state.session.user.id ? 'Replying to you' : 'Replying to message';
      previewBody.textContent = label;
      composerPreview.hidden = false;
      composerPreview.onclick = () => scrollToRepliedMessage(message.id);
      composerPreview.onkeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        scrollToRepliedMessage(message.id);
      };
      if (window.matchMedia('(min-width: 761px)').matches) editor.focus();
      else input.focus();
      return;
    }
    if (action === 'delete_for_everyone'
      && !window.confirm('Delete this message for everyone? This cannot be undone.')) return;
    try {
      await api(`/api/chat/conversations/${encodeURIComponent(state.activeId)}/messages/${encodeURIComponent(message.id)}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await refreshConversationMessages(state.activeId, { preserveScroll: true });
    } catch (error) {
      console.error('Unable to perform message action:', error);
      window.alert(error.message || 'Unable to update message');
    }
  }

  function attachMessageActions(row, message) {
    if (message.message_type !== 'text' || message.deleted_at) return;
    let pressTimer = null;
    let touchStart = null;
    const openAt = (x, y) => openMessageMenu(message, x, y);
    row.addEventListener('contextmenu', (event) => {
      if (isMobile()) {
        event.preventDefault();
        return;
      }
      if (event.target.closest('a,button,input,textarea,video,audio')) return;
      event.preventDefault();
      openAt(event.clientX, event.clientY);
    });
    row.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
      pressTimer = window.setTimeout(() => openAt(touchStart.x, touchStart.y), 500);
    }, { passive: true });
    row.addEventListener('touchmove', (event) => {
      if (!pressTimer || !touchStart || !event.touches.length) return;
      const touch = event.touches[0];
      if (Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > 12) {
        window.clearTimeout(pressTimer);
        pressTimer = null;
      }
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach((eventName) => row.addEventListener(eventName, () => {
      window.clearTimeout(pressTimer);
      pressTimer = null;
      touchStart = null;
    }, { passive: true }));
  }

  function openMessageMenu(message, x, y) {
    closeMessageMenu();
    const menu = document.createElement('div');
    menu.className = 'chat-message-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Message actions');
    const options = [
      ['reply', 'i-reply', 'Reply'],
      ['pin', 'i-pin', message.pinned_at ? 'Unpin message' : 'Pin message'],
      ['delete_for_me', 'i-trash', 'Delete for me'],
    ];
    if (message.sender_id === state.session.user.id) {
      options.push(['delete_for_everyone', 'i-trash', 'Delete for everyone']);
    }
    options.forEach(([action, icon, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${icon}"/></svg><span></span>`;
      button.querySelector('span').textContent = label;
      button.addEventListener('click', () => performMessageAction(message, action));
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    state.messageMenu = menu;
    document.addEventListener('pointerdown', onMessageMenuOutside);
    document.addEventListener('keydown', onMessageMenuKeydown);
    state.messageMenuCleanup = () => {
      document.removeEventListener('pointerdown', onMessageMenuOutside);
      document.removeEventListener('keydown', onMessageMenuKeydown);
    };
    function onMessageMenuOutside(event) {
      if (state.messageMenu && !state.messageMenu.contains(event.target)) closeMessageMenu();
    }
    function onMessageMenuKeydown(event) {
      if (event.key === 'Escape') closeMessageMenu();
    }
    menu.querySelector('button').focus();
  }

  async function downloadAttachment(attachmentId) {
    const cacheKey = 'attachment:' + attachmentId;
    if (window.VaRoomChatCache) {
      try {
        const cached = await window.VaRoomChatCache.getMediaUrl(cacheKey);
        if (cached && cached.url) return cached.url;
      } catch (e) {}
    }
    const result = await api(`/api/chat/attachments/${encodeURIComponent(attachmentId)}/download`);
    if (window.VaRoomChatCache && result && result.url) {
      try {
        return await window.VaRoomChatCache.fetchAndCacheMedia(cacheKey, result.url, { type: 'attachment' });
      } catch (e) {
        return result.url;
      }
    }
    return result.url;
  }

  function addMediaLoader(container) {
    const loader = document.createElement('span');
    loader.className = 'chat-media-loader';
    loader.setAttribute('aria-label', 'Loading media');
    container.appendChild(loader);
    return () => loader.remove();
  }

  async function loadListingVideo(listingId) {
    const mediaResult = await api(`/api/properties/${encodeURIComponent(listingId)}/media`);
    const video = (mediaResult.media || []).find((item) => item.type === 'video');
    if (!video) return null;
    const playback = await api(`/api/media/${encodeURIComponent(video.id)}/playback`);
    const rawThumbUrl = playback.thumbnailUrl || video.thumbnailUrl || '';
    let thumbUrl = rawThumbUrl;
    if (window.VaRoomChatCache && rawThumbUrl && video.id) {
      const thumbKey = 'listing-thumb:' + video.id;
      try {
        const cachedThumb = await window.VaRoomChatCache.getMediaUrl(thumbKey);
        if (cachedThumb && cachedThumb.url) {
          thumbUrl = cachedThumb.url;
        } else {
          thumbUrl = await window.VaRoomChatCache.fetchAndCacheMedia(thumbKey, rawThumbUrl, { type: 'image' });
        }
      } catch (e) {}
    }
    return {
      ...video,
      url: playback.url,
      thumbnailUrl: thumbUrl,
      rawPlaybackUrl: playback.url,
      videoId: video.id
    };
  }

  function renderMessages(messages, { scrollToBottom = true } = {}) {
    const container = $('.messages');
    clear(container);
    container.classList.remove('chat-loading');
    container.removeAttribute('aria-busy');
    const notice = document.createElement('div');
    notice.className = 'system-notice';
    notice.textContent = 'Your messages are encrypted and private.';
    container.appendChild(notice);
    let previousMessage = null;
    messages.forEach((message) => {
      const row = messageRow(message);
      if (previousMessage && previousMessage.sender_id === message.sender_id) row.classList.add('same-sender');
      container.appendChild(row);
      previousMessage = message;
    });
    renderPinnedMessage(messages);
    if (scrollToBottom) container.scrollTop = container.scrollHeight;
  }

  async function refreshConversationMessages(conversationId, { preserveScroll = false } = {}) {
    const container = $('.messages');
    const previousTop = container.scrollTop;
    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    const userId = state.session && state.session.user ? state.session.user.id : null;
    let messages = [];
    if (window.VaRoomChatCache && window.VaRoomChatCache.syncConversationMessages && userId) {
      messages = await window.VaRoomChatCache.syncConversationMessages(userId, conversationId, {
        accessToken: state.session.access_token,
        fetchFn: api
      });
    } else {
      const result = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`);
      messages = result.messages || [];
      if (window.VaRoomChatCache && userId) {
        window.VaRoomChatCache.setMessages(userId, conversationId, messages).catch(() => {});
      }
    }
    if (state.activeId !== conversationId) return;
    renderMessages(messages, { scrollToBottom: !preserveScroll });
    renderInfoAttachments(messages);
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) updateConversationPreview(lastMessage);
    else {
      const conversation = state.conversations.find((item) => item.id === conversationId);
      if (conversation) {
        conversation.lastMessage = null;
        renderConversationList();
      }
    }
    if (preserveScroll) {
      container.scrollTop = wasAtBottom ? container.scrollHeight : previousTop;
    }
  }

  function clearReplyState() {
    state.replyToMessage = null;
    const composerPreview = $('.composer-reply-preview');
    composerPreview.hidden = true;
    composerPreview.querySelector('strong').textContent = '';
    composerPreview.querySelector('span').textContent = '';
    composerPreview.onclick = null;
    composerPreview.onkeydown = null;
    $('.chat-input-area textarea').placeholder = 'Write a message...';
    $('.desktop-composer-editor').dataset.placeholder = 'Write a message...';
  }

  function elieRow(text, outgoing, options) {
    const row = document.createElement('div');
    row.className = `msg-row ${outgoing ? 'out' : 'in'} elie-message`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (!outgoing) {
      const avatar = document.createElement('span');
      avatar.className = 'elie-message-avatar';
      avatar.innerHTML = elieAvatarMarkup(36, options && options.typing ? 'working' : 'default');
      row.appendChild(avatar);
    }
    if (options && options.typing) {
      bubble.className = 'bubble elie-thinking-bubble';
      bubble.innerHTML = '<div class="elie-thinking-pill" role="status" aria-label="Elie is thinking"><span class="elie-thinking-orb-wrap" data-thinking-orb="true" data-orb-state="searching" data-orb-size="20" data-orb-theme="dark" aria-hidden="true"></span><span class="elie-thinking-text">Thinking....</span></div>';
    } else {
      bubble.textContent = text;
    }
    row.appendChild(bubble);
    return row;
  }

  function scrollElieToBottom() { const messages = $('.messages'); messages.scrollTop = messages.scrollHeight; }

  function renderElieIntro() {
    const messages = $('.messages'); clear(messages);
    messages.classList.remove('chat-loading');
    messages.removeAttribute('aria-busy');
    const intro = document.createElement('section');
    intro.className = 'elie-intro';
    intro.innerHTML = '<h2>Ask Elie to find you a space.</h2><p>Describe what you\'re looking for and Elie will search real VaRoom listings, with GPS-verified matches first.</p><div class="elie-suggestions"></div>';
    ['Airbnbs in Nairobi', 'Event venues in Nakuru', 'Offices in Westlands'].forEach((prompt) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = prompt;
      button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('varoom:elie-prompt', { detail: prompt })));
      intro.querySelector('.elie-suggestions').appendChild(button);
    });
    messages.appendChild(intro);
  }

  function appendElieResults(data, query) {
    const messages = $('.messages');
    if (data.reply) messages.appendChild(elieRow(data.reply, false));
    if (data.news && data.news.length) {
      const wrap = document.createElement('div'); wrap.className = 'elie-results';
      data.news.forEach((item) => {
        const card = document.createElement('a'); card.className = 'elie-result-card'; card.href = item.source_url || '#'; card.target = '_blank'; card.rel = 'noopener noreferrer';
        card.innerHTML = '<strong></strong><span></span>'; card.querySelector('strong').textContent = item.title || 'Property news'; card.querySelector('span').textContent = item.summary || item.source_name || 'Read source'; wrap.appendChild(card);
      }); messages.appendChild(wrap);
    }
    if (data.listings && data.listings.length) {
      const wrap = document.createElement('div'); wrap.className = 'elie-results';
      data.listings.forEach((listing) => {
        const card = document.createElement('a'); card.className = 'elie-result-card elie-listing-card'; card.href = `/booking?listing=${encodeURIComponent(listing.id)}`;
        const title = document.createElement('strong'); title.textContent = listing.title || 'Listing';
        const meta = document.createElement('span'); meta.textContent = [listing.location_text, listing.size_or_type, listing.price_amount ? `KSh ${Number(listing.price_amount).toLocaleString()}` : ''].filter(Boolean).join(' · ');
        card.append(title, meta); if (listing.verified) { const verified = document.createElement('em'); verified.textContent = 'GPS verified'; card.appendChild(verified); } wrap.appendChild(card);
      }); messages.appendChild(wrap);
    }
    if (data.suggestion) messages.appendChild(elieRow(data.suggestion, false));
    scrollElieToBottom();
  }

  function appendElieError(errorText, retryText) {
    const messages = $('.messages');
    if (!messages) return;
    const row = document.createElement('div');
    row.className = 'msg-row in elie-message elie-error-row';
    const avatar = document.createElement('span');
    avatar.className = 'elie-message-avatar';
    avatar.innerHTML = elieAvatarMarkup(36, 'default');
    row.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'bubble elie-error-bubble';

    const msgDiv = document.createElement('div');
    msgDiv.textContent = errorText;
    bubble.appendChild(msgDiv);

    if (retryText) {
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'elie-retry-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.setAttribute('aria-label', 'Retry searching with Elie');
      retryBtn.style.cssText = 'display:inline-flex; align-items:center; gap:4px; margin-top:8px; padding:4px 12px; font-size:12px; font-weight:600; border-radius:12px; border:1px solid currentColor; background:transparent; color:inherit; cursor:pointer; opacity:0.9;';
      retryBtn.addEventListener('click', () => {
        row.remove();
        const desktop = Boolean(document.getElementById('desktopEditor'));
        const desktopEditor = document.getElementById('desktopEditor');
        const input = document.querySelector('.chat-input');
        if (desktop && desktopEditor) {
          desktopEditor.textContent = retryText;
        } else if (input) {
          input.value = retryText;
        }
        updateComposerState();
        sendText();
      });
      bubble.appendChild(retryBtn);
    }
    row.appendChild(bubble);
    messages.appendChild(row);
    scrollElieToBottom();
  }

  async function loadElieSession(sessionId) {
    state.elie.sessionId = sessionId; state.elie.history = [];
    state.selectionGeneration++;
    const messages = $('.messages'); clear(messages);
    const result = await window.supabaseClient.from('elie_messages').select('role,body').eq('session_id', sessionId).order('created_at', { ascending: true });
    if (result.error) throw result.error;
    if (!result.data || !result.data.length) return renderElieIntro();
    result.data.forEach((message) => { messages.appendChild(elieRow(message.body, message.role === 'user')); state.elie.history.push({ role: message.role, text: message.body }); });
    scrollElieToBottom();
  }

  async function persistElieMessage(role, text) {
    try {
      if (!state.session || !state.session.user) return;
      if (!state.elie.sessionId) {
        const created = await window.supabaseClient.from('elie_sessions').insert({ user_id: state.session.user.id, title: text.slice(0, 60) }).select().single();
        if (created.error) {
          console.warn('Elie session creation failed:', created.error);
          return;
        }
        state.elie.sessionId = created.data.id;
      }
      const insertResult = await window.supabaseClient.from('elie_messages').insert({ session_id: state.elie.sessionId, user_id: state.session.user.id, role, body: text });
      if (insertResult.error) {
        console.warn('Elie message insert failed:', insertResult.error);
        return;
      }
      await window.supabaseClient.from('elie_sessions').update({ updated_at: new Date().toISOString() }).eq('id', state.elie.sessionId);
    } catch (err) {
      console.warn('Elie persistence error:', err);
    }
  }

  function formatHistoryDate(value) {
    if (!value) return '';
    const date = new Date(value);
    const now = new Date();
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday, ${timeStr}`;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${timeStr}`;
  }

  function closeElieHistory() {
    const panel = document.getElementById('elieHistoryPanel');
    if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      if (!panel.classList.contains('open')) panel.hidden = true;
    }, 220);
  }

  async function openElieHistory() {
    if (!isElie()) return;
    const panel = document.getElementById('elieHistoryPanel');
    if (!panel) return;
    panel.hidden = false;
    void panel.offsetWidth;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');

    const list = document.getElementById('elieHistoryList');
    if (!list) return;
    clear(list);
    const loading = document.createElement('div');
    loading.className = 'elie-history-empty';
    loading.textContent = 'Loading past searches…';
    list.appendChild(loading);

    try {
      const result = await window.supabaseClient
        .from('elie_sessions')
        .select('id,title,updated_at,created_at')
        .eq('user_id', state.session.user.id)
        .order('updated_at', { ascending: false })
        .limit(30);

      clear(list);
      if (result.error) throw result.error;
      if (!result.data || !result.data.length) {
        const empty = document.createElement('div');
        empty.className = 'elie-history-empty';
        empty.textContent = 'No past searches yet.';
        list.appendChild(empty);
        return;
      }

      result.data.forEach((session) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'elie-history-item';
        item.innerHTML = `
          <div class="elie-history-item-copy">
            <span class="elie-history-item-title"></span>
            <span class="elie-history-item-time"></span>
          </div>
          <svg class="icon elie-history-item-arrow" aria-hidden="true"><use href="#i-chevron-right"/></svg>
        `;
        item.querySelector('.elie-history-item-title').textContent = session.title || 'Search conversation';
        item.querySelector('.elie-history-item-time').textContent = formatHistoryDate(session.updated_at || session.created_at);
        item.addEventListener('click', async () => {
          closeElieHistory();
          await loadElieSession(session.id);
        });
        list.appendChild(item);
      });
    } catch (error) {
      console.error('Failed to load Elie history:', error);
      clear(list);
      const errorEl = document.createElement('div');
      errorEl.className = 'elie-history-empty';
      errorEl.textContent = 'Unable to load search history.';
      list.appendChild(errorEl);
    }
  }

  function toggleElieHistory() {
    const panel = document.getElementById('elieHistoryPanel');
    if (panel && panel.classList.contains('open') && !panel.hidden) {
      closeElieHistory();
    } else {
      openElieHistory();
    }
  }

  function syncComposerMode() {
    const isElieActive = isElie();
    const chatCol = $('.chat-col');
    const composer = $('.chat-input-area');
    if (chatCol) {
      chatCol.classList.toggle('is-elie', isElieActive);
      if (isElieActive) chatCol.setAttribute('data-conversation-type', 'elie');
      else chatCol.removeAttribute('data-conversation-type');
    }
    if (composer) {
      composer.classList.toggle('is-elie', isElieActive);
      if (isElieActive) composer.setAttribute('data-composer-mode', 'elie');
      else composer.removeAttribute('data-composer-mode');
    }
    if (isElieActive) {
      state.pendingAttachment = null;
      updateMobilePreview();
    } else {
      closeElieHistory();
    }
    window.dispatchEvent(new CustomEvent('varoom:active-conversation-changed', {
      detail: { id: state.activeId, isElie: isElieActive }
    }));
  }

  async function selectElieConversation() {
    closeElieHistory();
    closeMessageMenu();
    clearReplyState();
    renderPinnedMessage([]);
    state.activeId = ELIE_ID; state.elie.sessionId = null; state.elie.history = [];
    showConversationInterface(); renderConversationList();
    $('#chatName').textContent = 'Elie'; $('#statusText').textContent = 'Your VaRoom search assistant'; $('#statusDot').classList.remove('online');
    const historyButton = document.querySelector('.chat-header-actions button:last-child');
    if (historyButton) { historyButton.title = 'Search history'; historyButton.setAttribute('aria-label', 'Search history'); historyButton.innerHTML = '<svg class="icon"><use href="#i-clock"/></svg>'; }
    const avatar = $('.chat-header-avatar-wrap .avatar-fallback'); if (avatar) { avatar.style.background = '#f6f7f9'; avatar.innerHTML = elieAvatarMarkup(40); }
    renderElieInformation(); $('.info-col').classList.add('collapsed'); renderElieIntro();
    syncComposerMode();
    if (isMobile()) showMobileConversation();
  }

  function renderElieInformation() {
    const block = $('.profile-block');
    if (block) {
      clear(block);
      const avatar = document.createElement('div'); avatar.className = 'avatar-fallback'; avatar.style.background = '#f6f7f9';
      avatar.innerHTML = elieAvatarMarkup(40);
      const name = document.createElement('div'); name.className = 'p-name'; name.textContent = 'Elie';
      const label = document.createElement('div'); label.className = 'p-line'; label.textContent = 'Your VaRoom search assistant';
      block.append(avatar, name, label);
    }
    ['.profile-details', '.info-media-section', '.info-files-section', '.info-links-section'].forEach((selector) => {
      const section = $(selector); if (section) section.hidden = true;
    });
    const actions = $('.chat-actions'); if (actions) actions.hidden = true;
    const info = $('.info-col');
    if (info && !info.querySelector('.elie-about')) {
      const about = document.createElement('section'); about.className = 'info-section elie-about';
      about.innerHTML = '<div class="info-section-head"><span class="label">About Elie</span></div><p></p>';
      about.querySelector('p').textContent = 'Elie helps you find real VaRoom spaces using natural language. Ask about stays, event venues, offices, locations, budgets, or guest capacity.';
      info.appendChild(about);
    }
  }

  function renderInfoAttachments(messages) {
    const attachments = messages.filter((message) => message.attachment_id && message.message_type !== 'voice');
    const mediaSection = $('.info-media-section');
    const filesSection = $('.info-files-section');
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
      const removeLoader = addMediaLoader(thumb);
      image.addEventListener('load', removeLoader, { once: true });
      image.addEventListener('error', removeLoader, { once: true });
      downloadAttachment(message.attachment_id).then((url) => { image.src = url; }).catch((error) => { removeLoader(); console.error('Image unavailable:', error); });
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
    const linksSection = $('.info-links-section');
    if (linksSection) linksSection.hidden = true;
  }

  async function selectConversation(id) {
    if (id === ELIE_ID) return selectElieConversation();
    closeElieHistory();
    closeMediaPreview();
    closeMessageMenu();
    clearReplyState();
    const selectionGeneration = ++state.selectionGeneration;
    const previousConversationId = state.activeId;
    state.activeId = id;
    renderConversationList();
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) return;
    showConversationInterface();
    syncComposerMode();
    const historyButton = document.querySelector('.chat-header-actions button:last-child');
    if (historyButton) { historyButton.title = 'More'; historyButton.setAttribute('aria-label', 'More'); historyButton.innerHTML = '<svg class="icon"><use href="#i-more"></use></svg>'; }
    const person = conversation.participant || {};
    $('#chatName').textContent = person.full_name || person.username || '';
    $('#statusText').textContent = '';
    $('#statusDot').classList.remove('online');
    renderHeaderProfile(conversation);
    renderProfile(conversation);
    const userId = state.session ? state.session.user.id : null;
    let cachedMessages = null;
    if (window.VaRoomChatCache && userId) {
      try {
        cachedMessages = await window.VaRoomChatCache.getMessages(userId, id);
      } catch (err) {
        console.warn('[Chats] Messages cache read error:', err);
      }
    }
    if (selectionGeneration !== state.selectionGeneration || state.activeId !== id) return;

    if (cachedMessages && Array.isArray(cachedMessages) && cachedMessages.length > 0) {
      renderMessages(cachedMessages, { scrollToBottom: true });
      renderInfoAttachments(cachedMessages);
    } else {
      renderChatSkeleton();
    }
    const about = $('.elie-about'); if (about) about.remove();
    const actions = $('.chat-actions'); if (actions) actions.hidden = false;
    const previousChannel = state.channel;
    state.channel = null;
    if (previousChannel) {
      state.onlineConversationIds.delete(previousConversationId);
      await previousChannel.unsubscribe();
      renderConversationList();
    }

    let fetchUrl = `/api/chat/conversations/${encodeURIComponent(id)}/messages`;
    const newestCached = cachedMessages && cachedMessages.length > 0 ? cachedMessages[cachedMessages.length - 1] : null;
    if (newestCached && newestCached.created_at) {
      fetchUrl += `?since=${encodeURIComponent(newestCached.created_at)}`;
    }

    let finalMessages = cachedMessages || [];
    try {
      if (window.VaRoomChatCache && window.VaRoomChatCache.syncConversationMessages && userId) {
        finalMessages = await window.VaRoomChatCache.syncConversationMessages(userId, id, {
          accessToken: state.session.access_token,
          fetchFn: api
        });
      } else {
        const result = await api(fetchUrl);
        if (newestCached && cachedMessages) {
          finalMessages = await window.VaRoomChatCache.mergeMessages(userId, id, result.messages || []);
        } else {
          finalMessages = result.messages || [];
          if (window.VaRoomChatCache && userId) {
            await window.VaRoomChatCache.setMessages(userId, id, finalMessages);
          }
        }
      }

      if (selectionGeneration !== state.selectionGeneration || state.activeId !== id) return;

      if (!newestCached || (finalMessages && finalMessages.length > 0)) {
        renderMessages(finalMessages, { scrollToBottom: true });
        renderInfoAttachments(finalMessages);
      }
      const lastMessage = finalMessages[finalMessages.length - 1];
      if (lastMessage) updateConversationPreview(lastMessage);
    } catch (syncError) {
      console.error('Conversation message sync failed:', syncError);
      if (!cachedMessages || cachedMessages.length === 0) {
        const container = $('.messages');
        clear(container);
        container.classList.remove('chat-loading');
        container.removeAttribute('aria-busy');
        const errorNotice = document.createElement('div');
        errorNotice.className = 'system-notice';
        errorNotice.textContent = 'Unable to load messages. Please check your connection.';
        container.appendChild(errorNotice);
      }
    }
    if (isMobile()) showMobileConversation();
    api(`/api/chat/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }).catch((err) => {
      console.warn('Unable to mark conversation as read:', err);
    });
    if (window.VaroomSidebar && window.VaroomSidebar.initCounts) {
      window.VaroomSidebar.initCounts({ supabaseClient: window.supabaseClient });
    }
    if (selectionGeneration !== state.selectionGeneration || state.activeId !== id) return;
    const channelGeneration = ++state.channelGeneration;
    const channel = window.supabaseClient.channel(`chat:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async (payload) => {
        if (selectionGeneration !== state.selectionGeneration
          || channelGeneration !== state.channelGeneration
          || state.activeId !== id) return;
        const current = $('.messages');
        const messageId = payload.new && payload.new.id;
        if (!messageId || current.querySelector(`[data-message-id="${messageId}"]`)) return;
        try {
          const result = await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages`);
          if (selectionGeneration !== state.selectionGeneration
            || channelGeneration !== state.channelGeneration
            || state.activeId !== id) return;
          const message = (result.messages || []).find((item) => item.id === messageId);
          if (!message || current.querySelector(`[data-message-id="${message.id}"]`)) return;
          if (window.VaRoomChatCache && userId) {
            window.VaRoomChatCache.appendMessage(userId, id, message).catch(() => {});
            window.VaRoomChatCache.updateInboxConversation(userId, id, { lastMessage: message }).catch(() => {});
          }
          const previousRow = current.lastElementChild;
          const row = messageRow(message);
          if (previousRow && previousRow.classList.contains(message.sender_id === state.session.user.id ? 'out' : 'in')) row.classList.add('same-sender');
          current.appendChild(row); current.scrollTop = current.scrollHeight;
          updateConversationPreview(message);
          if (window.VaRoomChatCache && userId) {
            window.VaRoomChatCache.appendMessage(userId, id, message).catch(() => {});
          }
        } catch (error) {
          console.error('Unable to load new chat message:', error);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async () => {
        if (selectionGeneration !== state.selectionGeneration
          || channelGeneration !== state.channelGeneration
          || state.activeId !== id) return;
        try {
          await refreshConversationMessages(id, { preserveScroll: true });
        } catch (error) {
          console.error('Unable to refresh changed chat message:', error);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_user_deletions', filter: `conversation_id=eq.${id}` }, async () => {
        if (selectionGeneration !== state.selectionGeneration
          || channelGeneration !== state.channelGeneration
          || state.activeId !== id) return;
        try {
          await refreshConversationMessages(id, { preserveScroll: true });
        } catch (error) {
          console.error('Unable to refresh deleted chat message:', error);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        if (selectionGeneration !== state.selectionGeneration
          || channelGeneration !== state.channelGeneration
          || state.activeId !== id) return;
        const online = Object.keys(channel.presenceState()).length > 1;
        if (online) state.onlineConversationIds.add(id);
        else state.onlineConversationIds.delete(id);
        renderConversationList();
        $('#statusText').textContent = online ? 'Online' : 'Offline';
        $('#statusDot').classList.toggle('online', online);
        const activeConversation = state.conversations.find((item) => item.id === id);
        if (activeConversation) renderProfile(activeConversation);
      });
    state.channel = channel;
    await new Promise((resolve, reject) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({ user_id: state.session.user.id });
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

  async function ensureChatCache() {
    if (window.VaRoomChatCache) return window.VaRoomChatCache;
    if (typeof document !== 'undefined') {
      await new Promise((resolve) => {
        const existing = document.querySelector('script[data-chat-cache]');
        if (existing) {
          if (window.VaRoomChatCache) {
            resolve();
            return;
          }
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', resolve, { once: true });
          return;
        }
        const cacheScript = document.createElement('script');
        cacheScript.src = '/js/chat-cache.js';
        cacheScript.dataset.chatCache = 'true';
        cacheScript.async = false;
        cacheScript.onload = resolve;
        cacheScript.onerror = resolve;
        document.head.appendChild(cacheScript);
      });
    }
    return window.VaRoomChatCache || null;
  }

  async function start() {
    if (!window.supabaseClient) throw new Error('Supabase client is unavailable');
    await ensureChatCache();
    const result = await window.supabaseClient.auth.getSession();
    state.session = result.data.session;
    if (!state.session || !state.session.user) { window.location.assign('/login?next=/chats'); return; }
    const userId = state.session.user.id;

    if (window.supabaseClient.auth && window.supabaseClient.auth.onAuthStateChange) {
      window.supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          if (window.VaRoomChatCache) {
            window.VaRoomChatCache.clearUser(userId).catch(() => {});
          }
        }
      });
    }

    let renderedFromCache = false;
    if (window.VaRoomChatCache) {
      try {
        const cachedConversations = await window.VaRoomChatCache.getInbox(userId);
        if (cachedConversations && Array.isArray(cachedConversations) && cachedConversations.length > 0) {
          state.conversations = cachedConversations;
          renderConversationList();
          renderedFromCache = true;
        }
      } catch (err) {
        console.warn('[Chats] Inbox cache read warning:', err);
      }
    }

    if (!renderedFromCache) {
      renderInboxSkeleton();
    }

    const requested = new URLSearchParams(window.location.search).get('c') || new URLSearchParams(window.location.search).get('conversation') || (window.location.pathname === '/elie' ? ELIE_ID : null);

    if (renderedFromCache && requested && (requested === ELIE_ID || state.conversations.some((item) => item.id === requested))) {
      state.activeId = requested;
      selectConversation(requested).catch((err) => {
        console.warn('[Chats] Initial conversation selection from cache error:', err);
      });
    }

    try {
      let conversationsPromise;
      if (window.VaRoomChatCache && window.VaRoomChatCache.syncInbox) {
        conversationsPromise = window.VaRoomChatCache.syncInbox(userId, {
          accessToken: state.session.access_token,
          fetchFn: api
        });
      } else {
        conversationsPromise = api('/api/chat/conversations').then((data) => data.conversations || []);
      }

      const [conversations, profileResult] = await Promise.all([
        conversationsPromise,
        window.supabaseClient.from('profiles').select('role').eq('id', userId).maybeSingle()
      ]);
      if (profileResult.error) throw profileResult.error;
      state.conversations = conversations || [];
      if (window.VaRoomChatCache) {
        window.VaRoomChatCache.setInbox(userId, state.conversations).catch((err) => {
          console.warn('[Chats] Inbox cache save warning:', err);
        });
      }
      state.role = profileResult.data && profileResult.data.role === 'host' ? 'host' : 'client';
      document.documentElement.setAttribute('data-role', state.role);
      document.body.setAttribute('data-role', state.role);
      if (window.VaroomChatNavigation && window.VaroomChatNavigation.setRole) {
        window.VaroomChatNavigation.setRole(state.role);
      }
      if (window.VaroomSidebar && window.VaroomSidebar.initCounts) {
        window.VaroomSidebar.initCounts({ supabaseClient: window.supabaseClient });
      }
      configureAttachmentControls();

      state.activeId = (!isMobile() || requested === ELIE_ID) && requested && (requested === ELIE_ID || state.conversations.some((item) => item.id === requested)) ? requested : state.activeId;
      renderConversationList();

      if (state.activeId) {
        await selectConversation(state.activeId);
      } else {
        syncComposerMode();
        $('#chatName').textContent = '';
        $('#statusText').textContent = '';
        $('#statusDot').style.background = '#c7cbd1';
        clear($('.messages'));
        renderProfile(null);
        renderInfoAttachments([]);
        if (state.conversations.length) {
          renderNoSelectionState();
        } else {
          renderEmptyState();
        }
      }
    } catch (syncError) {
      console.error('Chat initial sync failed:', syncError);
      if (!renderedFromCache) {
        renderEmptyState();
      }
    }
    const search = $('.search-box input');
    search.addEventListener('input', () => {
      const term = search.value.trim().toLowerCase();
      document.querySelectorAll('#contactList .contact-item').forEach((item) => {
        item.hidden = !item.textContent.toLowerCase().includes(term);
      });
    });
    const input = $('.chat-input-area textarea');
    const desktopEditor = $('.desktop-composer-editor');
    const desktop = !isMobile() && !!desktopEditor;
    const updateComposerState = () => {
      const hasText = desktop ? !!desktopEditor.textContent.trim() : !!input.value.trim();
      const isElieActive = isElie();
      const ready = hasText || (!isElieActive && !!state.pendingAttachment);
      const composerEl = $('.chat-input-area');
      if (composerEl) {
        composerEl.classList.toggle('has-text', hasText);
        composerEl.classList.toggle('can-send', ready);
      }
      const sendBtn = document.querySelector('.attach-icons button.send-message');
      if (sendBtn) {
        sendBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
      }
      if (!desktop) {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
      }
    };
    const resetDesktopComposer = () => {
      if (!desktop) return;
      desktopEditor.innerHTML = '';
      desktopEditor.removeAttribute('style');
      desktopEditor.focus();
      const selection = window.getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(desktopEditor);
      range.collapse(true);
      selection.addRange(range);
      ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'].forEach((command) => {
        if (document.queryCommandState(command)) document.execCommand(command, false, false);
      });
    };
    input.addEventListener('input', updateComposerState);
    if (desktopEditor) desktopEditor.addEventListener('input', updateComposerState);
    updateComposerState();
    async function sendText() {
      const content = desktop
        ? desktopEditor.innerHTML.trim()
        : input.value.trim();
      const plainContent = desktop ? desktopEditor.textContent.trim() : content;
      const pending = state.pendingAttachment;
      const conversationId = state.activeId;
      const replyToMessage = state.replyToMessage;
      if ((!plainContent && !pending) || !conversationId || (desktop ? desktopEditor.getAttribute('aria-disabled') === 'true' : input.disabled)) return;
      if (!desktop) input.disabled = true;
      try {
        if (conversationId === ELIE_ID) {
          if (!plainContent) return;
          const userText = plainContent;
          const requestGeneration = ++state.selectionGeneration;

          $('.messages').appendChild(elieRow(userText, true));
          scrollElieToBottom();
          state.elie.history.push({ role: 'user', text: userText });
          persistElieMessage('user', userText);

          if (desktop) resetDesktopComposer(); else input.value = '';
          updateComposerState();

          const typing = elieRow('', false, { typing: true });
          $('.messages').appendChild(typing);
          scrollElieToBottom();

          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), 25000);

          try {
            const fresh = await window.supabaseClient.auth.getSession();
            const token = fresh && fresh.data && fresh.data.session ? fresh.data.session.access_token : null;
            if (!token) {
              throw new Error('Please log in again to use Elie.');
            }

            const response = await fetch(ELIE_API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Correlation-ID': `CLIENT-${Date.now().toString(36).toUpperCase()}`
              },
              body: JSON.stringify({ message: userText, history: state.elie.history.slice(-6) }),
              signal: controller.signal
            });

            window.clearTimeout(timeoutId);
            const data = await response.json().catch(() => ({}));
            typing.remove();

            // Guard against session switching or conversation changes while request was in-flight
            if (state.activeId !== ELIE_ID || state.selectionGeneration !== requestGeneration) {
              return;
            }

            if (!response.ok) {
              const errorMessage = data.detail || 'Something went wrong reaching Elie. Please try again.';
              appendElieError(errorMessage, userText);
              return;
            }

            if (data.reply) {
              state.elie.history.push({ role: 'elie', text: data.reply });
              persistElieMessage('elie', data.reply);
            }
            if (data.suggestion) {
              persistElieMessage('elie', data.suggestion);
            }
            appendElieResults(data, userText);
          } catch (error) {
            window.clearTimeout(timeoutId);
            typing.remove();

            if (state.activeId !== ELIE_ID || state.selectionGeneration !== requestGeneration) {
              return;
            }

            let displayMessage = 'Could not reach Elie. Please check your connection and try again.';
            if (error && error.name === 'AbortError') {
              displayMessage = 'Elie is taking longer than expected. Please try again.';
            } else if (error && error.message) {
              displayMessage = error.message;
            }
            appendElieError(displayMessage, userText);
          }
          return;
        }
        let result;
        if (!replyToMessage && !pending && plainContent.toLowerCase() === '@reply') {
          result = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/reply`, {
            method: 'POST', body: JSON.stringify({ command: '@reply' }),
          });
        } else if (pending && pending.kind === 'listing') {
          result = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
            method: 'POST', body: JSON.stringify({ content: content || pending.listing.title, listingId: pending.listing.id, messageType: 'listing' }),
          });
        } else if (pending && pending.file) {
          const init = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/upload-init`, {
            method: 'POST', body: JSON.stringify({ filename: pending.file.name, mimeType: pending.file.type, fileSize: pending.file.size, kind: pending.kind }),
          });
          const uploadResponse = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pending.file.type }, body: pending.file });
          if (!uploadResponse.ok) throw new Error('Attachment upload failed');
          await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(init.attachmentId)}/complete`, { method: 'POST', body: '{}' });
          result = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
            method: 'POST', body: JSON.stringify({ content: content || pending.file.name, attachmentId: init.attachmentId, messageType: pending.kind }),
          });
        } else {
          result = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
            method: 'POST', body: JSON.stringify({
              content,
              ...(replyToMessage ? { replyToMessageId: replyToMessage.id } : {}),
            }),
          });
        }
        if (state.activeId !== conversationId) {
          if (state.pendingAttachment === pending) {
            if (desktop) resetDesktopComposer();
            else input.value = '';
            updateComposerState();
            state.pendingAttachment = null;
            updateMobilePreview();
          }
          return;
        }
        if (desktop) resetDesktopComposer();
        else input.value = '';
        updateComposerState();
        state.pendingAttachment = null;
        updateMobilePreview();
        const current = $('.messages');
        const replyMessages = result.messages || (result.message ? [result.message] : []);
        if (window.VaRoomChatCache && state.session && state.session.user && state.session.user.id) {
          replyMessages.forEach((msg) => {
            window.VaRoomChatCache.appendMessage(state.session.user.id, conversationId, msg).catch(() => {});
          });
          const lastSent = replyMessages[replyMessages.length - 1] || result.message;
          if (lastSent) {
            window.VaRoomChatCache.updateInboxConversation(state.session.user.id, conversationId, { lastMessage: lastSent }).catch(() => {});
          }
        }
        if (result.message && replyToMessage && !pending) {
          result.message.reply_to_message = {
            id: replyToMessage.id,
            sender_id: replyToMessage.sender_id,
            body: replyToMessage.body,
            deleted_at: replyToMessage.deleted_at,
          };
        }
        replyMessages.forEach((message) => {
          if (message && !current.querySelector(`[data-message-id="${message.id}"]`)) {
            current.appendChild(messageRow(message));
          }
        });
        if (replyMessages.length) current.scrollTop = current.scrollHeight;
        if (replyToMessage && !pending) clearReplyState();
        updateConversationPreview(replyMessages[replyMessages.length - 1] || result.message);
        if (window.VaRoomChatCache && state.session && state.session.user) {
          replyMessages.forEach((msg) => {
            window.VaRoomChatCache.appendMessage(state.session.user.id, conversationId, msg).catch(() => {});
          });
        }
      } finally { if (!desktop) input.disabled = false; }
    }
    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Escape' && state.replyToMessage) {
        clearReplyState();
        return;
      }
      if (!isMobile()) return;
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      await sendText();
    });
    if (desktopEditor) desktopEditor.addEventListener('keydown', (event) => {
      if (isElie() && (event.ctrlKey || event.metaKey) && ['b', 'i', 'u', 'B', 'I', 'U'].includes(event.key)) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape' && state.replyToMessage) clearReplyState();
      if (desktop && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendText();
      }
    });
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.hidden = true; fileInput.dataset.mobileFileInput = 'true';
    document.body.appendChild(fileInput);
    const upload = async (file, kind) => {
      if (!state.activeId || isElie()) return;
      const conversationId = state.activeId;
      const init = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/upload-init`, {
        method: 'POST', body: JSON.stringify({ filename: file.name, mimeType: file.type, fileSize: file.size, kind }),
      });
      const uploadResponse = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadResponse.ok) throw new Error('Attachment upload failed');
      await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(init.attachmentId)}/complete`, { method: 'POST', body: '{}' });
      const result = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: file.name, attachmentId: init.attachmentId, messageType: kind }),
      });
      if (result && result.message && window.VaRoomChatCache && state.session && state.session.user) {
        window.VaRoomChatCache.appendMessage(state.session.user.id, conversationId, result.message).catch(() => {});
        window.VaRoomChatCache.updateInboxConversation(state.session.user.id, conversationId, { lastMessage: result.message }).catch(() => {});
      }
    };
    const imageButton = $('.attach-icons button.share-photo');
    const fileButton = $('.attach-icons button.share-file');
    imageButton.disabled = false; fileButton.disabled = false;
    imageButton.addEventListener('click', () => { fileInput.accept = 'image/*'; fileInput.dataset.kind = 'photo'; fileInput.click(); });
    fileButton.addEventListener('click', () => { fileInput.accept = ''; fileInput.dataset.kind = 'file'; fileInput.click(); });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (fileInput.dataset.kind === 'photo' || (file.type && file.type.startsWith('image/'))) {
        openMediaPreview(file);
      } else if (isMobile()) {
        state.pendingAttachment = { kind: fileInput.dataset.kind, file: file, name: file.name };
        updateMobilePreview();
      } else {
        await upload(file, fileInput.dataset.kind);
      }
      fileInput.value = '';
    });
    const bind = (element, event, handler, description) => {
      if (!element) {
        console.error(`Chat initialization: missing ${description}`);
        return;
      }
      element.addEventListener(event, handler);
    };
    bind(document.querySelector('.chat-header-actions button[title="More"]'), 'click', () => {
      if (!isElie()) window.dispatchEvent(new CustomEvent('varoom:conversation-menu-requested', { detail: { conversationId: state.activeId } }));
    }, 'conversation actions');
    ensureChatPanels();
    if (isMobile()) showMobileInbox();
    const shareButton = $('.attach-icons button[title="Share listing"]');
    if (shareButton) {
      shareButton.disabled = false;
      shareButton.addEventListener('click', openShareSheet);
    }
    const sendButton = $('.attach-icons button.send-message');
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.addEventListener('click', sendText);
    }
    const composerArea = $('.chat-input-area');
    if (composerArea) {
      composerArea.addEventListener('click', (event) => {
        if (event.target.closest('.send-message')) {
          sendText();
        }
      });
    }
    window.addEventListener('varoom:elie-prompt', async (event) => {
      if (!isElie()) return;
      if (desktop) desktopEditor.textContent = event.detail; else input.value = event.detail;
      updateComposerState(); await sendText();
    });
    const elieToggle = document.getElementById('elieHistoryToggle');
    if (elieToggle) {
      elieToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isElie()) toggleElieHistory();
      });
    }
    const elieClose = document.getElementById('elieHistoryClose');
    if (elieClose) {
      elieClose.addEventListener('click', (event) => {
        event.stopPropagation();
        closeElieHistory();
      });
    }
    const elieHistoryButton = document.querySelector('.chat-header-actions button:last-child');
    if (elieHistoryButton) {
      elieHistoryButton.disabled = false;
      elieHistoryButton.addEventListener('click', () => { if (isElie()) toggleElieHistory(); });
    }
    document.addEventListener('pointerdown', (event) => {
      const panel = document.getElementById('elieHistoryPanel');
      const toggle = document.getElementById('elieHistoryToggle');
      const historyBtn = document.querySelector('.chat-header-actions button:last-child');
      if (panel && panel.classList.contains('open') && !panel.contains(event.target)
        && (!toggle || !toggle.contains(event.target))
        && (!historyBtn || !historyBtn.contains(event.target))) {
        closeElieHistory();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const panel = document.getElementById('elieHistoryPanel');
        if (panel && panel.classList.contains('open')) {
          closeElieHistory();
        }
      }
    });
    if (isMobile()) bind($('#toggle-info-panel'), 'click', showMobileInfo, 'information panel toggle');
    const actions = document.createElement('div');
    actions.className = 'info-section chat-actions';
    actions.innerHTML = '<div class="info-section-head"><span class="label">Actions</span></div><button type="button" class="info-action info-action-report"><svg class="icon"><use href="#i-flag"/></svg>Report User</button><button type="button" class="info-action info-action-block"><svg class="icon"><use href="#i-ban"/></svg>Block User</button>';
    $('.info-col').appendChild(actions);
    actions.querySelector('.info-action-report').addEventListener('click', openReportSheet);
    actions.querySelector('.info-action-block').addEventListener('click', () => {
      const person = state.conversations.find((item) => item.id === state.activeId)?.participant || {};
      const name = person.full_name || person.username || 'this user';
      window.alert(`Blocking ${name} is not available yet.`);
    });
    if (isElie()) renderElieInformation();
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
    document.querySelectorAll('.icon-rail button:not([data-chat-nav]), .info-section-head .more').forEach((button) => {
      button.disabled = true; button.setAttribute('aria-disabled', 'true');
    });
    document.querySelectorAll('.format-icons button').forEach((button) => {
      if (!desktop) {
        button.addEventListener('click', () => {
          const marker = button.classList.contains('fmt-b') ? '**' : button.classList.contains('fmt-i') ? '_' : button.classList.contains('fmt-u') ? '__' : '- ';
          const start = input.selectionStart; const end = input.selectionEnd;
          if (start === end) return;
          input.setRangeText(`${marker}${input.value.slice(start, end)}${marker}`, start, end, 'select');
          input.focus();
        });
        return;
      }
      const command = button.classList.contains('fmt-b') ? 'bold'
        : button.classList.contains('fmt-i') ? 'italic'
          : button.classList.contains('fmt-u') ? 'underline'
            : button.classList.contains('fmt-ol') ? 'insertOrderedList' : 'insertUnorderedList';
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        desktopEditor.focus();
        document.execCommand(command, false);
        updateComposerState();
      });
    });
    document.querySelectorAll('.info-section').forEach((section, index) => {
      if (index === 2) section.hidden = true;
    });
  }

  start().catch((error) => { console.error('Chat initialization failed:', error); });
}());
