import { RATE_LIMITS, errMsg } from '@wannasong/contract';
import { hasApiKey, searchYouTube } from '@/lib/youtube';
import { apiError, clientIp, rateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const { max, windowMs } = RATE_LIMITS.ytsearch;
  if (!rateLimit(`ytsearch:${ip}`, max, windowMs)) {
    return apiError('RATE_LIMITED', 429);
  }
  try {
    if (!hasApiKey()) return apiError('NO_API_KEY');
    const body = await req.json();
    const term = String(body.q || '').trim().slice(0, 100);
    if (!term) return NextResponse.json({ ok: true, results: [] });
    const results = await searchYouTube(term, 5);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code === 'NO_API_KEY' || code === 'QUOTA_EXCEEDED') return apiError(code);
    return NextResponse.json({ ok: false, error: errMsg(undefined) }, { status: 500 });
  }
}
