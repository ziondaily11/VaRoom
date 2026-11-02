'use strict';

const { resolveFrontendRouteRedirect } = require('./frontendRoute');

// Chats is a native frontend page; the legacy chats.html and elie.html are
// retired. Elie opens as a conversation inside Chats.
function resolveChatsRedirect({ elie = false, ...options }) {
  const redirect = resolveFrontendRouteRedirect({
    ...options,
    destinationPath: '/chats',
    unavailableMessage: 'Chats are not available from this server.',
  });
  if (elie && redirect.location) {
    const destination = new URL(redirect.location);
    destination.searchParams.set('c', 'elie');
    return { ...redirect, location: destination.toString() };
  }
  return redirect;
}

module.exports = { resolveChatsRedirect };
