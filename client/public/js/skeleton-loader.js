/* Skeleton Loader Utility */

(function () {
  'use strict';

  window.SkeletonLoader = {
    card: function () {
      return (
        '<div class="skeleton-card">' +
          '<div class="skeleton-card-media"></div>' +
          '<div class="skeleton-card-body">' +
            '<div class="skeleton-card-head">' +
              '<div class="skeleton-card-avatar"></div>' +
              '<div class="skeleton-card-text">' +
                '<div class="skeleton-line"></div>' +
                '<div class="skeleton-line short"></div>' +
              '</div>' +
            '</div>' +
            '<div class="skeleton-card-caption"></div>' +
            '<div class="skeleton-card-caption-2"></div>' +
            '<div class="skeleton-card-actions">' +
              '<div class="skeleton-action-btn"></div>' +
              '<div class="skeleton-action-btn"></div>' +
              '<div class="skeleton-action-btn"></div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    },

    feedCards: function (count) {
      count = count || 3;
      var html = '<div class="skeleton-feed">';
      for (var i = 0; i < count; i++) {
        html += this.card();
      }
      html += '</div>';
      return html;
    },

    gridItem: function () {
      return '<div class="skeleton-grid-item"></div>';
    },

    grid: function (count) {
      count = count || 6;
      var html = '<div class="skeleton-grid">';
      for (var i = 0; i < count; i++) {
        html += this.gridItem();
      }
      html += '</div>';
      return html;
    },

    bookingCard: function () {
      return (
        '<div class="skeleton-booking-card">' +
          '<div class="skeleton-bk-top">' +
            '<div class="skeleton-bk-avatar"></div>' +
            '<div class="skeleton-bk-text">' +
              '<div class="skeleton-line"></div>' +
              '<div class="skeleton-line short"></div>' +
            '</div>' +
            '<div class="skeleton-bk-status"></div>' +
          '</div>' +
          '<div class="skeleton-bk-details">' +
            '<div class="skeleton-bk-detail-line"></div>' +
            '<div class="skeleton-bk-detail-line short"></div>' +
          '</div>' +
          '<div class="skeleton-bk-actions">' +
            '<div class="skeleton-bk-action"></div>' +
            '<div class="skeleton-bk-action"></div>' +
          '</div>' +
        '</div>'
      );
    },

    bookingCards: function (count) {
      count = count || 3;
      var html = '';
      for (var i = 0; i < count; i++) {
        html += this.bookingCard();
      }
      return html;
    },

    chatItem: function () {
      return (
        '<div class="skeleton-chat-item">' +
          '<div class="skeleton-chat-avatar"></div>' +
          '<div class="skeleton-chat-content">' +
            '<div class="skeleton-chat-name"></div>' +
            '<div class="skeleton-chat-message"></div>' +
            '<div class="skeleton-chat-time"></div>' +
          '</div>' +
        '</div>'
      );
    },

    chatList: function (count) {
      count = count || 4;
      var html = '';
      for (var i = 0; i < count; i++) {
        html += this.chatItem();
      }
      return html;
    },

    notification: function () {
      return (
        '<div class="skeleton-notification">' +
          '<div class="skeleton-notif-icon"></div>' +
          '<div class="skeleton-notif-content">' +
            '<div class="skeleton-notif-title"></div>' +
            '<div class="skeleton-notif-text"></div>' +
          '</div>' +
        '</div>'
      );
    },

    notifications: function (count) {
      count = count || 3;
      var html = '';
      for (var i = 0; i < count; i++) {
        html += this.notification();
      }
      return html;
    },

    title: function () {
      return '<div class="skeleton-title"></div>';
    },

    tabs: function (count) {
      count = count || 3;
      var html = '<div class="skeleton-tabs">';
      for (var i = 0; i < count; i++) {
        html += '<div class="skeleton-tab"></div>';
      }
      html += '</div>';
      return html;
    }
  };
})();
