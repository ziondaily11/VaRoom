// The Discover card media size on Host home, unchanged from
// legacy-pages/host-home.html: each photo or video keeps its proportions,
// capped at 460px tall on desktop (560px or 1.6× the width on phones), and
// the stage takes the tallest and widest frame. Also paints the blurred
// "ambient" backdrop from the loaded image or the video poster.

export const MOBILE_QUERY = '(max-width:860px)';

export interface Frame { width: number; height: number }

/** The frame for media of width × height in the space available. */
export function fitFrame(width: number, height: number, availableWidth: number, maxHeight: number, fallback: Frame): Frame {
  if (!width || !height) return fallback;
  const ratio = width / height;
  const fittedHeight = Math.min(maxHeight, availableWidth / ratio);
  return { height: fittedHeight, width: Math.min(availableWidth, fittedHeight * ratio) };
}

/** The 4:3 frame used until the media's own size is known. */
export function fallbackFrame(availableWidth: number, isMobile: boolean): Frame {
  const fallbackWidth = Math.min(availableWidth, 414);
  const maxHeight = isMobile ? Math.min(560, availableWidth * 1.6) : 460;
  const height = Math.min(maxHeight, fallbackWidth / (4 / 3));
  return { height, width: Math.min(fallbackWidth, height * (4 / 3)) };
}

const setAmbient = (target: Element | null, source: string | null | undefined) => {
  if (target instanceof HTMLElement && source) target.style.setProperty('--discover-ambient-image', `url(${JSON.stringify(source)})`);
};

/** Sizes one `.media-carousel` or `.card-video` stage inside the Discover feed. */
export function sizeStage(stage: HTMLElement, isMobile: boolean): void {
  if (!stage.parentElement) return;
  const isVideo = stage.matches('.card-video');
  const media = (isVideo ? [stage.querySelector('video')] : Array.from(stage.querySelectorAll('img:not(.media-slide-background)'))).filter(Boolean) as Array<HTMLImageElement | HTMLVideoElement>;
  if (isVideo) {
    const video = media[0] as HTMLVideoElement | undefined;
    if (video) setAmbient(stage, video.poster || video.getAttribute('poster'));
  } else {
    media.forEach((item) => {
      const image = item as HTMLImageElement;
      if (image.complete && image.naturalWidth > 0) setAmbient(image.closest('.media-slide'), image.currentSrc || image.src);
    });
  }
  const contentInset = parseFloat(getComputedStyle(stage).getPropertyValue('--discover-content-inset')) || 0;
  const rightInset = isMobile ? contentInset : 0;
  const availableWidth = Math.max(1, stage.parentElement.clientWidth - contentInset - rightInset);
  const fallback = fallbackFrame(availableWidth, isMobile);
  const maxHeight = isMobile ? Math.min(560, availableWidth * 1.6) : 460;
  const frames = media.map((item) => {
    const source = item.closest('.media-slide') || stage;
    const metaWidth = Number(source.getAttribute('data-media-width'));
    const metaHeight = Number(source.getAttribute('data-media-height'));
    // A loaded video's own size wins over the stored one: stored sizes can be
    // the unrotated encoding (a portrait phone video saved as 1920×1080),
    // which framed the video in the wrong shape and stretched it.
    const natural = isVideo
      ? { width: (item as HTMLVideoElement).videoWidth, height: (item as HTMLVideoElement).videoHeight }
      : { width: (item as HTMLImageElement).naturalWidth, height: (item as HTMLImageElement).naturalHeight };
    const hasNatural = isVideo && natural.width > 0 && natural.height > 0;
    const hasMeta = Number.isFinite(metaWidth) && metaWidth > 0 && Number.isFinite(metaHeight) && metaHeight > 0;
    const width = hasNatural ? natural.width : hasMeta ? metaWidth : natural.width;
    const height = hasNatural ? natural.height : hasMeta ? metaHeight : natural.height;
    return fitFrame(width, height, availableWidth, maxHeight, fallback);
  });
  if (!frames.length) frames.push(fallback);
  const tallest = frames.reduce((best, frame) => (frame.height > best.height ? frame : best), frames[0]);
  const widest = frames.reduce((best, frame) => (frame.width > best.width ? frame : best), frames[0]);
  stage.style.setProperty('--discover-media-height', `${Math.round(tallest.height)}px`);
  stage.style.setProperty('--discover-media-width', `${Math.round(widest.width)}px`);
  media.forEach((item, index) => {
    item.style.width = `${Math.round(frames[index].width)}px`;
    item.style.height = 'auto';
  });
}
