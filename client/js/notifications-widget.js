// Shared notification bell widget — used by client-home.html and
// host-home.html. Call initNotifications(supabaseClient, currentUser)
// once the page has confirmed the user is logged in. Expects a
// <button id="notif-bell"> to already exist in the page.
//
// The dropdown panel is viewport-fixed (not relatively positioned to the
// bell) so it works correctly whether the bell lives in a top bar or a
// bottom nav bar, without needing per-page positioning tweaks.

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
  // wherever the trigger physically is (top bar or bottom nav).
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

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

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
      .select('id,message,type,read,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!data || data.length === 0) {
      list.innerHTML =
        '<div style="padding:2.2rem 1.4rem;text-align:center;">' +
          '<div style="font-size:1.9rem;margin-bottom:.5rem;line-height:1;">🔔</div>' +
          '<p style="color:var(--ink);font-size:.88rem;font-weight:600;margin-bottom:.25rem;">No notifications yet</p>' +
          '<p style="color:var(--muted);font-size:.8rem;">We\'ll let you know when something needs your attention.</p>' +
        '</div>';
      return;
    }

    list.innerHTML = data.map(function (n) {
      return '<div style="padding:.8rem 1rem;border-bottom:1px solid rgba(128,110,100,.08);' +
        (n.read ? '' : 'background:rgba(196,30,58,.05);') + 'font-size:.85rem;line-height:1.4;">' +
        '<div>' + escapeHtml(n.message) + '</div>' +
        '<div style="font-size:.74rem;color:var(--muted);margin-top:.25rem;">' + timeAgo(n.created_at) + '</div>' +
        '</div>';
    }).join('');

    // Mark visible unread ones as read
    const unreadIds = data.filter(function (n) { return !n.read; }).map(function (n) { return n.id; });
    if (unreadIds.length > 0) {
      await supabaseClient.from('notifications').update({ read: true }).in('id', unreadIds);
      refreshUnreadCount();
    }
  }

  bellBtn.addEventListener('click', function (e) {
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