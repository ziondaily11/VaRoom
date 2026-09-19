(function () {
  var pendingMutations = Object.create(null);
  var listingStates = Object.create(null);

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
  function updateCachedListing(id, patch) {
    if (window.VaRoomListingFeedCache) window.VaRoomListingFeedCache.updateListing(id, patch);
  }
  function publishListingUpdate(id, patch) {
    listingStates[id] = Object.assign({}, listingStates[id] || {}, patch);
    updateCachedListing(id, patch);
    document.dispatchEvent(new CustomEvent('varoom:listing-updated', {
      detail: { id: id, patch: patch }
    }));
  }
  function setPending(button, pending) {
    button.disabled = pending;
    button.setAttribute('aria-busy', pending ? 'true' : 'false');
    button.style.opacity = pending ? '0.6' : '';
    button.style.pointerEvents = pending ? 'none' : '';
    if (pending) {
      button.setAttribute('data-original-label', button.textContent);
      button.textContent = 'Saving...';
    } else {
      var original = button.getAttribute('data-original-label');
      if (original !== null) {
        button.textContent = original;
        button.removeAttribute('data-original-label');
      }
    }
  }
  function persistStatus(button, listing) {
    var status = button.getAttribute('data-status');
    var id = listing.id;
    if (pendingMutations[id]) return;
    var previousStatus = (listingStates[id] && listingStates[id].availability_status)
      || listing.availability_status || 'available';
    pendingMutations[id] = true;
    setPending(button, true);
    publishListingUpdate(id, { availability_status: status });
    request('/listings/' + encodeURIComponent(id) + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: status })
    }).then(function (result) {
      var serverListing = result && result.listing;
      publishListingUpdate(id, {
        availability_status: serverListing && serverListing.availability_status
          ? serverListing.availability_status
          : status
      });
    }).catch(function (error) {
      publishListingUpdate(id, { availability_status: previousStatus });
      toast('Could not save listing status: ' + error.message);
    }).finally(function () {
      delete pendingMutations[id];
      setPending(button, false);
      document.dispatchEvent(new CustomEvent('varoom:listing-updated', {
        detail: { id: id, patch: { availability_status: listingStates[id].availability_status } }
      }));
    });
  }
  function removeCachedListing(id) {
    if (window.VaRoomListingFeedCache) window.VaRoomListingFeedCache.removeListing(id);
  }
  function invalidateListingCache() {
    if (window.VaRoomListingFeedCache) window.VaRoomListingFeedCache.invalidateAll();
  }
  function listingUrl(id) { return window.location.origin + '/booking?listing=' + encodeURIComponent(id); }
  function share(id, title) {
    var url = listingUrl(id);
    if (navigator.share) return navigator.share({ title: title + ' — VaRoom', url: url }).catch(function (error) {
      if (error.name !== 'AbortError') toast('Unable to share listing');
    });
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      toast('Sharing is not supported in this browser');
      return Promise.resolve();
    }
    return navigator.clipboard.writeText(url)
      .then(function () { toast('Listing link copied'); })
      .catch(function () { toast('Unable to copy listing link'); });
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
      var patch = {
        title: document.getElementById('host-edit-title').value.trim(),
        description: document.getElementById('host-edit-description').value.trim(),
        category: document.getElementById('host-edit-category').value,
        location_text: document.getElementById('host-edit-location').value.trim(),
        price_amount: document.getElementById('host-edit-price').value,
        price_unit: document.getElementById('host-edit-price-unit').value
      };
      var previous = {
        title: listing.title || '',
        description: listing.description || '',
        category: listing.category || 'property',
        location_text: listing.location_text || ''
      };
      publishListingUpdate(listing.id, patch);
      request('/listings/' + encodeURIComponent(listing.id), { method: 'PATCH', body: JSON.stringify(patch) }).then(function () {
        var detail = Array.isArray(listing.listing_booking_details) ? listing.listing_booking_details[0] : listing.listing_booking_details;
        publishListingUpdate(listing.id, {
          title: patch.title,
          description: patch.description,
          category: patch.category,
          location_text: patch.location_text,
          listing_booking_details: Object.assign({}, detail || {}, {
            price_amount: Number(patch.price_amount),
            price_unit: patch.price_unit
          })
        });
        var modal = document.getElementById('host-listing-edit-modal');
        if (modal) modal.remove();
        toast('Listing updated');
      }).catch(function (error) {
        publishListingUpdate(listing.id, previous);
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
          persistStatus(button, listing);
        } else if (action === 'edit') edit(listing);
        else if (action === 'share') share(listing.id, listing.title);
        else if (action === 'copy') {
          if (!navigator.clipboard || !navigator.clipboard.writeText) {
            toast('Copying is not supported in this browser');
            return;
          }
          navigator.clipboard.writeText(listingUrl(listing.id))
            .then(function () { toast('Listing link copied'); })
            .catch(function () { toast('Unable to copy listing link'); });
        }
        else if (action === 'bookings') window.location.href = '/bookings?listing=' + encodeURIComponent(listing.id);
        else if (action === 'analytics') window.location.href = '/analytics?listing=' + encodeURIComponent(listing.id);
        else if (action === 'duplicate') request('/listings/' + encodeURIComponent(listing.id) + '/duplicate', { method: 'POST' }).then(function () { invalidateListingCache(); toast('Listing duplicated'); }).catch(function (error) { toast(error.message); });
        else if (action === 'delete') confirmDeletion().then(function (confirmed) {
          if (!confirmed) return;
          request('/listings/' + encodeURIComponent(listing.id), { method: 'DELETE' }).then(function () { removeCachedListing(listing.id); document.dispatchEvent(new CustomEvent('varoom:listing-deleted', { detail: { id: listing.id } })); toast('Listing deleted'); }).catch(function (error) { toast(error.message); });
        });
      });
    });
  }
  document.addEventListener('varoom:listing-updated', function (event) {
    var detail = event.detail || {};
    var id = detail.id;
    var status = detail.patch && detail.patch.availability_status;
    if (!id || !status) return;
    document.querySelectorAll('[data-listing-card]').forEach(function (card) {
      if (card.getAttribute('data-listing-card') !== id) return;
      var statusNode = card.querySelector('[data-listing-status]');
      if (!statusNode && status !== 'available') {
        statusNode = document.createElement('div');
        statusNode.setAttribute('data-listing-status', '');
        statusNode.className = 'listing-status-banner';
        var media = card.querySelector('.card-photos, .card-video, .listing-thumb, .listing-card-body');
        if (media && media.parentNode === card) card.insertBefore(statusNode, media);
        else card.appendChild(statusNode);
      }
      if (statusNode) {
        var label = status === 'available' ? 'Available'
          : status.charAt(0).toUpperCase() + status.slice(1);
        statusNode.textContent = card.classList.contains('listing-card') ? label : 'Status: ' + status;
        statusNode.style.display = '';
        if (card.classList.contains('listing-card')) {
          statusNode.classList.remove('available', 'booked', 'paused', 'unavailable');
          statusNode.classList.add(status);
        }
      }
      card.querySelectorAll('[data-listing-title]').forEach(function (node) {
        if (Object.prototype.hasOwnProperty.call(detail.patch, 'title')) node.textContent = detail.patch.title;
      });
      card.querySelectorAll('[data-listing-caption]').forEach(function (node) {
        if (Object.prototype.hasOwnProperty.call(detail.patch, 'description')) node.textContent = detail.patch.description;
      });
      card.querySelectorAll('[data-status-action]').forEach(function (action) {
        action.disabled = action.getAttribute('data-status-action') === status;
      });
    });
  });
  document.addEventListener('varoom:listing-deleted', function (event) {
    var id = event.detail && event.detail.id;
    if (!id) return;
    document.querySelectorAll('[data-listing-card]').forEach(function (card) {
      if (card.getAttribute('data-listing-card') === id) card.remove();
    });
  });
  window.VaRoomHostListings = { bind: bind, menu: function (listing) {
    listingStates[listing.id] = Object.assign({}, listingStates[listing.id] || {}, listing);
    var json = JSON.stringify(listing).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return '<div class="card-menu-wrap"><button type="button" class="card-menu-btn" data-menu-toggle="' + listing.id + '" aria-label="Manage listing">⋮</button><div class="card-menu-dropdown" id="menu-' + listing.id + '">' +
      '<button class="card-menu-item" data-host-action="edit" data-listing="' + json + '">Edit listing</button>' +
      '<div class="card-menu-section">Change availability</div>' +
      '<button class="card-menu-item" data-host-action="status" data-status="available" data-status-action="available" data-listing="' + json + '">Make available</button>' +
      '<button class="card-menu-item" data-host-action="status" data-status="booked" data-status-action="booked" data-listing="' + json + '">Mark booked</button>' +
      '<button class="card-menu-item" data-host-action="status" data-status="unavailable" data-status-action="unavailable" data-listing="' + json + '">Mark unavailable</button>' +
      '<button class="card-menu-item" data-host-action="status" data-status="paused" data-status-action="paused" data-listing="' + json + '">Pause listing</button>' +
      '<button class="card-menu-item" data-host-action="share" data-listing="' + json + '">Share listing</button><button class="card-menu-item" data-host-action="copy" data-listing="' + json + '">Copy listing link</button>' +
      '<button class="card-menu-item" data-host-action="bookings" data-listing="' + json + '">View bookings</button><button class="card-menu-item" data-host-action="analytics" data-listing="' + json + '">View analytics</button><button class="card-menu-item" data-host-action="duplicate" data-listing="' + json + '">Duplicate listing</button><button class="card-menu-item destructive" data-host-action="delete" data-listing="' + json + '">Delete listing</button></div></div>';
  }};
})();
