// VaRoom shared Google Maps helpers.
// Loaded as a plain script (no bundler), same style as supabase-client.js.
// Every screen that touches location should use these instead of talking
// to the Maps JS SDK or /api/*location*/*distance* endpoints directly, so
// the "backend decides what a user sees" rule (Google Maps Flow spec,
// section 16) stays enforced in one place.

var VaroomMaps = (function () {
  var mapsLoadPromise = null;

  // Fetches the API key from the server and injects the Maps JS script
  // tag once. Safe to call multiple times — subsequent calls reuse the
  // same promise. Resolves to false (not a thrown error) if no key is
  // configured yet, so callers can show a friendly "map coming soon"
  // state instead of crashing.
  function loadGoogleMaps() {
    if (mapsLoadPromise) return mapsLoadPromise;

    mapsLoadPromise = fetch('/api/maps-config')
      .then(function (r) { return r.json(); })
      .then(function (config) {
        if (!config.apiKey) return false;
        if (window.google && window.google.maps) return true;

        return new Promise(function (resolve) {
          var script = document.createElement('script');
          script.src =
            'https://maps.googleapis.com/maps/api/js?key=' +
            encodeURIComponent(config.apiKey) +
            '&libraries=places&loading=async';
          script.async = true;
          script.onload = function () { resolve(true); };
          script.onerror = function () { resolve(false); };
          document.head.appendChild(script);
        });
      })
      .catch(function () { return false; });

    return mapsLoadPromise;
  }

  // Fixed-center-pin picker (spec section 2): the host moves the map
  // underneath a pin that stays visually centered, rather than dragging
  // the pin itself. Renders search box, "use current location", and a
  // confirm button into the given container.
  //
  // opts: {
  //   container: HTMLElement,
  //   initial: {lat, lng} | null,
  //   onConfirm: function({lat, lng, place_id, formatted_address,
  //                        neighborhood, city, country})
  // }
  function createLocationPicker(opts) {
    var container = opts.container;
    container.innerHTML =
      '<div class="vrm-picker">' +
        '<input type="text" class="vrm-picker-search" placeholder="Search for an area, building, or street">' +
        '<div class="vrm-picker-map-wrap">' +
          '<div class="vrm-picker-map"></div>' +
          '<div class="vrm-picker-pin">📍</div>' +
        '</div>' +
        '<div class="vrm-picker-actions">' +
          '<button type="button" class="vrm-picker-current">Use my current location</button>' +
          '<button type="button" class="vrm-picker-confirm" disabled>Confirm location</button>' +
        '</div>' +
        '<p class="vrm-picker-address">No location selected yet.</p>' +
      '</div>';

    var mapEl = container.querySelector('.vrm-picker-map');
    var addressEl = container.querySelector('.vrm-picker-address');
    var confirmBtn = container.querySelector('.vrm-picker-confirm');
    var currentBtn = container.querySelector('.vrm-picker-current');
    var searchInput = container.querySelector('.vrm-picker-search');

    var defaultCenter = opts.initial || { lat: -1.286389, lng: 36.817223 }; // Nairobi
    var selected = null;

    loadGoogleMaps().then(function (ok) {
      if (!ok) {
        mapEl.innerHTML = '';
        addressEl.textContent = 'Map is not available right now — try again shortly.';
        return;
      }

      var map = new google.maps.Map(mapEl, {
        center: defaultCenter,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });

      var geocoder = new google.maps.Geocoder();

      function reverseGeocodeCenter() {
        var center = map.getCenter();
        geocoder.geocode({ location: center }, function (results, status) {
          if (status !== 'OK' || !results[0]) {
            addressEl.textContent = 'Move the map to a mapped area.';
            confirmBtn.disabled = true;
            return;
          }
          var r = results[0];
          var components = r.address_components || [];
          function find(type) {
            var c = components.filter(function (comp) { return comp.types.indexOf(type) !== -1; })[0];
            return c ? c.long_name : null;
          }
          selected = {
            lat: center.lat(),
            lng: center.lng(),
            place_id: r.place_id,
            formatted_address: r.formatted_address,
            neighborhood: find('neighborhood') || find('sublocality') || find('locality'),
            city: find('locality') || find('administrative_area_level_1'),
            country: find('country'),
          };
          addressEl.textContent = r.formatted_address;
          confirmBtn.disabled = false;
        });
      }

      map.addListener('idle', reverseGeocodeCenter);

      currentBtn.addEventListener('click', function () {
        if (!navigator.geolocation) return;
        currentBtn.textContent = 'Locating…';
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            currentBtn.textContent = 'Use my current location';
          },
          function () {
            currentBtn.textContent = 'Use my current location';
            addressEl.textContent = 'Could not get your current location — search or move the map instead.';
          }
        );
      });

      var autocomplete = new google.maps.places.Autocomplete(searchInput);
      autocomplete.addListener('place_changed', function () {
        var place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
          map.setCenter(place.geometry.location);
          map.setZoom(17);
        }
      });

      confirmBtn.addEventListener('click', function () {
        if (selected && opts.onConfirm) opts.onConfirm(selected);
      });
    });
  }

  // Builds a Google Maps "Get Directions" link. Prefers the app deep link
  // (works on mobile if Google Maps is installed) with a plain web URL as
  // the href fallback (spec section 11 — VaRoom hands off, never rebuilds
  // in-app navigation).
  function getDirectionsUrl(lat, lng) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
  }

  // Renders a location line for a feed card: "Westlands, Nairobi · 4.8 km
  // away" (spec section 9), only fetching distance if the browser already
  // has a last-known position cached — never prompts for permission on
  // its own (spec section 7: ask only when a feature needs it).
  function renderLocationLine(el, listing, opts) {
    opts = opts || {};
    var parts = [];
    if (listing.neighborhood) parts.push(listing.neighborhood);
    else if (listing.city) parts.push(listing.city);
    if (listing.city && listing.neighborhood) parts.push(listing.city);
    var text = parts.join(', ') || 'Location pending';
    el.textContent = text;

    if (opts.distanceKm != null) {
      el.textContent = text + ' · ' + opts.distanceKm + ' km away';
    }
    // No fake distance is ever appended when opts.distanceKm is absent —
    // the caller only passes it after a real geolocation + /distance call.
  }

  return {
    loadGoogleMaps: loadGoogleMaps,
    createLocationPicker: createLocationPicker,
    getDirectionsUrl: getDirectionsUrl,
    renderLocationLine: renderLocationLine,
  };
})();
