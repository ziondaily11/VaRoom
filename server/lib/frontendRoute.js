'use strict';

function resolveFrontendRouteRedirect({
  frontendBaseUrl,
  requestHost,
  requestUrl,
  destinationPath,
  unavailableMessage,
  sameOriginMessage = unavailableMessage,
  nodeEnv = process.env.NODE_ENV,
  port = process.env.PORT || 3000,
}) {
  const configuredUrl = frontendBaseUrl || (nodeEnv === 'production' ? null : `http://localhost:${port}`);
  if (!configuredUrl || !requestHost || !destinationPath || !destinationPath.startsWith('/') || destinationPath.startsWith('//') || /[?#]/.test(destinationPath)) {
    return { status: 503, message: unavailableMessage };
  }

  let frontendUrl;
  try {
    frontendUrl = new URL(configuredUrl);
  } catch {
    return { status: 503, message: unavailableMessage };
  }

  if (
    !['http:', 'https:'].includes(frontendUrl.protocol)
    || frontendUrl.username
    || frontendUrl.password
    || frontendUrl.pathname !== '/'
    || frontendUrl.search
    || frontendUrl.hash
    || (nodeEnv === 'production' && frontendUrl.protocol !== 'https:')
    || (nodeEnv === 'production' && ['localhost', '127.0.0.1', '::1'].includes(frontendUrl.hostname))
  ) {
    return { status: 503, message: unavailableMessage };
  }

  if (frontendUrl.host.toLowerCase() === requestHost.toLowerCase()) {
    return { status: 503, message: sameOriginMessage };
  }

  const destination = new URL(destinationPath, frontendUrl.origin);
  const queryIndex = typeof requestUrl === 'string' ? requestUrl.indexOf('?') : -1;
  if (queryIndex >= 0) destination.search = requestUrl.slice(queryIndex);
  return { status: 302, location: destination.toString() };
}

module.exports = { resolveFrontendRouteRedirect };
