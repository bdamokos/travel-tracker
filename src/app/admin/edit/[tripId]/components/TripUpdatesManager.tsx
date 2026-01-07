'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TripUpdate } from '@/app/types';

type TripUpdatesManagerProps = {
  tripId?: string | null;
};

const toDateTimeLocalValue = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (part: number) => part.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const sortByCreatedAtDesc = (updates: TripUpdate[]) =>
  [...updates].sort((a, b) => {
    const aDate = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
    const bDate = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
    const aMs = Number.isNaN(aDate.getTime()) ? 0 : aDate.getTime();
    const bMs = Number.isNaN(bDate.getTime()) ? 0 : bDate.getTime();
    return bMs - aMs;
  });

type UpdateRowProps = {
  update: TripUpdate;
  onSave: (payload: { id: string; message: string; createdAt: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function UpdateRow({ update, onSave, onDelete }: UpdateRowProps) {
  const [message, setMessage] = useState(update.message);
  const [createdAt, setCreatedAt] = useState(toDateTimeLocalValue(update.createdAt));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baselineCreatedAt = useMemo(() => toDateTimeLocalValue(update.createdAt), [update.createdAt]);
  const isDirty = message !== update.message || createdAt !== baselineCreatedAt;

  useEffect(() => {
    setMessage(update.message);
    setCreatedAt(baselineCreatedAt);
    setError(null);
  }, [baselineCreatedAt, update.message]);

  const handleSave = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError('Message cannot be empty.');
      return;
    }
    if (!createdAt) {
      setError('Created at is required.');
      return;
    }
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) {
      setError('Created at is invalid.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave({ id: update.id, message: trimmed, createdAt: parsed.toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save update.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onDelete(update.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete update.');
      setIsSaving(false);
    }
  };

  return (
    <li className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Created at
            </label>
            <input
              type="datetime-local"
              value={createdAt}
              onChange={(e) => setCreatedAt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {update.kind === 'manual' ? 'Manual' : 'Auto'} • ID: {update.id}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSaving}
              className="px-3 py-2 rounded-md border border-red-300 dark:border-red-700 text-red-700 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function TripUpdatesManager({ tripId }: TripUpdatesManagerProps) {
  const effectiveTripId = tripId && tripId !== 'new' ? tripId : null;
  const [updates, setUpdates] = useState<TripUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [newCreatedAt, setNewCreatedAt] = useState(() => toDateTimeLocalValue(new Date().toISOString()));

  const sortedUpdates = useMemo(() => sortByCreatedAtDesc(updates), [updates]);

  const loadUpdates = useCallback(async () => {
    if (!effectiveTripId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/travel-data/${effectiveTripId}/updates`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load updates (${response.status})`);
      }
      const data = (await response.json()) as { updates?: TripUpdate[] };
      setUpdates(Array.isArray(data.updates) ? data.updates : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load updates.');
    } finally {
      setLoading(false);
    }
  }, [effectiveTripId]);

  useEffect(() => {
    void loadUpdates();
  }, [loadUpdates]);

  const saveUpdate = useCallback(
    async (payload: { id: string; message: string; createdAt: string }) => {
      if (!effectiveTripId) return;
      const response = await fetch(`/api/travel-data/${effectiveTripId}/updates`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, kind: 'manual' })
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Failed to save update (${response.status})`);
      }
      const data = (await response.json()) as { update?: TripUpdate };
      if (!data.update) {
        throw new Error('Server did not return updated update.');
      }
      setUpdates(prev => prev.map(existing => (existing.id === data.update?.id ? data.update : existing)));
    },
    [effectiveTripId]
  );

  const deleteUpdate = useCallback(
    async (id: string) => {
      if (!effectiveTripId) return;
      const response = await fetch(`/api/travel-data/${effectiveTripId}/updates?updateId=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Failed to delete update (${response.status})`);
      }
      setUpdates(prev => prev.filter(update => update.id !== id));
    },
    [effectiveTripId]
  );

  const addUpdate = useCallback(async () => {
    if (!effectiveTripId) return;
    const trimmed = newMessage.trim();
    if (!trimmed) {
      setError('New update message cannot be empty.');
      return;
    }
    if (!newCreatedAt) {
      setError('New update created-at is required.');
      return;
    }
    const parsed = new Date(newCreatedAt);
    if (Number.isNaN(parsed.getTime())) {
      setError('New update created-at is invalid.');
      return;
    }

    setAdding(true);
    setError(null);
    try {
      const response = await fetch(`/api/travel-data/${effectiveTripId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          createdAt: parsed.toISOString(),
          kind: 'manual'
        })
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Failed to add update (${response.status})`);
      }
      const data = (await response.json()) as { update?: TripUpdate };
      if (!data.update) {
        throw new Error('Server did not return created update.');
      }
      setUpdates(prev => [data.update as TripUpdate, ...prev]);
      setNewMessage('');
      setNewCreatedAt(toDateTimeLocalValue(new Date().toISOString()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add update.');
    } finally {
      setAdding(false);
    }
  }, [effectiveTripId, newCreatedAt, newMessage]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Public Updates Feed</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Manage the “Latest updates” shown on the map and calendar. Manual edits mark the entry as manual so it stays visible.
          </p>
        </div>
        <button
          type="button"
          onClick={loadUpdates}
          disabled={!effectiveTripId || loading}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!effectiveTripId && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
          Save the trip first to edit its public updates.
        </div>
      )}

      {effectiveTripId && (
        <>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 p-4">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Add update</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Created at
                </label>
                <input
                  type="datetime-local"
                  value={newCreatedAt}
                  onChange={(e) => setNewCreatedAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  disabled={adding}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Message
                </label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  disabled={adding}
                  placeholder="e.g. We’ve just updated the itinerary!"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={addUpdate}
                disabled={adding}
                className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {adding ? 'Adding…' : 'Add update'}
              </button>
            </div>
          </div>

          {sortedUpdates.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No updates yet.</p>
          ) : (
            <ul className="space-y-3">
              {sortedUpdates.map(update => (
                <UpdateRow key={update.id} update={update} onSave={saveUpdate} onDelete={deleteUpdate} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
