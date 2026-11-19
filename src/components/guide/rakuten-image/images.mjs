// Rakuten's official example images for the image guideline. They sit behind an RMS redirect and
// belong to Rakuten, so they are not committed to this (public) repository: the page asks
// /api/guide/rakuten-image/<name>, which fetches each one from Rakuten once and keeps a copy in the
// config directory. Only these names can be requested.
export const GUIDE_IMAGES = [
  "10_128_01.jpg",
  "10_128_02.jpg",
  "10_128_03.jpg",
  "10_128_04.jpg",
  "10_128_05.jpg",
  "10_128_06.jpg",
  "10_128_07.jpg",
  "10_128_08.jpg",
  "10_128_09.jpg",
];

const UPSTREAM_BASE = "https://www.rakuten.co.jp/shops/manual/navi3/rule/guide/img/";

export function isGuideImage(name) {
  return GUIDE_IMAGES.includes(name);
}

export function upstreamImageUrl(name) {
  if (!isGuideImage(name)) throw new Error(`unknown guide image: ${name}`);
  return `${UPSTREAM_BASE}${name}`;
}

export function guideImageSrc(name) {
  if (!isGuideImage(name)) throw new Error(`unknown guide image: ${name}`);
  return `/api/guide/rakuten-image/${name}`;
}

// A real JPEG starts FF D8 FF; anything else (a login page, an error page) is never cached.
export function looksLikeJpeg(bytes) {
  return Boolean(bytes && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff);
}
