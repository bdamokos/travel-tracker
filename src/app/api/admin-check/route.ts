import { NextResponse } from 'next/server';
import { isAdminDomain } from '@/app/lib/server-domains';

export async function GET() {
  try {
    const isAdmin = await isAdminDomain();
    
    if (isAdmin) {
      return NextResponse.json({ authorized: true });
    } else {
      return NextResponse.json({ authorized: false }, { status: 403 });
    }
  } catch (error) {
    console.error('Error checking admin domain:', error);
    return NextResponse.json({ authorized: false }, { status: 500 });
  }
} 