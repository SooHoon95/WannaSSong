const KEY = process.env.YT_API_KEY || '';

export const hasApiKey = () => Boolean(KEY);

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoId(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (ID_RE.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return ID_RE.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v && ID_RE.test(v)) return v;
      const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export async function oembed(videoId: string) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  return {
    videoId,
    title: j.title as string,
    author: j.author_name as string,
    thumb: (j.thumbnail_url as string) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export async function searchYouTube(q: string, max = 5) {
  if (!KEY) throw new Error('NO_API_KEY');
  const p = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    videoEmbeddable: 'true',
    maxResults: String(max),
    q,
    key: KEY,
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${p}`);
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 403 && body.includes('quotaExceeded')) throw new Error('QUOTA_EXCEEDED');
    throw new Error(`YT_SEARCH_${r.status}`);
  }
  const j = await r.json();
  return (j.items || []).map((it: { id: { videoId: string }; snippet: Record<string, unknown> }) => ({
    videoId: it.id.videoId,
    title: decodeEntities(String(it.snippet.title)),
    author: String(it.snippet.channelTitle),
    thumb:
      (it.snippet.thumbnails as { medium?: { url?: string }; default?: { url?: string } })?.medium?.url ||
      (it.snippet.thumbnails as { default?: { url?: string } })?.default?.url,
  }));
}

function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
