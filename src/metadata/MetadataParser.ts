export interface TrackMeta {
  title: string;
  artist: string;
  genreHint?: string;
  /** Object URL of embedded cover art, if present. */
  embeddedArtUrl?: string;
}

/**
 * ID3/metadata via music-metadata (dynamic import keeps it out of the
 * critical path). Any failure returns filename-derived metadata.
 */
export async function parseTrackMeta(file: File): Promise<TrackMeta> {
  const fallback: TrackMeta = {
    title: file.name.replace(/\.[a-z0-9]+$/i, ''),
    artist: '',
  };

  try {
    const mm = await import('music-metadata');
    const meta = await mm.parseBlob(file, { duration: false });

    const title = meta.common.title?.trim() || fallback.title;
    const artist = meta.common.artist?.trim() || '';
    const genreHint = meta.common.genre?.[0];

    let embeddedArtUrl: string | undefined;
    const pic = meta.common.picture?.[0];
    if (pic && pic.data.length > 0) {
      const blob = new Blob([new Uint8Array(pic.data)], {
        type: pic.format || 'image/jpeg',
      });
      embeddedArtUrl = URL.createObjectURL(blob);
    }

    return { title, artist, genreHint, embeddedArtUrl };
  } catch {
    return fallback;
  }
}
