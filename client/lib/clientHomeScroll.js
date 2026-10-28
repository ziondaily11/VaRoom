const MOBILE_SCROLL_QUERY = '(max-width: 860px)';

function isDocumentScroll(windowObject) {
  return windowObject.matchMedia(MOBILE_SCROLL_QUERY).matches;
}

function captureScrollPosition(windowObject, feedElement) {
  const documentScroll = isDocumentScroll(windowObject);
  const viewportTop = documentScroll ? 0 : feedElement?.getBoundingClientRect().top || 0;
  const viewportBottom = documentScroll ? windowObject.innerHeight : viewportTop + (feedElement?.clientHeight || 0);
  const anchor = feedElement
    ? Array.from(feedElement.querySelectorAll('[data-media]')).find((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.bottom > viewportTop && bounds.top < viewportBottom;
    })
    : null;
  return {
    windowY: windowObject.scrollY || 0,
    areaY: feedElement ? feedElement.scrollTop || 0 : 0,
    anchorId: anchor?.dataset.media || null,
    anchorOffset: anchor ? anchor.getBoundingClientRect().top - viewportTop : null,
  };
}

function restoreScrollPosition(windowObject, feedElement, position) {
  if (!position || typeof position !== 'object') return;
  const documentScroll = isDocumentScroll(windowObject);
  if (feedElement && position.anchorId && Number.isFinite(position.anchorOffset)) {
    const anchor = Array.from(feedElement.querySelectorAll('[data-media]'))
      .find((element) => element.dataset.media === position.anchorId);
    if (anchor) {
      const viewportTop = documentScroll ? 0 : feedElement.getBoundingClientRect().top;
      const delta = anchor.getBoundingClientRect().top - viewportTop - position.anchorOffset;
      if (documentScroll) windowObject.scrollTo(0, Math.max(0, windowObject.scrollY + delta));
      else feedElement.scrollTop = Math.max(0, feedElement.scrollTop + delta);
      return;
    }
  }
  if (documentScroll) {
    windowObject.scrollTo(0, Math.max(0, Number(position.windowY) || 0));
    return;
  }
  if (feedElement) feedElement.scrollTop = Math.max(0, Number(position.areaY) || 0);
}

function preserveAnchorPosition(windowObject, feedElement, position, onUserScroll) {
  if (!feedElement || !position?.anchorId || !Number.isFinite(position.anchorOffset) ||
      (typeof windowObject.ResizeObserver !== 'function' && typeof windowObject.MutationObserver !== 'function')) return () => {};
  const documentScroll = isDocumentScroll(windowObject);
  const cards = Array.from(feedElement.querySelectorAll('[data-media]'));
  const anchorIndex = cards.findIndex((element) => element.dataset?.media === position.anchorId);
  if (anchorIndex <= 0) return () => {};

  const anchor = cards[anchorIndex];
  const viewportTop = () => documentScroll ? 0 : feedElement.getBoundingClientRect().top;
  const reconcile = () => {
    if (onUserScroll()) {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      return;
    }
    if (typeof feedElement.contains === 'function' && !feedElement.contains(anchor)) {
      restoreScrollPosition(windowObject, feedElement, position);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      return;
    }
    const delta = anchor.getBoundingClientRect().top - viewportTop() - position.anchorOffset;
    if (Math.abs(delta) < 1) return;
    if (documentScroll) windowObject.scrollTo(0, Math.max(0, windowObject.scrollY + delta));
    else feedElement.scrollTop = Math.max(0, feedElement.scrollTop + delta);
  };
  const resizeObserver = typeof windowObject.ResizeObserver === 'function'
    ? new windowObject.ResizeObserver(reconcile)
    : null;
  const mutationObserver = typeof windowObject.MutationObserver === 'function'
    ? new windowObject.MutationObserver(reconcile)
    : null;
  resizeObserver?.observe(feedElement);
  cards.slice(0, anchorIndex).forEach((element) => resizeObserver?.observe(element));
  mutationObserver?.observe(feedElement, { childList: true, subtree: true, characterData: true });
  return () => {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  };
}

module.exports = {
  captureScrollPosition,
  preserveAnchorPosition,
  restoreScrollPosition,
};
