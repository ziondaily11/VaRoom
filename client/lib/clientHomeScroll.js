const MOBILE_SCROLL_QUERY = '(max-width: 860px)';

function isDocumentScroll(windowObject) {
  return windowObject.matchMedia(MOBILE_SCROLL_QUERY).matches;
}

function captureScrollPosition(windowObject, feedElement) {
  return {
    windowY: windowObject.scrollY || 0,
    areaY: feedElement ? feedElement.scrollTop || 0 : 0,
  };
}

function restoreScrollPosition(windowObject, feedElement, position) {
  if (!position || typeof position !== 'object') return;
  if (isDocumentScroll(windowObject)) {
    windowObject.scrollTo(0, Math.max(0, Number(position.windowY) || 0));
    return;
  }
  if (feedElement) feedElement.scrollTop = Math.max(0, Number(position.areaY) || 0);
}

module.exports = {
  captureScrollPosition,
  restoreScrollPosition,
};
