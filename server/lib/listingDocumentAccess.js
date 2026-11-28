'use strict';

// A short-lived (5 minute) link to a listing document in its storage: R2, or
// Supabase Storage for older uploads. Callers decide who may have it
// (routes/listingDocumentRoutes.js for hosts and guests, the admin page for admins).

const supabaseAdmin = require('./supabaseClient');
const mediaStorageService = require('./mediaStorageService');

const LINK_SECONDS = 300;

/** A Content-Disposition value safe for any filename. */
function contentDisposition(kind, filename) {
  const original = String(filename || 'listing-document').replace(/[\r\n]/g, '_').slice(0, 180);
  const safe = original.replace(/[^\x20-\x7E]|["\\]/g, '_');
  return `${kind}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(original)}`;
}

/** inline: shown in the browser (preview); otherwise downloaded. */
async function signedDocumentUrl(document, { inline = false } = {}) {
  if (document.storage_provider === 'supabase') {
    const { data, error } = await supabaseAdmin.storage.from(document.storage_bucket)
      .createSignedUrl(document.storage_key, LINK_SECONDS, ...(inline ? [] : [{ download: document.original_filename }]));
    if (error || !data?.signedUrl) throw error || new Error('Unable to sign the legacy document');
    return data.signedUrl;
  }
  const authorization = await mediaStorageService.generateR2DownloadAuthorization(
    document.storage_key, document.mime_type, LINK_SECONDS, contentDisposition(inline ? 'inline' : 'attachment', document.original_filename),
  );
  return authorization.url;
}

module.exports = { signedDocumentUrl, contentDisposition };
