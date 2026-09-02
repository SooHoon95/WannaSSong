import type { ItunesResult } from '@wannasong/contract';

export async function itunesSearch(term: string, limit = 8): Promise<ItunesResult[]> {
  const p = new URLSearchParams({
    term,
    country: 'KR',
    media: 'music',
    entity: 'song',
    limit: String(limit),
  });
  const r = await fetch(`https://itunes.apple.com/search?${p}`);
  if (!r.ok) throw new Error(`ITUNES_${r.status}`);
  const j = await r.json();
  const seen = new Set<string>();
  return (j.results || [])
    .filter((t: { artistName: string; trackName: string }) => {
      const k = `${t.artistName}|${t.trackName}`.toLowerCase();
      return !seen.has(k) && seen.add(k);
    })
    .map(
      (t: {
        artistName: string;
        trackName: string;
        collectionName?: string;
        artworkUrl100?: string;
        trackTimeMillis?: number;
      }) => ({
        artist: t.artistName,
        title: t.trackName,
        album: t.collectionName,
        artwork: t.artworkUrl100,
        durationMs: t.trackTimeMillis,
      }),
    );
}
