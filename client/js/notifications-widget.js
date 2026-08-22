// Shared notification bell widget — used by client-home.html and
// host-home.html. Call initNotifications(supabaseClient, currentUser)
// once the page has confirmed the user is logged in. Expects a
// <button id="notif-bell"> to already exist in the page.
//
// On mobile widths, tapping the bell navigates to the dedicated full-page
// notifications.html screen instead of opening the dropdown — a small
// floating panel isn't a good fit for a phone. On wider screens, it opens
// the compact dropdown panel as before.
//
// The dropdown panel is viewport-fixed (not relatively positioned to the
// bell) so it works correctly whether the bell lives in a top bar or a
// bottom nav bar, without needing per-page positioning tweaks.

const NOTIF_MOBILE_BREAKPOINT = '(max-width:860px)';

function notifIconFor(type) {
  const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const XICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const CALENDAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';

  if (type === 'booking_approved') return { bg: '#DCF5E3', fg: '#1E7D3A', svg: CHECK };
  if (type === 'booking_declined' || type === 'booking_cancelled') return { bg: '#FBE4E7', fg: '#C41E3A', svg: XICON };
  return { bg: '#E8EEFB', fg: '#2255C4', svg: CALENDAR }; // booking_request and any unrecognized type
}

function notifTimeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function notifEscapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function initNotifications(supabaseClient, currentUser) {
  const bellBtn = document.getElementById('notif-bell');
  if (!bellBtn) return;

  // Badge dot
  const badge = document.createElement('span');
  badge.className = 'notif-badge';
  badge.style.cssText = 'display:none;position:absolute;top:2px;right:2px;width:9px;height:9px;border-radius:50%;background:#C41E3A;border:2px solid var(--white);';
  bellBtn.style.position = 'relative';
  bellBtn.appendChild(badge);

  // Dropdown panel — fixed to the viewport, bottom-right, sitting above
  // wherever the trigger physically is (top bar or bottom nav). Only used
  // on desktop widths; mobile taps navigate to notifications.html instead.
  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.style.cssText = 'display:none;position:fixed;bottom:5.5rem;right:1rem;left:auto;top:auto;z-index:250;width:320px;max-width:calc(100vw - 2rem);max-height:420px;overflow-y:auto;background:var(--white);border:1px solid rgba(128,110,100,.15);border-radius:14px;box-shadow:0 20px 45px -15px rgba(26,18,16,.35);';
  panel.innerHTML =
    '<div style="padding:.9rem 1rem;border-bottom:1px solid rgba(128,110,100,.12);font-weight:700;font-size:.92rem;display:flex;justify-content:space-between;align-items:center;">' +
      '<span>Notifications</span>' +
      '<button type="button" id="notif-mark-all" style="font-size:.76rem;font-weight:600;color:#C41E3A;background:none;border:none;cursor:pointer;">Mark all read</button>' +
    '</div>' +
    '<div id="notif-list"></div>';
  document.body.appendChild(panel);

  async function refreshUnreadCount() {
    const { count } = await supabaseClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('read', false);
    badge.style.display = count > 0 ? 'block' : 'none';
  }

  async function loadNotifications() {
    const list = document.getElementById('notif-list');
    list.innerHTML = '<p style="padding:1.8rem;color:var(--muted);font-size:.85rem;text-align:center;">Loading…</p>';

    const { data } = await supabaseClient
      .from('notifications')
      .select('id,message,type,read,created_at,booking_id')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!data || data.length === 0) {
      list.innerHTML =
        '<div style="padding:2.2rem 1.4rem;text-align:center;">' +
          '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:.6rem;"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
          '<p style="color:var(--ink);font-size:.88rem;font-weight:600;margin-bottom:.25rem;">No notifications yet</p>' +
          '<p style="color:var(--muted);font-size:.8rem;">We\'ll let you know when something needs your attention.</p>' +
        '</div>';
      return;
    }

    list.innerHTML = data.map(function (n) {
      const icon = notifIconFor(n.type);
      const clickable = n.booking_id ? ' data-booking-id="' + n.booking_id + '" style="cursor:pointer;"' : '';
      return (
        '<div class="notif-row"' + clickable + ' style="display:flex;gap:.7rem;padding:.8rem 1rem;border-bottom:1px solid rgba(128,110,100,.08);' +
          (n.read ? '' : 'background:rgba(196,30,58,.05);') + '">' +
          '<div style="width:32px;height:32px;border-radius:50%;flex-shrink:0;background:' + icon.bg + ';color:' + icon.fg + ';display:flex;align-items:center;justify-content:center;">' + icon.svg + '</div>' +
          '<div style="flex:1;min-width:0;font-size:.85rem;line-height:1.4;">' +
            '<div>' + notifEscapeHtml(n.message) + '</div>' +
            '<div style="font-size:.74rem;color:var(--muted);margin-top:.25rem;">' + notifTimeAgo(n.created_at) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    list.querySelectorAll('.notif-row[data-booking-id]').forEach(function (row) {
      row.addEventListener('click', function () {
        window.location.href = 'booking-approved.html?id=' + row.getAttribute('data-booking-id');
      });
    });

    // Mark visible unread ones as read
    const unreadIds = data.filter(function (n) { return !n.read; }).map(function (n) { return n.id; });
    if (unreadIds.length > 0) {
      await supabaseClient.from('notifications').update({ read: true }).in('id', unreadIds);
      refreshUnreadCount();
    }
  }

  bellBtn.addEventListener('click', function (e) {
    if (window.matchMedia(NOTIF_MOBILE_BREAKPOINT).matches) {
      window.location.href = 'notifications.html';
      return;
    }
    e.stopPropagation();
    const isOpen = panel.style.display === 'block';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) loadNotifications();
  });

  panel.querySelector('#notif-mark-all').addEventListener('click', async function (e) {
    e.stopPropagation();
    await supabaseClient.from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false);
    loadNotifications();
    refreshUnreadCount();
  });

  document.addEventListener('click', function (e) {
    if (!panel.contains(e.target) && e.target !== bellBtn) panel.style.display = 'none';
  });

  // Live badge updates
  supabaseClient
    .channel('notif-' + currentUser.id)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: 'user_id=eq.' + currentUser.id
    }, function () { refreshUnreadCount(); })
    .subscribe();

  refreshUnreadCount();
}
