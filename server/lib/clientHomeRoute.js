'use strict';

function resolveClientHomeRedirect({
  frontendBaseUrl,
  requestHost,
  requestUrl,
  nodeEnv = process.env.NODE_ENV,
  port = process.env.PORT || 3000,
}) {
  const configuredUrl = frontendBaseUrl || (nodeEnv === 'production' ? null : `http://localhost:${port}`);
  if (!configuredUrl || !requestHost) {
    return { status: 503, message: 'Client Home is not available from this server.' };
  }

  let frontendUrl;
  try {
    frontendUrl = new URL(configuredUrl);
  } catch {
    return { status: 503, message: 'Client Home is not available from this server.' };
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
    return { status: 503, message: 'Client Home is not available from this server.' };
  }

  if (frontendUrl.host.toLowerCase() === requestHost.toLowerCase()) {
    return { status: 503, message: 'Client Home is served by this configured frontend origin.' };
  }

  const destination = new URL('/client-home', frontendUrl.origin);
  const queryIndex = requestUrl.indexOf('?');
  if (queryIndex >= 0) destination.search = requestUrl.slice(queryIndex);
  return { status: 302, location: destination.toString() };
}

module.exports = { resolveClientHomeRedirect };
