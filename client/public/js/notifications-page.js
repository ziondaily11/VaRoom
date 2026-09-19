(function () {
  'use strict';

  var notifications = [];
  var currentFilter = 'all';
  var currentUser = null;
  var currentRole = 'client';
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
    if (currentRole === 'host' &&
        (notification.related_entity_type === 'booking' || notification.booking_id) &&
        (notification.related_entity_id || notification.booking_id)) {
      return '/bookings?booking=' + encodeURIComponent(notification.related_entity_id || notification.booking_id);
    }
    if (notification.related_entity_type === 'conversation' && notification.related_entity_id) {
      return '/chats?c=' + encodeURIComponent(notification.related_entity_id);
    }
    if (notification.related_entity_type === 'review' && notification.related_entity_id) {
      return '/profile';
    }
    if ((notification.related_entity_type === 'booking' || notification.booking_id) &&
        (notification.related_entity_id || notification.booking_id)) {
      return '/booking-approved?id=' + encodeURIComponent(notification.related_entity_id || notification.booking_id);
    }
    return null;
  }

  function searchableText(notification, details) {
    var metadata = notification.metadata && typeof notification.metadata === 'object' ? notification.metadata : {};
    return [
      notification.title,
      notification.message,
      notification.type,
      details.title,
      details.tag,
      metadata.booking_name,
      metadata.booking_reference,
      metadata.listing_name,
      metadata.property_name,
      metadata.guest_name,
      Object.keys(metadata).map(function (key) { return metadata[key]; }).join(' ')
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function filteredNotifications() {
    var search = document.querySelector('.toolbar-search input').value.trim().toLowerCase();
    return notifications.filter(function (notification) {
      var details = detailsFor(notification.type);
      var matchesFilter = currentFilter === 'all' ||
        (currentFilter === 'booking' && details.category === 'booking');
      var matchesSearch = !search || searchableText(notification, details).indexOf(search) !== -1;
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
        '<div class="notif-top"><span class="notif-title">' + escapeHtml(title) + '</span><span class="tag ' + details.category + '">' + escapeHtml(details.tag) + '</span></div>' +
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
    if (window.VaroomSidebar) {
      window.VaroomSidebar.setUnreadCount(unread);
    }
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
    var hasSearch = document.querySelector('.toolbar-search input').value.trim().length > 0;
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
      showState(hasSearch ? 'No notifications found' : 'Nothing here yet.');
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
      card.addEventListener('click', async function () {
        var notification = notifications.find(function (item) {
          return item.id === card.getAttribute('data-notification-id');
        });
        var target = card.getAttribute('data-target');
        if (notification && !notification.read) await markRead(notification);
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
    var profileResult = await supabaseClient.from('profiles')
      .select('role,full_name,verified,avatar_url,username').eq('id', currentUser.id).maybeSingle();
    if (profileResult.error) {
      console.error('Unable to load profile:', profileResult.error);
      window.location.href = '/login';
      return;
    }
    var profile = profileResult.data || { role: 'client' };
    var role = profile.role === 'host' ? 'host' : 'client';
    currentRole = role;
    if (window.VaroomSidebar) {
      window.VaroomSidebar.mount({
        container: document.getElementById('sidebar'),
        role: role,
        activeNav: 'notifications',
        profile: profile,
        currentUser: currentUser,
        supabaseClient: supabaseClient
      });
    }

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
