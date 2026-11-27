// Listing photos: how many, how good, and how big they are uploaded.
//
// Checked in the browser as the host picks photos (and again by the server on
// upload, server/lib/photoQuality.js, with the same measures). Clear failures
// are refused with the reason; borderline photos are kept with a note.
//
// Calibrated on real listing photos (sharpness of a 512px greyscale copy):
// real photos scored 199-3,270; slightly soft 24-239; clearly blurry 5-26.

export const PHOTO_RULES = {
  /** Photos a listing needs (videos don't count); a hotel restaurant-only listing needs fewer. */
  minPhotos: 5,
  minPhotosRestaurant: 3,
  /** Photos and videos together. */
  maxMedia: 8,
  maxVideos: 2,
  /** Longest side, in pixels. Instagram photos are 1080px. */
  minLongSide: 1000,
  /** Refused below this sharpness; noted as soft below the next. */
  blurry: 30,
  soft: 100,
  /** Mean brightness (0-255): noted only, never refused. */
  dark: 55,
  washedOut: 235,
  /** Longest side over shortest: a screenshot or a panorama. */
  oddShape: 2.2,
  /** dHash bits that may differ for two photos to count as the same one. */
  sameDistance: 5,
  /** Sizes: what is measured, and the longest side uploaded. */
  measureSide: 512,
  uploadSide: 2560,
} as const;

/** Photos this listing needs before it can be published. */
export const minPhotosFor = (restaurantOnly: boolean) => (restaurantOnly ? PHOTO_RULES.minPhotosRestaurant : PHOTO_RULES.minPhotos);

/** Sharpness: the variance of the Laplacian of a greyscale image. */
export function sharpness(gray: ArrayLike<number>, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n += 1;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function brightness(gray: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < gray.length; i += 1) total += gray[i];
  return gray.length ? total / gray.length : 0;
}

/** A 64-bit difference hash (16 hex characters): near-identical photos have near-identical hashes. */
export function differenceHash(gray: ArrayLike<number>, width: number, height: number): string {
  // Average the image into 9 x 8 cells, then compare each cell with its right-hand neighbour.
  const cells: number[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const x0 = Math.floor((col * width) / 9); const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * width) / 9));
      const y0 = Math.floor((row * height) / 8); const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * height) / 8));
      let total = 0; let count = 0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { total += gray[y * width + x]; count += 1; }
      cells.push(total / count);
    }
  }
  let hex = '';
  for (let row = 0; row < 8; row += 1) {
    let byte = 0;
    for (let col = 0; col < 8; col += 1) byte = (byte << 1) | (cells[row * 9 + col] > cells[row * 9 + col + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hashDistance(a: string, b: string): number {
  let distance = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { distance += x & 1; x >>= 1; }
  }
  return distance;
}

/** What one photo measures: its size, and a greyscale copy at most measureSide long. */
export interface PhotoMeasure { width: number; height: number; gray: ArrayLike<number>; grayWidth: number; grayHeight: number }

export interface PhotoVerdict {
  /** Why it is refused, or null. */
  refused: string | null;
  /** What to tell the host about a photo that is kept. */
  notes: string[];
  hash: string;
}

/** The rules for one photo, given the hashes of the photos already added. */
export function judgePhoto(name: string, measure: PhotoMeasure, otherHashes: string[]): PhotoVerdict {
  const { width, height, gray, grayWidth, grayHeight } = measure;
  const hash = differenceHash(gray, grayWidth, grayHeight);
  const longSide = Math.max(width, height);
  if (longSide < PHOTO_RULES.minLongSide) {
    return { refused: `"${name}" is too small (${width}×${height}). Use a photo at least ${PHOTO_RULES.minLongSide} pixels on its longest side.`, notes: [], hash };
  }
  if (otherHashes.some((other) => hashDistance(other, hash) <= PHOTO_RULES.sameDistance)) {
    return { refused: `"${name}" is the same photo as one you've already added.`, notes: [], hash };
  }
  const sharp = sharpness(gray, grayWidth, grayHeight);
  if (sharp < PHOTO_RULES.blurry) return { refused: `"${name}" is too blurry. Try a sharper photo.`, notes: [], hash };
  const notes: string[] = [];
  if (sharp < PHOTO_RULES.soft) notes.push('looks a little soft');
  const light = brightness(gray);
  if (light < PHOTO_RULES.dark) notes.push('looks dark');
  else if (light > PHOTO_RULES.washedOut) notes.push('looks washed out');
  if (longSide / Math.max(1, Math.min(width, height)) > PHOTO_RULES.oddShape) notes.push('looks like a screenshot or panorama');
  return { refused: null, notes, hash };
}

// ---------- In the browser ----------

/** Draws a photo at most `side` long. */
async function drawn(file: File, side: number): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot read photos.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { canvas, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** Measures a picked photo in the browser. */
export async function measurePhoto(file: File): Promise<PhotoMeasure> {
  const { canvas, width, height } = await drawn(file, PHOTO_RULES.measureSide);
  const { data } = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
  return { width, height, gray, grayWidth: canvas.width, grayHeight: canvas.height };
}

/**
 * The photo as uploaded: at most uploadSide long, as a JPEG (quality 0.85).
 * Phone photos (3-8 MB) upload faster and fit the server's limit; a photo
 * already small enough is uploaded as it is.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  const { canvas, width, height } = await drawn(file, PHOTO_RULES.uploadSide);
  if (Math.max(width, height) <= PHOTO_RULES.uploadSide && file.size <= 4 * 1024 * 1024) return file;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
}
