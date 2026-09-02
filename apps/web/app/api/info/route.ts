import { lanUrls, VERSION } from '@/lib/env';
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    lanUrls: lanUrls(),
    port: Number(process.env.PORT) || 3000,
    version: VERSION,
    publicUrl: process.env.PUBLIC_URL || '',
  });
}
