'use strict';

const { resolveFrontendRouteRedirect } = require('./frontendRoute');

function resolveClientHomeRedirect(options) {
  return resolveFrontendRouteRedirect({
    ...options,
    destinationPath: '/client-home',
    unavailableMessage: 'Client Home is not available from this server.',
    sameOriginMessage: 'Client Home is served by this configured frontend origin.',
  });
}

module.exports = { resolveClientHomeRedirect };
