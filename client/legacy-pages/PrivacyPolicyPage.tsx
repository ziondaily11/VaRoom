"use client";

import LegalDocumentPage from "./LegalDocumentPage";
import { LAST_UPDATED, intro, sections } from "./privacyContent";

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      intro={intro}
      sections={sections}
      navLabel="Privacy policy sections"
      headTitle="Privacy Policy | Varoom"
      headDescription="Privacy Policy governing the use of the Varoom property marketplace."
    />
  );
}
