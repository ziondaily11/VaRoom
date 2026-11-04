import type { PropertyNewsItem } from '../propertyNewsCache';

// Pure formatting for the Property News page: locations, dates, regulatory
// status labels, safe source links, article images and body paragraphs.

export interface StatusResult {
  label: string;
  className: string;
}

export interface ArticleImageItem {
  url: string;
  caption?: string;
  credit?: string;
}

export function uniqueLocations(news: PropertyNewsItem): string[] {
  const values = ([] as string[]).concat(news.counties || [], news.towns || []).filter(Boolean);
  return values.filter((value, index) => {
    return (
      values.findIndex(
        (other) => String(other).toLowerCase() === String(value).toLowerCase()
      ) === index
    );
  });
}

export function detailedLocation(news: PropertyNewsItem): string {
  return uniqueLocations(news).join(' · ') || 'Kenya';
}

export function cardLocation(news: PropertyNewsItem): string {
  if (news.location_summary) return news.location_summary;
  const values = uniqueLocations(news);
  if (values.length > 5) return 'National · Kenya';
  return values.join(' · ') || 'Kenya';
}

export function formatDate(value?: string): string {
  if (!value) return 'Publication date unavailable';
  const valueDate = new Date(value);
  return Number.isNaN(valueDate.getTime())
    ? 'Publication date unavailable'
    : valueDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
}

export function formatMastheadDate(value?: string): string {
  const dateObj = value ? new Date(value) : new Date();
  const valid = !Number.isNaN(dateObj.getTime()) ? dateObj : new Date();
  return valid.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function getRegulatoryStatus(news: PropertyNewsItem): StatusResult | null {
  const value = String(news.regulatory_status || '').toLowerCase();
  const labels: Record<string, string> = {
    proposed: 'PROPOSED',
    under_consideration: 'UNDER REVIEW',
    public_participation: 'PUBLIC INPUT',
    approved: 'APPROVED',
    enacted: 'ENACTED',
    effective: 'EFFECTIVE',
    suspended: 'SUSPENDED',
    rejected: 'REJECTED',
    amended: 'AMENDED',
    reported: 'UPDATE',
  };
  if (labels[value]) {
    return { label: labels[value], className: value };
  }
  if (news.category === 'market') {
    return { label: 'MARKET UPDATE', className: 'market' };
  }
  return null;
}

export function safeSourceUrl(value?: string): string {
  return /^https?:\/\//i.test(String(value || '')) ? String(value) : '';
}

export function extractImages(item: PropertyNewsItem): ArticleImageItem[] {
  const list: ArticleImageItem[] = [];
  const seen = new Set<string>();

  const add = (url?: string, caption?: string, credit?: string) => {
    if (!url || typeof url !== 'string' || !url.trim()) return;
    const cleanUrl = url.trim();
    if (seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    list.push({
      url: cleanUrl,
      caption: caption || item.caption,
      credit: credit || item.credit || (item.source?.name ? item.source.name : undefined),
    });
  };

  if (Array.isArray(item.images)) {
    for (const img of item.images) {
      if (typeof img === 'string') {
        add(img);
      } else if (img && typeof img === 'object' && (img as { url?: string }).url) {
        const image = img as { url: string; caption?: string; credit?: string };
        add(image.url, image.caption, image.credit);
      }
    }
  }

  if (Array.isArray(item.image_urls)) {
    for (const url of item.image_urls) {
      add(url);
    }
  }

  if (item.image_url) {
    add(item.image_url);
  }

  return list;
}

export interface ArticleMedia {
  activeImages: ArticleImageItem[];
  hasVideo: boolean;
  /** False when there is nothing for the right-hand image trail. */
  hasMedia: boolean;
}

/** The article's images that have not failed to load, and whether it has video. */
export function articleMedia(item: PropertyNewsItem | null, failedImageUrls: Record<string, boolean>): ArticleMedia {
  const candidateImages = item ? extractImages(item) : [];
  const activeImages = candidateImages.filter((img) => !failedImageUrls[img.url]);
  const hasVideo = Boolean(item?.video_url);
  return { activeImages, hasVideo, hasMedia: activeImages.length > 0 || hasVideo };
}

/** Non-empty, trimmed paragraphs of an article body (split on line breaks). */
export function splitArticleParagraphs(bodyText: string): string[] {
  return bodyText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Whether the body already opens with the summary (compared on the first 50
 * characters, ignoring a trailing full stop), so the summary is not repeated.
 */
export function bodyRepeatsSummary(summaryText: string, firstParagraph: string | undefined): boolean {
  const cleanSummaryPrefix = summaryText.replace(/[\.\s]+$/, '').slice(0, 50).toLowerCase();
  const firstParaPrefix = (firstParagraph || '').slice(0, 50).toLowerCase();
  return Boolean(cleanSummaryPrefix && (
    firstParaPrefix.startsWith(cleanSummaryPrefix) ||
    cleanSummaryPrefix.startsWith(firstParaPrefix)
  ));
}

export type ArticleParagraph =
  | { kind: 'subhead'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'text'; text: string };

/** Markdown-style headings become subheads; quoted or "> " lines become pull quotes. */
export function classifyParagraph(paragraph: string): ArticleParagraph {
  const isSubhead = paragraph.startsWith('# ') || paragraph.startsWith('## ') || paragraph.startsWith('### ');
  const isQuote =
    (paragraph.startsWith('"') && paragraph.endsWith('"')) ||
    (paragraph.startsWith('“') && paragraph.endsWith('”')) ||
    (paragraph.startsWith("'") && paragraph.endsWith("'")) ||
    paragraph.startsWith('> ');

  if (isSubhead) return { kind: 'subhead', text: paragraph.replace(/^#+\s*/, '') };
  if (isQuote) return { kind: 'quote', text: paragraph.replace(/^>\s*/, '') };
  return { kind: 'text', text: paragraph };
}
