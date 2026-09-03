(function () {
  function token() {
    return window.supabaseClient.auth.getSession().then(function (result) {
      return result.data.session && result.data.session.access_token;
    });
  }
  function request(path, options) {
    return token().then(function (accessToken) {
      if (!accessToken) throw new Error('Please sign in again.');
      options = options || {};
      options.headers = Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken }, options.headers || {});
      return fetch('/api' + path, options).then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw new Error(body.error || 'Request failed');
          return body;
        });
      });
    });
  }
  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message; el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2400);
  }
  function listingUrl(id) { return window.location.origin + '/booking?listing=' + encodeURIComponent(id); }
  function share(id, title) {
    var url = listingUrl(id);
    if (navigator.share) return navigator.share({ title: title + ' — VaRoom', url: url }).catch(function (error) {
      if (error.name !== 'AbortError') throw error;
    });
    return navigator.clipboard.writeText(url).then(function () { toast('Listing link copied'); });
  }
  function ensureModal() {
    if (document.getElementById('host-listing-edit-modal')) return;
    var overlay = document.createElement('div');
    overlay.id = 'host-listing-edit-modal'; overlay.className = 'modal-overlay open';
    overlay.innerHTML = '<div class="modal-card"><h2>Edit listing</h2>' +
      '<div class="modal-field"><label>Title</label><input id="host-edit-title"></div>' +
      '<div class="modal-field"><label>Description</label><textarea id="host-edit-description"></textarea></div>' +
      '<div class="modal-field"><label>Category</label><select id="host-edit-category"><option value="airbnb">Airbnb</option><option value="hotel">Hotel</option><option value="venue">Event Venue</option><option value="office">Office</option><option value="shop">Shop</option><option value="property">Property</option></select></div>' +
      '<div class="modal-field"><label>Location</label><input id="host-edit-location"></div>' +
      '<div class="modal-field"><label>Price</label><input id="host-edit-price" type="number" min="0"></div>' +
      '<div class="modal-field"><label>Price unit</label><select id="host-edit-price-unit"><option value="hour">hour</option><option value="night">night</option><option value="month">month</option></select></div>' +
      '<div class="modal-actions"><button class="modal-cancel" id="host-edit-cancel">Cancel</button><button class="modal-save" id="host-edit-save">Save changes</button></div><p class="modal-msg" id="host-edit-msg"></p></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) overlay.remove(); });
    document.getElementById('host-edit-cancel').addEventListener('click', function () { overlay.remove(); });
  }
  function edit(listing) {
    ensureModal();
    var detail = Array.isArray(listing.listing_booking_details) ? listing.listing_booking_details[0] : listing.listing_booking_details;
    document.getElementById('host-edit-title').value = listing.title || '';
    document.getElementById('host-edit-description').value = listing.description || '';
    document.getElementById('host-edit-category').value = listing.category || 'property';
    document.getElementById('host-edit-location').value = listing.location_text || '';
    document.getElementById('host-edit-price').value = detail && detail.price_amount || '';
    document.getElementById('host-edit-price-unit').value = detail && detail.price_unit || 'night';
    document.getElementById('host-edit-save').onclick = function () {
      var button = this;
      button.disabled = true;
      request('/listings/' + encodeURIComponent(listing.id), { method: 'PATCH', body: JSON.stringify({
        title: document.getElementById('host-edit-title').value.trim(),
        description: document.getElementById('host-edit-description').value.trim(),
        category: document.getElementById('host-edit-category').value,
        location_text: document.getElementById('host-edit-location').value.trim(),
        price_amount: document.getElementById('host-edit-price').value,
        price_unit: document.getElementById('host-edit-price-unit').value
      }) }).then(function () { toast('Listing updated'); window.location.reload(); }).catch(function (error) {
        document.getElementById('host-edit-msg').textContent = error.message; button.disabled = false;
      });
    };
  }
  function confirmDeletion() {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay open';
      overlay.innerHTML = '<div class="modal-card"><h2>Delete listing?</h2><p>This is permanent. The listing, its photos, and discovery record will be removed.</p><div class="modal-actions"><button class="modal-cancel">Keep listing</button><button class="modal-save" style="background:#8F1229">Delete permanently</button></div></div>';
      document.body.appendChild(overlay);
      function finish(value) { overlay.remove(); resolve(value); }
      overlay.querySelector('.modal-cancel').onclick = function () { finish(false); };
      overlay.querySelector('.modal-save').onclick = function () { finish(true); };
      overlay.onclick = function (event) { if (event.target === overlay) finish(false); };
    });
  }
  function bind(container) {
    container.querySelectorAll('[data-menu-toggle]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault(); event.stopPropagation();
        var dropdown = document.getElementById('menu-' + button.getAttribute('data-menu-toggle'));
        var open = dropdown.classList.contains('open');
        document.querySelectorAll('.card-menu-dropdown.open').forEach(function (menu) { menu.classList.remove('open'); });
        if (!open) dropdown.classList.add('open');
      });
    });
    container.querySelectorAll('[data-host-action]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault(); event.stopPropagation();
        var listing = JSON.parse(button.getAttribute('data-listing'));
        var action = button.getAttribute('data-host-action');
        container.querySelectorAll('.card-menu-dropdown.open').forEach(function (menu) { menu.classList.remove('open'); });
        if (action === 'status') {
          request('/listings/' + encodeURIComponent(listing.id) + '/status', { method: 'PATCH', body: JSON.stringify({ status: button.getAttribute('data-status') }) })
            .then(function () { toast('Listing status updated'); window.location.reload(); }).catch(function (error) { toast(error.message); });
        } else if (action === 'edit') edit(listing);
        else if (action === 'share') share(listing.id, listing.title);
        else if (action === 'copy') navigator.clipboard.writeText(listingUrl(listing.id)).then(function () { toast('Listing link copied'); });
        else if (action === 'bookings') window.location.href = '/bookings?listing=' + encodeURIComponent(listing.id);
        else if (action === 'analytics') window.location.href = '/analytics?listing=' + encodeURIComponent(listing.id);
        else if (action === 'duplicate') request('/listings/' + encodeURIComponent(listing.id) + '/duplicate', { method: 'POST' }).then(function () { toast('Listing duplicated'); window.location.reload(); }).catch(function (error) { toast(error.message); });
        else if (action === 'delete') confirmDeletion().then(function (confirmed) {
          if (!confirmed) return;
          request('/listings/' + encodeURIComponent(listing.id), { method: 'DELETE' }).then(function () { toast('Listing deleted'); window.location.reload(); }).catch(function (error) { toast(error.message); });
        });
      });
    });
  }
  window.VaRoomHostListings = { bind: bind, menu: function (listing) {
    var json = JSON.stringify(listing).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return '<div class="card-menu-wrap"><button type="button" class="card-menu-btn" data-menu-toggle="' + listing.id + '" aria-label="Manage listing">⋮</button><div class="card-menu-dropdown" id="menu-' + listing.id + '">' +
      '<button class="card-menu-item" data-host-action="edit" data-listing="' + json + '">Edit listing</button>' +
      '<div class="card-menu-section">Change availability</div>' +
      '<button class="card-menu-item" data-host-action="status" data-status="available" data-listing="' + json + '">Make available</button>' +
      '<button class="card-menu-item" data-host-action="status" data-status="booked" data-listing="' + json + '">Mark booked</button>' +
      '<button class="card-menu-item" data-host-action="status" data-status="unavailable" data-listing="' + json + '">Mark unavailable</button>' +
      '<button class="card-menu-item" data-host-action="status" data-status="paused" data-listing="' + json + '">Pause listing</button>' +
      '<button class="card-menu-item" data-host-action="share" data-listing="' + json + '">Share listing</button><button class="card-menu-item" data-host-action="copy" data-listing="' + json + '">Copy listing link</button>' +
      '<button class="card-menu-item" data-host-action="bookings" data-listing="' + json + '">View bookings</button><button class="card-menu-item" data-host-action="analytics" data-listing="' + json + '">View analytics</button><button class="card-menu-item" data-host-action="duplicate" data-listing="' + json + '">Duplicate listing</button><button class="card-menu-item destructive" data-host-action="delete" data-listing="' + json + '">Delete listing</button></div></div>';
  }};
})();
