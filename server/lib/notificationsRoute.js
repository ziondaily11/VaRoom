'use strict';

const { resolveFrontendRouteRedirect } = require('./frontendRoute');

function resolveNotificationsRedirect(options) {
  return resolveFrontendRouteRedirect({
    ...options,
    destinationPath: '/notifications',
    unavailableMessage: 'Notifications are not available from this server.',
  });
}

module.exports = { resolveNotificationsRedirect };
