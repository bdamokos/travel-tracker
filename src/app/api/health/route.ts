import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    {
      headers: {
        // Health must never be cached
        'Cache-Control': 'no-store'
      }
    }
  );
}