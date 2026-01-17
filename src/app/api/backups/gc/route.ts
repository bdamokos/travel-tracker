import { NextRequest, NextResponse } from 'next/server';
import { backupService } from '@/app/lib/backupService';
import { isAdminDomain } from '@/app/lib/server-domains';

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

async function isGcAuthorized(request: NextRequest): Promise<boolean> {
  const token = request.headers.get('x-backup-gc-token') || '';
  const required = process.env.BACKUP_GC_TOKEN;
  if (required && token && token === required) return true;
  return isAdminDomain();
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await isGcAuthorized(request);
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      retentionDays?: number | string;
      keepLatest?: number | string;
      dryRun?: boolean;
    };

    const retentionDays =
      parsePositiveInt(body.retentionDays) ??
      parsePositiveInt(process.env.BACKUP_RETENTION_DAYS) ??
      30;

    const keepLatest =
      parsePositiveInt(body.keepLatest) ??
      parsePositiveInt(process.env.BACKUP_GC_KEEP_LATEST) ??
      20;

    const dryRun = Boolean(body.dryRun);

    const result = await backupService.garbageCollect({ retentionDays, keepLatest, dryRun });
    return NextResponse.json({
      success: true,
      retentionDays,
      keepLatest,
      dryRun,
      deletedCount: result.deleted.length,
      keptCount: result.kept.length,
      errors: result.errors,
      deleted: result.deleted
    });
  } catch (error) {
    console.error('Error garbage-collecting backups:', error);
    return NextResponse.json({ error: 'Failed to garbage-collect backups' }, { status: 500 });
  }
}

