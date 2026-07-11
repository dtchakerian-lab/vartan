/**
 * iTunes Search API cover-art fallback. No key required.
 * Every failure path resolves to null — the UI never sees an error.
 */
export async function fetchITunesArt(
  artist: string,
  title: string,
): Promise<string | null> {
  if (!artist && !title) return null;
  try {
    const term = encodeURIComponent(`${artist} ${title}`.trim());
    const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const art: string | undefined = json?.results?.[0]?.artworkUrl100;
    if (!art) return null;
    return art.replace('100x100', '600x600');
  } catch {
    return null;
  }
}

/**
 * Load an image URL into an HTMLImageElement, tolerating CORS failures.
 * Returns null if the image can't be used as a WebGL texture.
 */
export function loadArtImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}
