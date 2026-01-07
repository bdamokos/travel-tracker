import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData, saveUnifiedTripData } from '@/app/lib/unifiedDataService';
import { isAdminDomain } from '@/app/lib/server-domains';
import { TripUpdate } from '@/app/types';

const MAX_STORED_UPDATES = 100;
const UPDATE_ID_PREFIX = 'update';

const createUpdateId = () => `${UPDATE_ID_PREFIX}-${randomUUID()}`;

const parseIsoDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const normalizeMessage = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const unified = await loadUnifiedTripData(tripId);
    if (!unified) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    return NextResponse.json(
      { updates: unified.publicUpdates || [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[TripUpdatesAPI] GET error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const unified = await loadUnifiedTripData(tripId);
    if (!unified) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const payload = await request.json().catch(() => null);
    const message = normalizeMessage(payload?.message);
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const createdAt =
      payload?.createdAt === undefined ? new Date().toISOString() : parseIsoDate(payload.createdAt);
    if (!createdAt) {
      return NextResponse.json({ error: 'createdAt must be a valid ISO date' }, { status: 400 });
    }

    const update: TripUpdate = {
      id: createUpdateId(),
      createdAt,
      message,
      kind: payload?.kind === 'auto' ? 'auto' : 'manual'
    };

    const nextUpdates = [update, ...(unified.publicUpdates || [])].slice(0, MAX_STORED_UPDATES);
    await saveUnifiedTripData({
      ...unified,
      publicUpdates: nextUpdates,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ update }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[TripUpdatesAPI] POST error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const unified = await loadUnifiedTripData(tripId);
    if (!unified) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const payload = await request.json().catch(() => null);
    const updateId = typeof payload?.id === 'string' ? payload.id : null;
    if (!updateId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const normalizedMessage = payload?.message !== undefined ? normalizeMessage(payload.message) : null;
    if (payload?.message !== undefined && !normalizedMessage) {
      return NextResponse.json({ error: 'message must be a non-empty string' }, { status: 400 });
    }

    const normalizedCreatedAt = payload?.createdAt !== undefined ? parseIsoDate(payload.createdAt) : null;
    if (payload?.createdAt !== undefined && !normalizedCreatedAt) {
      return NextResponse.json({ error: 'createdAt must be a valid ISO date' }, { status: 400 });
    }

    const nextUpdates = (unified.publicUpdates || []).map(existing => {
      if (existing.id !== updateId) return existing;

      const messageChanged = normalizedMessage !== null && normalizedMessage !== existing.message;

      const nextKind =
        payload?.kind === 'auto' || payload?.kind === 'manual'
          ? payload.kind
          : messageChanged
            ? 'manual'
            : existing.kind;

      return {
        ...existing,
        ...(normalizedMessage !== null ? { message: normalizedMessage } : null),
        ...(normalizedCreatedAt !== null ? { createdAt: normalizedCreatedAt } : null),
        ...(nextKind ? { kind: nextKind } : null)
      };
    });

    const updated = nextUpdates.find(update => update.id === updateId);
    if (!updated) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    }

    await saveUnifiedTripData({
      ...unified,
      publicUpdates: nextUpdates.slice(0, MAX_STORED_UPDATES),
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ update: updated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[TripUpdatesAPI] PATCH error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updateId = new URL(request.url).searchParams.get('updateId');
    if (!updateId) {
      return NextResponse.json({ error: 'updateId is required' }, { status: 400 });
    }

    const unified = await loadUnifiedTripData(tripId);
    if (!unified) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const existingUpdates = unified.publicUpdates || [];
    const nextUpdates = existingUpdates.filter(update => update.id !== updateId);
    if (nextUpdates.length === existingUpdates.length) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    }

    await saveUnifiedTripData({
      ...unified,
      publicUpdates: nextUpdates,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[TripUpdatesAPI] DELETE error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
