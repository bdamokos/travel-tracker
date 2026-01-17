import { NextRequest, NextResponse } from 'next/server';
import { backupService } from '@/app/lib/backupService';
import { isAdminDomain } from '@/app/lib/server-domains';

export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const searchQuery = searchParams.get('q') || undefined;

    const type = typeParam === 'trip' || typeParam === 'cost' ? typeParam : undefined;

    const [backups, stats] = await Promise.all([
      backupService.listBackups({ type, dateFrom, dateTo, searchQuery }),
      backupService.getStorageStats()
    ]);

    return NextResponse.json({ backups, stats });
  } catch (error) {
    console.error('Error listing backups:', error);
    return NextResponse.json({ error: 'Failed to list backups' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { action?: string };

    if (body.action === 'synchronize') {
      const result = await backupService.synchronizeMetadata();
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing backups action:', error);
    return NextResponse.json({ error: 'Failed to process backups action' }, { status: 500 });
  }
}

