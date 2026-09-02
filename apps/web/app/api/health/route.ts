import { getHeartbeat } from '@/lib/kv';
import { NextResponse } from 'next/server';

export async function GET() {
  const heartbeat = await getHeartbeat();
  return NextResponse.json({
    ok: true,
    speakerOnline: heartbeat?.speakerOnline ?? false,
  });
}
