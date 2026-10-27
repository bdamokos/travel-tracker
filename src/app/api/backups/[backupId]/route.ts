import { NextRequest, NextResponse } from 'next/server';
import { backupService } from '@/app/lib/backupService';
import { restoreCostTrackingFromBackup, restoreTripFromBackup } from '@/app/lib/unifiedDataService';
import { isAdminDomain } from '@/app/lib/server-domains';
import { ConflictError, NotFoundError, ValidationError } from '@/app/lib/errors';

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

const TRIP_ID_PATTERN = /^[A-Za-z0-9]+$/;

function normalizeTripId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ backupId: string }> }) {
  try {
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 403 });
    }

    const { backupId } = await context.params;
    const backup = await backupService.getBackupById(backupId);
    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 404 });
    }

    const integrityOk = await backupService.verifyBackupIntegrity(backupId);
    return NextResponse.json({ backup, integrityOk }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching backup:', error);
    return NextResponse.json({ error: 'Failed to fetch backup' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ backupId: string }> }) {
  const isAdmin = await isAdminDomain();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 403 });
  }

  try {
    const { backupId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      restoreType?: 'trip' | 'cost';
      targetTripId?: string;
      overwrite?: boolean;
    };

    const restoreType = body.restoreType;
    const overwrite = Boolean(body.overwrite);
    const targetTripId = normalizeTripId(body.targetTripId);

    if (targetTripId && !TRIP_ID_PATTERN.test(targetTripId)) {
      return NextResponse.json({ error: 'Invalid targetTripId' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 400 });
    }

    if (restoreType === 'trip') {
      const restored = await restoreTripFromBackup(backupId, targetTripId || undefined, overwrite);
      return NextResponse.json({ success: true, restoredTripId: restored.id }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (restoreType === 'cost') {
      const restored = await restoreCostTrackingFromBackup(backupId, targetTripId || undefined, overwrite);
      return NextResponse.json({ success: true, restoredTripId: restored.id }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({ error: 'Invalid restoreType' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 400 });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message, conflict: true }, { headers: PRIVATE_NO_STORE_HEADERS, status: 409 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { headers: PRIVATE_NO_STORE_HEADERS, status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { headers: PRIVATE_NO_STORE_HEADERS, status: 400 });
    }

    console.error('Error restoring from backup:', error);
    return NextResponse.json({ error: 'Failed to restore from backup' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ backupId: string }> }) {
  try {
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 403 });
    }

    const { backupId } = await context.params;
    const result = await backupService.deleteBackup(backupId);

    if (!result.removedMetadata) {
      return NextResponse.json({ error: 'Backup not found' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 404 });
    }

    return NextResponse.json({ success: true, result }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error deleting backup:', error);
    return NextResponse.json({ error: 'Failed to delete backup' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 500 });
  }
}
