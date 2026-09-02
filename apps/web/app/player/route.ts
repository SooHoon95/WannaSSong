import { NextRequest, NextResponse } from 'next/server';

export function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const url = key ? `/?key=${encodeURIComponent(key)}` : '/';
  return NextResponse.redirect(new URL(url, req.url));
}
