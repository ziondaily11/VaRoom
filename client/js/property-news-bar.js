/* Property News Bar Component - Auto-refreshing, time-filtered news display (max 2 items, 2-hour rotation) */
(function(window){
  'use strict';

  // Configuration
  const CONFIG = {
    refreshInterval: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
    maxItems: 2, // Only 2 news can be up at the same time
    cacheTtl: 2 * 60 * 60 * 1000, // 2 hours cache TTL
    storageKey: 'varoom_property_news_cache_v2',
    storageKeyTimestamp: 'varoom_property_news_timestamp_v2'
  };

  // Cache management
  const cache = {
    get: function() {
      try {
        const cached = localStorage.getItem(CONFIG.storageKey);
        const timestamp = localStorage.getItem(CONFIG.storageKeyTimestamp);
        if (cached && timestamp) {
          const data = JSON.parse(cached);
          const age = Date.now() - parseInt(timestamp, 10);
          return { items: data, isFresh: age < CONFIG.cacheTtl, age: age };
        }
      } catch (e) {
        console.warn('Property news cache read error:', e);
      }
      return null;
    },
    
    set: function(data) {
      try {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        localStorage.setItem(CONFIG.storageKeyTimestamp, String(Date.now()));
      } catch (e) {
        console.warn('Property news cache write error:', e);
      }
    },
    
    clear: function() {
      try {
        localStorage.removeItem(CONFIG.storageKey);
        localStorage.removeItem(CONFIG.storageKeyTimestamp);
      } catch (e) {
        console.warn('Property news cache clear error:', e);
      }
    }
  };

  // Time utilities
  const timeUtils = {
    timeAgo: function(date) {
      if (!date) return 'Recently';
      const now = new Date();
      const past = new Date(date);
      const diffMs = now - past;
      
      if (isNaN(diffMs)) return 'Recently';
      
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return diffMins + 'm ago';
      if (diffHours < 24) return diffHours + 'h ago';
      if (diffDays < 7) return diffDays + 'd ago';
      return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  };

  // HTML utilities
  const htmlUtils = {
    escape: function(value) {
      const element = document.createElement('div');
      element.textContent = value || '';
      return element.innerHTML;
    },
    
    location: function(news) {
      if (news.location_summary) return news.location_summary;
      const values = [].concat(news.counties || [], news.towns || []).filter(Boolean);
      const unique = values.filter(function(value, index) {
        return values.findIndex(function(other) {
          return String(other).toLowerCase() === String(value).toLowerCase();
        }) === index;
      });
      if (unique.length > 5) return 'National · Kenya';
      return unique.join(' · ') || 'Kenya';
    },
    
    status: function(news) {
      const value = String(news.regulatory_status || '').toLowerCase();
      const labels = {
        proposed: 'PROPOSED',
        under_consideration: 'UNDER REVIEW',
        public_participation: 'PUBLIC INPUT',
        approved: 'APPROVED',
        enacted: 'ENACTED',
        effective: 'EFFECTIVE',
        suspended: 'SUSPENDED',
        rejected: 'REJECTED',
        amended: 'AMENDED',
        reported: 'UPDATE'
      };
      if (labels[value]) return { label: labels[value], className: value };
      return news.category === 'market' ? { label: 'MARKET UPDATE', className: 'market' } : null;
    },
    
    sourceUrl: function(value) {
      return /^https?:\/\//i.test(String(value || '')) ? String(value) : '';
    }
  };

  // Property News Bar Component
  function PropertyNewsBar(containerId, options) {
    this.container = document.getElementById(containerId);
    this.containerId = containerId;
    this.options = Object.assign({}, CONFIG, options);
    this.refreshTimer = null;
    this.isLoading = false;
    this.currentItems = [];
  }

  PropertyNewsBar.prototype = {
    init: function() {
      if (!this.container) {
        return;
      }
      
      // Load initial data (from cache if fresh, or fetch)
      this.loadNews();
      
      // Start 2-hour auto-refresh rotation
      this.startAutoRefresh();
    },
    
    loadNews: async function(forceFetch) {
      if (this.isLoading) return;
      
      try {
        // Check cache first
        const cached = cache.get();
        if (cached && cached.items && cached.items.length) {
          this.currentItems = cached.items.slice(0, this.options.maxItems);
          this.renderNews(this.currentItems);
          // If cache is still fresh and not forced, no need to make network request
          if (cached.isFresh && !forceFetch) {
            return;
          }
        } else if (!this.currentItems.length) {
          this.renderLoading();
        }

        this.isLoading = true;
        
        // Fetch latest news from backend proxy
        const response = await fetch('/api/news/latest?limit=' + this.options.maxItems, {
          headers: { Accept: 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error('Property news request failed (' + response.status + ')');
        }
        
        const items = await response.json();
        
        if (Array.isArray(items) && items.length > 0) {
          const freshItems = items.slice(0, this.options.maxItems);
          this.currentItems = freshItems;
          cache.set(freshItems);
          this.renderNews(freshItems);
        } else if (!this.currentItems.length) {
          this.renderEmpty();
        }
        // If items are empty or unchanged, existing news remains intact
      } catch (error) {
        console.warn('Property news load notice:', error.message || error);
        if (!this.currentItems.length) {
          this.renderError();
        }
      } finally {
        this.isLoading = false;
      }
    },
    
    renderLoading: function() {
      if (this.container) {
        this.container.innerHTML = '<div class="property-news-empty-card">' +
          '<div class="property-news-empty-icon-wrap">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
          '</div>' +
          '<div class="property-news-empty-title">Checking Property News…</div>' +
          '<p class="property-news-empty-desc">Fetching latest verified Kenyan real estate and regulatory updates.</p>' +
        '</div>';
      }
    },
    
    renderError: function() {
      if (this.container) {
        this.container.innerHTML = '<div class="property-news-empty-card">' +
          '<div class="property-news-empty-icon-wrap">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>' +
          '</div>' +
          '<div class="property-news-empty-title">All Caught Up</div>' +
          '<p class="property-news-empty-desc">No new property notices right now. We monitor verified land and housing sources continuously.</p>' +
          '<div class="property-news-empty-badge"><span class="property-news-empty-dot"></span> Live Monitoring Active</div>' +
        '</div>';
      }
    },
    
    renderEmpty: function() {
      if (this.container) {
        this.container.innerHTML = '<div class="property-news-empty-card">' +
          '<div class="property-news-empty-icon-wrap">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>' +
          '</div>' +
          '<div class="property-news-empty-title">All Caught Up</div>' +
          '<p class="property-news-empty-desc">No new property updates right now. We actively monitor official land registries, gazettes, and verified news in Kenya.</p>' +
          '<div class="property-news-empty-badge"><span class="property-news-empty-dot"></span> 24/7 Source Monitoring Active</div>' +
        '</div>';
      }
    },
    
    renderNews: function(items) {
      if (!this.container) return;
      if (!Array.isArray(items) || items.length === 0) {
        this.renderEmpty();
        return;
      }
      
      const html = items.slice(0, this.options.maxItems).map(function(item) {
        return this.renderNewsItem(item);
      }.bind(this)).join('');
      
      this.container.innerHTML = '<div class="property-news-bar-items">' + html + '</div>';
      
      // Wire up images
      this.wireImages();
    },
    
    renderNewsItem: function(item) {
      const source = item.source || {};
      const sourceUrl = htmlUtils.sourceUrl(source.url);
      const sourceName = source.name || 'Unknown Source';
      const location = htmlUtils.location(item);
      const status = htmlUtils.status(item);
      const publishedAt = source.published_at || item.published_at;
      const timeAgo = timeUtils.timeAgo(publishedAt);
      const imageUrl = item.image_url;
      
      let imageHtml = '';
      if (imageUrl) {
        imageHtml = '<div class="property-news-bar-image-wrap"><img class="property-news-bar-image" src="' + htmlUtils.escape(imageUrl) + '" alt="" decoding="async" loading="lazy"></div>';
      }
      
      let statusHtml = '';
      if (status) {
        statusHtml = '<span class="property-news-bar-status status-' + status.className + '">' + status.label + '</span>';
      }
      
      let sourceHtml = '<div class="property-news-bar-source">';
      if (sourceUrl) {
        sourceHtml += '<a class="property-news-bar-source-link" href="' + htmlUtils.escape(sourceUrl) + '" target="_blank" rel="noopener noreferrer">Source · ' + htmlUtils.escape(sourceName) + '</a>';
      } else {
        sourceHtml += 'Source · ' + htmlUtils.escape(sourceName);
      }
      sourceHtml += '</div>';
      
      return '<article class="property-news-bar-item">' +
        '<a class="property-news-bar-link" href="property-news.html?id=' + htmlUtils.escape(item.id) + '">' +
          imageHtml +
          '<div class="property-news-bar-kicker">Property News</div>' +
          '<div class="property-news-bar-title">' + htmlUtils.escape(item.title || 'Property update') + '</div>' +
          '<div class="property-news-bar-meta">' +
            '<span>' + htmlUtils.escape(location) + '</span>' +
            '<span>•</span>' +
            '<span>' + htmlUtils.escape(timeAgo) + '</span>' +
          '</div>' +
          statusHtml +
        '</a>' +
        sourceHtml +
      '</article>';
    },
    
    wireImages: function() {
      if (!this.container) return;
      this.container.querySelectorAll('.property-news-bar-image').forEach(function(image) {
        const wrapper = image.closest('.property-news-bar-image-wrap');
        if (wrapper) {
          image.addEventListener('load', function() {
            wrapper.classList.add('is-loaded');
          }, { once: true });
          
          image.addEventListener('error', function() {
            wrapper.remove();
          }, { once: true });
          
          if (image.complete && image.naturalWidth > 0) {
            wrapper.classList.add('is-loaded');
          }
        }
      });
    },
    
    startAutoRefresh: function() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }
      
      this.refreshTimer = setInterval(function() {
        this.loadNews(true);
      }.bind(this), this.options.refreshInterval);
    },
    
    stopAutoRefresh: function() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
    },
    
    refresh: function() {
      this.loadNews(true);
    },
    
    destroy: function() {
      this.stopAutoRefresh();
      if (this.container) {
        this.container.innerHTML = '';
      }
    }
  };

  // Export to global scope
  window.PropertyNewsBar = PropertyNewsBar;
  
  // Auto-initialize for common container IDs
  document.addEventListener('DOMContentLoaded', function() {
    const containers = ['property-news-bar', 'client-property-news-bar', 'host-property-news-bar'];
    containers.forEach(function(id) {
      const element = document.getElementById(id);
      if (element && !element.dataset.newsInitialized) {
        element.dataset.newsInitialized = 'true';
        new PropertyNewsBar(id).init();
      }
    });
  });

})(window);