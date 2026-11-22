import LegalDocumentPage from '../components/legal/LegalDocumentPage';
import { LAST_UPDATED, PRIVACY_DESCRIPTION, PRIVACY_TITLE, intro, sections } from '../lib/legal/privacyContent';

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      intro={intro}
      sections={sections}
      navLabel="Privacy policy sections"
      headTitle={PRIVACY_TITLE}
      headDescription={PRIVACY_DESCRIPTION}
    />
  );
}
