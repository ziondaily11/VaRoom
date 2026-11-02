/** Clicks the browser should handle itself: new tab/window, download, middle/right button. */
export function isModifiedClick(event: { button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } | null | undefined): boolean {
  if (!event) return false;
  return Boolean(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (typeof event.button === 'number' && event.button !== 0));
}
