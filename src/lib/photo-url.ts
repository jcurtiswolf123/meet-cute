// The same photo, narrowed to what the layout actually paints.
//
// Every surface drew the stored image: a 28px avatar in the directory, a 96px
// thumbnail on a profile, and a tile on the applicant wall all pulled the same
// file, and uploads are normalized to 1600px webp. One roster page was a few
// hundred kilobytes of face per row, and the applicant wall asked for two dozen
// of them at once. The bytes are the cost, not the round trip.
//
// The route serves a resized copy for an allowlisted width and caches it, so
// this is only ever a hint about how large the image will be drawn.

export const PHOTO_WIDTHS = [96, 192, 384, 768] as const;
export type PhotoWidth = (typeof PHOTO_WIDTHS)[number];

export function isPhotoWidth(value: number): value is PhotoWidth {
  return (PHOTO_WIDTHS as readonly number[]).includes(value);
}

/** The smallest allowlisted width that still covers a retina draw at `size`. */
export function widthFor(size: number): PhotoWidth {
  const wanted = size * 2;
  return PHOTO_WIDTHS.find((w) => w >= wanted) ?? PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1];
}

/**
 * `url` with a width hint, when it is one of our own proxied photos. Anything
 * else (an absolute object-store URL, an empty value) is returned untouched.
 */
export function photoAt(url: string, width: PhotoWidth): string {
  if (!url.startsWith("/api/photos/")) return url;
  return `${url}?w=${width}`;
}
