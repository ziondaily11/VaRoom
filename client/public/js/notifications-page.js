(function () {
  'use strict';

  var notifications = [];
  var currentFilter = 'all';
  var currentUser = null;

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
    return { category: 'other', title: 'Notification', tint: 'tint-black', icon: icons.request, tag: 'Update' };
  }

  function filteredNotifications() {
    var search = document.querySelector('.toolbar-search input').value.trim().toLowerCase();
    return notifications.filter(function (notification) {
      var details = detailsFor(notification.type);
      var matchesFilter = currentFilter === 'all' ||
        (currentFilter === 'booking' && details.category === 'booking');
      var matchesSearch = !search ||
        (notification.message || '').toLowerCase().indexOf(search) !== -1 ||
        details.title.toLowerCase().indexOf(search) !== -1;
      return matchesFilter && matchesSearch;
    });
  }

  function cardHtml(notification) {
    var details = detailsFor(notification.type);
    var clickable = notification.booking_id ? ' data-booking-id="' + escapeHtml(notification.booking_id) + '"' : '';
    return '<div class="notif-card' + (notification.read ? '' : ' unread') + '" data-notification-id="' + escapeHtml(notification.id) + '"' + clickable + '>' +
      '<div class="notif-icon ' + details.tint + '">' + details.icon + '</div>' +
      '<div class="notif-body">' +
        '<div class="notif-top"><span class="notif-title">' + details.title + '</span><span class="tag booking">' + details.tag + '</span></div>' +
        '<p class="notif-desc">' + escapeHtml(notification.message) + '</p>' +
        '<div class="notif-actions" data-actions>' +
          (notification.booking_id ? '<button class="action-btn primary" type="button">View booking</button>' : '') +
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
        var bookingId = card.getAttribute('data-booking-id');
        if (notification && !notification.read) markRead(notification);
        if (bookingId) window.location.href = '/booking-approved?id=' + encodeURIComponent(bookingId);
      });
    });
    updateCounts();
  }

  async function markRead(notification) {
    if (notification.read) return;
    var result = await supabaseClient.from('notifications').update({ read: true })
      .eq('id', notification.id).eq('user_id', currentUser.id);
    if (result.error) {
      console.error('Unable to mark notification as read:', result.error);
      return;
    }
    notification.read = true;
    render();
  }

  window.markAllRead = async function () {
    var result = await supabaseClient.from('notifications').update({ read: true })
      .eq('user_id', currentUser.id).eq('read', false);
    if (result.error) {
      showState('Unable to update notifications. Please try again.');
      return;
    }
    notifications.forEach(function (notification) { notification.read = true; });
    render();
  };

  async function loadNotifications() {
    var result = await supabaseClient.from('notifications')
      .select('id,message,type,read,created_at,booking_id')
      .eq('user_id', currentUser.id)
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
        filter: 'user_id=eq.' + currentUser.id
      }, loadNotifications)
      .subscribe();
  }());
}());
