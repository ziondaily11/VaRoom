/* Page-owned initializer for the public Property News legacy page. */
(function (root) {
  'use strict';

  function initializePropertyNewsPage(context) {
    var container = context.container;
    var signal = context.signal;
    var onCleanup = context.onCleanup;
    var isActive = context.isActive;

    function isCurrent() {
      return !signal.aborted && isActive();
    }

    function escapeHtml(value) {
      var element = document.createElement('div');
      element.textContent = value || '';
      return element.innerHTML;
    }

    function uniqueLocations(news) {
      var values = [].concat(news.counties || [], news.towns || []).filter(Boolean);
      return values.filter(function (value, index) {
        return values.findIndex(function (other) {
          return String(other).toLowerCase() === String(value).toLowerCase();
        }) === index;
      });
    }

    function detailedLocation(news) {
      return uniqueLocations(news).join(' · ') || 'Kenya';
    }

    function cardLocation(news) {
      if (news.location_summary) return news.location_summary;
      var values = uniqueLocations(news);
      if (values.length > 5) return 'National · Kenya';
      return values.join(' · ') || 'Kenya';
    }

    function date(value) {
      if (!value) return 'Publication date unavailable';
      var valueDate = new Date(value);
      return Number.isNaN(valueDate.getTime())
        ? 'Publication date unavailable'
        : valueDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function status(news) {
      var value = String(news.regulatory_status || '').toLowerCase();
      var labels = {
        proposed: 'PROPOSED', under_consideration: 'UNDER REVIEW', public_participation: 'PUBLIC INPUT',
        approved: 'APPROVED', enacted: 'ENACTED', effective: 'EFFECTIVE', suspended: 'SUSPENDED',
        rejected: 'REJECTED', amended: 'AMENDED', reported: 'UPDATE',
      };
      if (labels[value]) return { label: labels[value], className: value };
      return news.category === 'market' ? { label: 'MARKET UPDATE', className: 'market' } : null;
    }

    function statusHtml(news) {
      var value = status(news);
      return value ? '<span class="status ' + value.className + '">' + value.label + '</span>' : '';
    }

    function safeSourceUrl(value) {
      return /^https?:\/\//i.test(String(value || '')) ? String(value) : '';
    }

    function sourceHtml(news, className) {
      var source = news.source || {};
      if (!source.name) return '';
      var url = safeSourceUrl(source.url);
      return '<div class="' + className + '">' + (url
        ? '<a class="news-card-source-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">Source · ' + escapeHtml(source.name) + '</a>'
        : 'Source · ' + escapeHtml(source.name)) + '</div>';
    }

    function wireImages(target) {
      target.querySelectorAll('.news-card-image,.detail-image').forEach(function (image) {
        var wrapper = image.closest('.news-card-image-wrap,.detail-image-wrap');
        var onLoad = function () {
          if (isCurrent() && wrapper) wrapper.classList.add('is-loaded');
        };
        var onError = function () {
          if (isCurrent() && wrapper) wrapper.remove();
        };

        image.addEventListener('load', onLoad);
        image.addEventListener('error', onError);
        onCleanup(function () {
          image.removeEventListener('load', onLoad);
          image.removeEventListener('error', onError);
        });

        if (image.complete && image.naturalWidth > 0 && wrapper) wrapper.classList.add('is-loaded');
      });
    }

    function imageHtml(news, wrapClass, imageClass) {
      return typeof news.image_url === 'string' && news.image_url.trim()
        ? '<div class="' + wrapClass + '"><img class="' + imageClass + '" src="' + escapeHtml(news.image_url) + '" alt="" decoding="async" loading="lazy"></div>'
        : '';
    }

    function card(news) {
      var source = news.source || {};
      return '<article class="news-card"><a class="news-card-main" href="/property-news?id=' + encodeURIComponent(news.id) + '"><h2>' + escapeHtml(news.title) + '</h2><p>' + escapeHtml(news.summary || 'Read the latest property update from VaRoom.') + '</p><div class="meta"><span>' + escapeHtml(cardLocation(news)) + '</span><span>•</span><span>' + escapeHtml(date(source.published_at || news.published_at)) + '</span></div>' + imageHtml(news, 'news-card-image-wrap', 'news-card-image') + '</a>' + sourceHtml(news, 'news-card-source') + statusHtml(news) + '</article>';
    }

    function emptyIndexHtml() {
      return '<div class="state"><div class="state-icon-wrap"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2-2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg></div><div class="state-title">All Caught Up</div><p class="state-desc">There are no new property updates right now. We continuously monitor official land registries, gazettes, and verified news in Kenya.</p><div class="state-badge"><span class="state-dot"></span> 24/7 Source Monitoring Active</div></div>';
    }

    function showError(target) {
      target.innerHTML = emptyIndexHtml();
    }

    async function showIndex() {
      var list = container.querySelector('#news-list');
      try {
        var items = await root.VaRoomPropertyNews.all(50);
        if (!isCurrent()) return;
        list.innerHTML = Array.isArray(items) && items.length ? items.map(card).join('') : emptyIndexHtml();
        wireImages(list);
      } catch (error) {
        if (!isCurrent()) return;
        console.warn('Property news notice:', error);
        showError(list);
      }
    }

    async function showDetail(id) {
      var index = container.querySelector('#news-index');
      var detail = container.querySelector('#news-detail');
      index.style.display = 'none';
      detail.style.display = 'block';
      detail.innerHTML = '<div class="skeleton"></div>';

      try {
        var news = await root.VaRoomPropertyNews.get(id);
        if (!isCurrent()) return;
        var source = news.source || {};
        var articleDate = source.published_at || news.published_at;
        var sourceUrl = safeSourceUrl(source.url);
        var sourceHeading = source.name && sourceUrl
          ? '<a class="source-link" href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">Source · ' + escapeHtml(source.name) + '</a>'
          : (source.name ? '<strong>Source · ' + escapeHtml(source.name) + '</strong>' : '');
        var sourceBox = source.name
          ? '<div class="source-box">' + sourceHeading + '<br>This VaRoom summary is based on the linked source. Regulatory status reflects the published record and is not legal advice.</div>'
          : '';

        detail.innerHTML = '<div class="detail-card"><p class="eyebrow">Property Intelligence</p><h1>' + escapeHtml(news.title) + '</h1><div class="article-meta meta"><span>' + escapeHtml(detailedLocation(news)) + '</span><span>•</span><span>' + escapeHtml(date(articleDate)) + '</span></div>' + imageHtml(news, 'detail-image-wrap', 'detail-image') + statusHtml(news) + '<p class="detail-summary">' + escapeHtml(news.summary || '') + '</p>' + (news.body ? '<div class="detail-body">' + escapeHtml(news.body) + '</div>' : '') + '<div class="fact-grid"><div><span class="fact-label">Location</span><span class="fact-value">' + escapeHtml(detailedLocation(news)) + '</span></div><div><span class="fact-label">Current status</span><span class="fact-value">' + escapeHtml(status(news) ? status(news).label : 'Reported update') + '</span></div><div><span class="fact-label">Published</span><span class="fact-value">' + escapeHtml(date(articleDate)) + '</span></div></div>' + sourceBox + '</div>';
        wireImages(detail);
      } catch (error) {
        if (!isCurrent()) return;
        console.warn('Property news detail could not be loaded:', error);
        showError(detail);
      }
    }

    var search = context.search;
    if (search === undefined) search = (root.location && root.location.search) || '';
    var newsId = new URLSearchParams(search).get('id');
    return newsId ? showDetail(newsId) : showIndex();
  }

  root.VaRoomLegacyPageInitializers = root.VaRoomLegacyPageInitializers || {};
  root.VaRoomLegacyPageInitializers.propertyNews = initializePropertyNewsPage;
})(typeof window !== 'undefined' ? window : globalThis);
