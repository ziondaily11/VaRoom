import React from 'react';

// The profile banner's fade, shared by the owner's /profile (ProfileHeader)
// and the public /<username> (ProfileBanner) so both look the same.
//
// The photo melts into the page: from about a fifth of the way down, the
// banner blends into the page's own background colour and ends on exactly
// that colour, so there is no visible edge where the photo stops. The page
// gives the colour as --vr-banner-fade-to (its own background variable), so
// light and dark mode always match. Many small steps on an ease curve keep
// the blend smooth (no bands). The name, handle, details and bio sit on the
// lower part, where the page colour is almost solid, so they stay readable
// on any photo.

/** [position %, page colour %]: transparent at the top, the page colour at the bottom. */
export const BANNER_FADE_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [22, 0], [32, 4], [40, 12], [48, 25], [56, 42], [63, 58], [70, 72], [77, 84], [84, 93], [91, 98], [100, 100],
];

export const bannerFadeGradient = (colour: string): string => `linear-gradient(to bottom, ${BANNER_FADE_STOPS
  .map(([position, amount]) => `color-mix(in srgb, ${colour} ${amount}%, transparent) ${position}%`)
  .join(', ')})`;

/**
 * Add the class "vr-banner-fade" to the banner (positioned, with its photo as
 * the background) and set --vr-banner-fade-to to the page's background.
 * --vr-banner-fade-z places the fade under the banner's own content.
 */
export const BANNER_FADE_STYLES = `
  .vr-banner-fade{ isolation:isolate; }
  .vr-banner-fade::after{
    content:''; position:absolute; inset:0; z-index:var(--vr-banner-fade-z, 1); pointer-events:none;
    background:${bannerFadeGradient('var(--vr-banner-fade-to)')};
  }
`;

/** The fade's styles, once per page (a plain style element: styled-jsx drops interpolated CSS). */
export function BannerFadeStyles() {
  return <style dangerouslySetInnerHTML={{ __html: BANNER_FADE_STYLES }} />;
}
