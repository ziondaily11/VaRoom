// Scrolling rules for the legal documents (moved out of
// components/legal/LegalDocumentPage.tsx, unchanged behaviour). Above 900 px
// the sections scroll in their own pane (styles/privacy.css, min-width 901px);
// below it the window scrolls.

export const isPaneLayout = (viewportWidth: number) => viewportWidth > 900;

/** Pane scroll position that brings a section to 24 px below the pane's top. */
export function paneScrollTopFor(targetTop: number, paneTop: number, paneScrollTop: number): number {
  return Math.max(0, targetTop - paneTop + paneScrollTop - 24);
}

/** Active-section line: 140 px into the pane, or 180 px from the window's top. */
export const activeSectionLimit = (inPane: boolean) => (inPane ? 140 : 180);

/** The last section (in document order) whose top has reached the line, or '' when none has. */
export function activeSectionId(sections: Array<{ id: string; top: number }>, limit: number): string {
  let current = '';
  for (const section of sections) {
    if (section.top <= limit) current = section.id;
  }
  return current;
}

/** Links in the documents: web links open in a new tab; others (mailto:, in-app) stay. */
export function legalLinkTarget(href: string): { target?: '_blank'; rel?: 'noopener noreferrer' } {
  const isExternal = href.startsWith('http');
  return { target: isExternal ? '_blank' : undefined, rel: isExternal ? 'noopener noreferrer' : undefined };
}
