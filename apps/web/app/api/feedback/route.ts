import { getFeedback } from '@/lib/kv';
import { speakerKey } from '@/lib/env';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || '';
  const required = speakerKey();
  if (required && key !== required) {
    return NextResponse.json({ error: 'key required' }, { status: 401 });
  }
  const list = await getFeedback();
  return NextResponse.json(list.map(({ id, text, at }) => ({ id, text, at })));
}
