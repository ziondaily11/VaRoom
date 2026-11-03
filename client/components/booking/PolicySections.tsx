import React from 'react';
import type { CommercialDocument, ListingPolicy } from '../../lib/booking/bookingPolicy';
import { ICON_POLICY, ICON_POLICY_DOC } from '../../lib/booking/bookingIcons';
import Svg from './Svg';

// Property Policies and commercial Documents in the booking widget (markup
// unchanged from booking-policy.js). `loading`: the listing's documents are
// still being fetched.

export function PropertyPolicy({ policy, loading }: { policy: ListingPolicy; loading: boolean }) {
  const { document } = policy;
  const empty = loading && policy.empty ? 'Loading policy information…' : policy.empty;
  return (
    <section className="property-policy" aria-labelledby="property-policy-heading">
      <h2 className="property-policy-title" id="property-policy-heading"><Svg markup={ICON_POLICY} />Property Policies</h2>
      {policy.rows.length > 0 && (
        <dl className="property-policy-details">
          {policy.rows.map((row) => <div className="property-policy-row" key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
        </dl>
      )}
      {document && (
        <>
          {document.openUrl ? (
            <a className="property-policy-link" href={document.openUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open policy document in a new tab: ${document.filename}`}>
              <Svg markup={ICON_POLICY_DOC} />
              <span className="property-policy-name">{document.filename}<span className="property-policy-action">Open document in new tab</span></span>
            </a>
          ) : (
            <div className="property-policy-link" aria-label={`Preview unavailable for ${document.filename}`}>
              <Svg markup={ICON_POLICY_DOC} />
              <span className="property-policy-name">{document.filename}<span className="property-policy-action">Preview unavailable</span></span>
            </div>
          )}
          {document.downloadUrl && (
            <a className="property-policy-download" href={document.downloadUrl} target="_blank" rel="noopener noreferrer" aria-label={`Download policy document: ${document.filename}`}>Download document</a>
          )}
        </>
      )}
      {empty && <p className="property-policy-empty">{empty}</p>}
    </section>
  );
}

export function CommercialDocuments({ documents }: { documents: CommercialDocument[] }) {
  if (!documents.length) return null;
  return (
    <section className="property-policy" aria-labelledby="listing-documents-heading">
      <h2 className="property-policy-title" id="listing-documents-heading">Documents</h2>
      {documents.map((document) => (
        <a key={document.label} className="property-policy-link" href={document.url} target="_blank" rel="noopener" aria-label={`Open ${document.label.toLowerCase()}: ${document.filename}`}>
          <Svg markup={ICON_POLICY_DOC} />
          <span className="property-policy-name">{document.filename}<span className="property-policy-action">{document.label}</span></span>
        </a>
      ))}
    </section>
  );
}
