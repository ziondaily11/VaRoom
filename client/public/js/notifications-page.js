(function () {
  'use strict';

  var notifications = [];
  var currentFilter = 'all';
  var currentUser = null;
  var sidebarRenderer = null;

  var sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.innerHTML = '';
  document.querySelectorAll('.card-list').forEach(function (list) {
    list.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">Loading notifications...</div>';
  });

  var icons = {
    approved: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>',
    declined: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    request: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
  };

  function escapeHtml(value) {
    var element = document.createElement('div');
    element.textContent = value || '';
    return element.innerHTML;
  }

  function timeAgo(value) {
    var minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + 'm ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    return Math.floor(hours / 24) + 'd ago';
  }

  function groupFor(value) {
    var date = new Date(value);
    var now = new Date();
    var start = function (item) {
      return new Date(item.getFullYear(), item.getMonth(), item.getDate()).getTime();
    };
    var days = Math.round((start(now) - start(date)) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return 'Older';
  }

  function setupSidebarRenderer() {
    function navIcon(path) {
      return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    }

    function renderSidebar(profile) {
      var isHost = profile && profile.role === 'host';
      var displayName = (profile && (profile.full_name || profile.username)) || currentUser.email || 'VaRoom user';
      var roleLabel = isHost ? 'Host' : 'Client';
      var initials = displayName.trim().split(/\s+/).slice(0, 2).map(function (part) {
        return part.charAt(0);
      }).join('').toUpperCase();
      var activity = [
        '<a href="/bookings" class="nav-item">' + navIcon('<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>') + 'Bookings</a>',
        '<a href="/chats" class="nav-item">' + navIcon('<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>') + 'Chats</a>',
        '<a href="/notifications" class="nav-item active">' + navIcon('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') + 'Notifications</a>'
      ];
      if (!isHost) {
        activity.splice(0, 0, '<a href="/transactions" class="nav-item">' + navIcon('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>') + 'Transactions</a>');
      }
      var hostTools = isHost ? (
        '<div class="nav-group"><div class="nav-label">Host</div>' +
        '<a href="/list" class="nav-item">' + navIcon('<path d="M12 5v14M5 12h14"/>') + 'List a space</a>' +
        '<a href="/host-home" class="nav-item">' + navIcon('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7.5 9h9M7.5 13h9M7.5 17h5"/>') + 'My Listings</a>' +
        '<a href="/payments" class="nav-item">' + navIcon('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>') + 'Payments</a>' +
        '<a href="/analytics" class="nav-item">' + navIcon('<path d="M4 19V10M11 19V5M18 19v-7M3 19h18"/>') + 'Analytics</a></div>'
      ) : '';
      sidebar.innerHTML =
        '<button class="drawer-close" type="button" aria-label="Close menu">' +
          navIcon('<path d="M18 6 6 18M6 6l12 12"/>') +
        '</button>' +
        '<a href="' + (isHost ? '/host-home' : '/client-home') + '" class="brand">' +
          '<span class="brand-mark">' + navIcon('<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>') + '</span>' +
          '<span class="brand-name"><span class="va">Va</span><span class="room">Room</span></span>' +
        '</a>' +
        '<a href="/marketplace" class="nav-item">' + navIcon('<circle cx="12" cy="12" r="9"/><path d="m15 9-2 6-6 2 2-6 6-2Z"/>') + 'Marketplace</a>' +
        '<a href="/marketplace" class="nav-item">' + navIcon('<path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z"/>') + 'Saved</a>' +
        '<div class="nav-group"><div class="nav-label">My activity</div>' + activity.join('') + '</div>' +
        hostTools +
        '<div class="nav-group"><div class="nav-label">Account</div>' +
          '<a href="/profile" class="nav-item">' + navIcon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>') + 'Profile</a>' +
          '<a href="/settings" class="nav-item">' + navIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z"/>') + 'Settings</a>' +
          '<a href="/support" class="nav-item">' + navIcon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.6-2.4 1.9-2.4 3.5M12 17.2v.1"/>') + 'Help &amp; Support</a>' +
          '<button type="button" class="nav-item danger" id="sidebar-logout">' + navIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>') + 'Log out</button>' +
        '</div>' +
        '<div class="sidebar-footer"><div class="user-card"><div class="avatar">' + escapeHtml(initials) + '</div><div class="user-meta"><div class="user-name">' + escapeHtml(displayName) + '</div><div class="user-role">' + roleLabel + '</div></div></div></div>';
      sidebar.querySelector('.drawer-close').addEventListener('click', function () {
        document.body.classList.remove('sidebar-open');
      });
      sidebar.querySelector('#sidebar-logout').addEventListener('click', async function () {
        var result = await supabaseClient.auth.signOut();
        if (result.error) {
          console.error('Unable to sign out:', result.error);
          return;
        }
        window.location.href = '/login';
      });
    }
    sidebarRenderer = renderSidebar;
  }

  function detailsFor(type) {
    if (type === 'booking_approved') {
      return { category: 'booking', title: 'Booking Confirmed', tint: 'tint-green', icon: icons.approved, tag: 'Booking' };
    }
    if (type === 'booking_declined') {
      return { category: 'booking', title: 'Booking Declined', tint: 'tint-red', icon: icons.declined, tag: 'Booking' };
    }
    if (type === 'booking_cancelled') {
      return { category: 'booking', title: 'Booking Cancelled', tint: 'tint-red', icon: icons.declined, tag: 'Booking' };
    }
    if (type === 'booking_request') {
      return { category: 'booking', title: 'New Booking Request', tint: 'tint-red', icon: icons.request, tag: 'Booking' };
    }
    if (type === 'new_message') {
      return { category: 'other', title: 'New message', tint: 'tint-amber', icon: icons.request, tag: 'Message' };
    }
    if (type === 'new_review' || type === 'review_published') {
      return { category: 'other', title: type === 'new_review' ? 'New review' : 'Review published', tint: 'tint-green', icon: icons.approved, tag: 'Review' };
    }
    return { category: 'other', title: 'Notification', tint: 'tint-black', icon: icons.request, tag: 'Update' };
  }

  function notificationTarget(notification) {
    if (notification.related_entity_type === 'conversation' && notification.related_entity_id) {
      return '/chats?c=' + encodeURIComponent(notification.related_entity_id);
    }
    if (notification.related_entity_type === 'review' && notification.related_entity_id) {
      return '/profile';
    }
    if ((notification.related_entity_type === 'booking' || notification.booking_id) && (notification.related_entity_id || notification.booking_id)) {
      return '/booking-approved?id=' + encodeURIComponent(notification.related_entity_id || notification.booking_id);
    }
    return null;
  }

  function filteredNotifications() {
    var search = document.querySelector('.toolbar-search input').value.trim().toLowerCase();
    return notifications.filter(function (notification) {
      var details = detailsFor(notification.type);
      var matchesFilter = currentFilter === 'all' ||
        (currentFilter === 'booking' && details.category === 'booking');
      var matchesSearch = !search ||
        ((notification.message || notification.title || '').toLowerCase().indexOf(search) !== -1) ||
        details.title.toLowerCase().indexOf(search) !== -1;
      return matchesFilter && matchesSearch;
    });
  }

  function cardHtml(notification) {
    var details = detailsFor(notification.type);
    var title = notification.title || details.title;
    var target = notificationTarget(notification);
    var clickable = target ? ' data-target="' + escapeHtml(target) + '"' : '';
    return '<div class="notif-card' + (notification.read ? '' : ' unread') + '" data-notification-id="' + escapeHtml(notification.id) + '"' + clickable + '>' +
      '<div class="notif-icon ' + details.tint + '">' + details.icon + '</div>' +
      '<div class="notif-body">' +
        '<div class="notif-top"><span class="notif-title">' + escapeHtml(title) + '</span><span class="tag booking">' + details.tag + '</span></div>' +
        '<p class="notif-desc">' + escapeHtml(notification.message || title) + '</p>' +
        '<div class="notif-actions" data-actions>' +
          (target ? '<button class="action-btn primary" type="button">Open</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="notif-meta"><span class="notif-time">' + timeAgo(notification.created_at) + '</span>' +
        (notification.read ? '' : '<span class="dot"></span>') + '</div>' +
    '</div>';
  }

  function updateCounts() {
    var unread = notifications.filter(function (notification) { return !notification.read; }).length;
    var subtitle = document.getElementById('notif-subtitle');
    subtitle.textContent = unread ? 'You have ' + unread + ' new notification' + (unread === 1 ? '' : 's') : "You're all caught up";
    var allTab = document.querySelector('[data-filter="all"]');
    var bookingTab = document.querySelector('[data-filter="booking"]');
    allTab.textContent = 'All (' + notifications.length + ')';
    bookingTab.textContent = 'Bookings (' + notifications.filter(function (notification) {
      return detailsFor(notification.type).category === 'booking';
    }).length + ')';
  }

  function showState(message) {
    document.querySelectorAll('.section').forEach(function (section, index) {
      section.style.display = index === 0 ? '' : 'none';
      if (index === 0) {
        section.querySelector('.section-title').textContent = '';
        section.querySelector('.card-list').innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">' + message + '</div>';
      }
    });
  }

  function render() {
    var grouped = { Today: [], Yesterday: [], Older: [] };
    var visibleNotifications = filteredNotifications();
    visibleNotifications.forEach(function (notification) {
      grouped[groupFor(notification.created_at)].push(notification);
    });

    var sections = document.querySelectorAll('.section');
    if (grouped.Older.length && !sections[2]) {
      var olderSection = document.createElement('div');
      olderSection.className = 'section';
      olderSection.innerHTML = '<p class="section-title"></p><div class="card-list"></div>';
      document.querySelector('.main-inner').appendChild(olderSection);
      sections = document.querySelectorAll('.section');
    }
    if (!visibleNotifications.length) {
      showState('Nothing here yet.');
      updateCounts();
      return;
    }

    ['Today', 'Yesterday', 'Older'].forEach(function (label, index) {
      var section = sections[index];
      if (!section) return;
      section.querySelector('.section-title').textContent = label;
      section.querySelector('.card-list').innerHTML = grouped[label].map(cardHtml).join('') ||
        '<div style="padding:2rem;text-align:center;color:var(--text-muted);">Nothing here yet.</div>';
      section.style.display = grouped[label].length ? '' : 'none';
    });

    document.querySelectorAll('.notif-card[data-notification-id]').forEach(function (card) {
      card.addEventListener('click', function () {
        var notification = notifications.find(function (item) {
          return item.id === card.getAttribute('data-notification-id');
        });
        var target = card.getAttribute('data-target');
        if (notification && !notification.read) markRead(notification);
        if (target) window.location.href = target;
      });
    });
    updateCounts();
  }

  async function markRead(notification) {
    if (notification.read) return;
    var result = await supabaseClient.from('notifications').update({ read: true })
      .eq('id', notification.id).eq('recipient_user_id', currentUser.id);
    if (result.error) {
      console.error('Unable to mark notification as read:', result.error);
      return;
    }
    notification.read = true;
    render();
  }

  window.markAllRead = async function () {
    var result = await supabaseClient.from('notifications').update({ read: true })
      .eq('recipient_user_id', currentUser.id).eq('read', false);
    if (result.error) {
      showState('Unable to update notifications. Please try again.');
      return;
    }
    notifications.forEach(function (notification) { notification.read = true; });
    render();
  };

  async function loadNotifications() {
    var result = await supabaseClient.from('notifications')
      .select('id,title,message,type,read,created_at,booking_id,related_entity_type,related_entity_id,metadata')
      .eq('recipient_user_id', currentUser.id)
      .order('created_at', { ascending: false }).limit(100);
    if (result.error) {
      showState('Unable to load notifications. Please refresh and try again.');
      return;
    }
    notifications = result.data || [];
    render();
  }

  (async function () {
    var sessionResult = await supabaseClient.auth.getSession();
    if (sessionResult.error || !sessionResult.data.session) {
      window.location.href = '/login';
      return;
    }
    currentUser = sessionResult.data.session.user;
    setupSidebarRenderer();
    var profileResult = await supabaseClient.from('profiles')
      .select('role,full_name,username').eq('id', currentUser.id).maybeSingle();
    if (profileResult.error) {
      console.error('Unable to load profile:', profileResult.error);
      window.location.href = '/login';
      return;
    }
    sidebarRenderer(profileResult.data || { role: 'client' });

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (item) { item.classList.remove('active'); });
        tab.classList.add('active');
        currentFilter = tab.getAttribute('data-filter');
        render();
      });
    });
    document.querySelector('.toolbar-search input').addEventListener('input', render);

    await loadNotifications();
    supabaseClient.channel('notifications-page-' + currentUser.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: 'recipient_user_id=eq.' + currentUser.id
      }, loadNotifications)
      .subscribe();
  }());
}());
