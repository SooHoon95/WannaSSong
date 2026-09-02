import { RATE_LIMITS, errMsg } from '@wannasong/contract';
import { itunesSearch } from '@/lib/itunes';
import { apiError, clientIp, rateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const { max, windowMs } = RATE_LIMITS.suggest;
  if (!rateLimit(`suggest:${ip}`, max, windowMs)) {
    return apiError('RATE_LIMITED', 429);
  }
  try {
    const body = await req.json();
    const term = String(body.q || '').trim().slice(0, 100);
    if (term.length < 1) return NextResponse.json({ ok: true, results: [] });
    const results = await itunesSearch(term, 8);
    return NextResponse.json({ ok: true, results });
  } catch {
    return NextResponse.json({ ok: false, error: errMsg(undefined) }, { status: 500 });
  }
}
