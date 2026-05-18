import { NextResponse } from 'next/server';
import { isAdminDomain } from '@/app/lib/server-domains';

export async function requireAdminDomain(): Promise<NextResponse<{ error: string }> | null> {
  const isAdmin = await isAdminDomain();
  if (isAdmin) return null;
  return NextResponse.json({ error: 'Admin domain required' }, { status: 403 });
}
