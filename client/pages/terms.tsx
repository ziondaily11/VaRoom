import LegalDocumentPage from '../legacy-pages/LegalDocumentPage';
import {
  LAST_UPDATED,
  TERMS_DESCRIPTION,
  TERMS_TITLE,
  intro,
  sections,
} from '../legacy-pages/termsContent';

export default function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      title="Terms of Service"
      lastUpdated={LAST_UPDATED}
      intro={intro}
      sections={sections}
      navLabel="Terms of Service sections"
      denseNav
      headTitle={TERMS_TITLE}
      headDescription={TERMS_DESCRIPTION}
    />
  );
}
