import type { ItunesResult } from '@wannasong/contract';

type ItunesTrack = {
  artistName: string;
  trackName: string;
  collectionName?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
};

function mapResults(results: ItunesTrack[]): ItunesResult[] {
  const seen = new Set<string>();
  return results
    .filter((t) => {
      const k = `${t.artistName}|${t.trackName}`.toLowerCase();
      return !seen.has(k) && seen.add(k);
    })
    .map((t) => ({
      artist: t.artistName,
      title: t.trackName,
      album: t.collectionName,
      artwork: t.artworkUrl100,
      durationMs: t.trackTimeMillis,
    }));
}

async function fetchItunes(term: string, limit: number, country?: string): Promise<ItunesResult[]> {
  const p = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: String(limit),
  });
  if (country) p.set('country', country);
  const r = await fetch(`https://itunes.apple.com/search?${p}`);
  if (!r.ok) throw new Error(`ITUNES_${r.status}`);
  const j = await r.json();
  return mapResults(j.results || []);
}

export async function itunesSearch(term: string, limit = 8): Promise<ItunesResult[]> {
  // KR storefront가 빈 결과를 주는 경우가 있어 US로 폴백
  const kr = await fetchItunes(term, limit, 'KR');
  if (kr.length) return kr;
  return fetchItunes(term, limit, 'US');
}
