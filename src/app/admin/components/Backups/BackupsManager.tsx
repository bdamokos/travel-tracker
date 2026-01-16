'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate } from '@/app/lib/costUtils';

type BackupType = 'trip' | 'cost';

type BackupMetadata = {
  id: string;
  originalId: string;
  type: BackupType;
  title: string;
  deletedAt: string;
  filePath: string;
  fileSize: number;
  checksum: string;
  deletionReason?: string;
  backupVersion: string;
};

type StorageStats = {
  totalSize: number;
  totalCount: number;
  averageSize: number;
  oldestBackup?: string;
  newestBackup?: string;
  typeBreakdown: {
    trip: { count: number; size: number };
    cost: { count: number; size: number };
  };
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function generateSafeTripId(): string {
  return `restored${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
}

export default function BackupsManager() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [stats, setStats] = useState<StorageStats | null>(null);

  const [typeFilter, setTypeFilter] = useState<'all' | BackupType>('all');
  const [query, setQuery] = useState('');

  const [gcRetentionDays, setGcRetentionDays] = useState(30);
  const [gcKeepLatest, setGcKeepLatest] = useState(20);
  const [gcDryRun, setGcDryRun] = useState(true);
  const [gcRunning, setGcRunning] = useState(false);

  const filteredBackups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return backups.filter((b) => {
      if (typeFilter !== 'all' && b.type !== typeFilter) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.originalId.toLowerCase().includes(q) ||
        (b.deletionReason || '').toLowerCase().includes(q)
      );
    });
  }, [backups, query, typeFilter]);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/backups');
      if (!response.ok) {
        throw new Error(`Failed to load backups (${response.status})`);
      }
      const data = (await response.json()) as { backups: BackupMetadata[]; stats: StorageStats };
      setBackups(Array.isArray(data.backups) ? data.backups : []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const synchronize = async () => {
    try {
      const response = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'synchronize' })
      });
      if (!response.ok) {
        throw new Error(`Failed to synchronize (${response.status})`);
      }
      await loadBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteBackup = async (backupId: string) => {
    const ok = window.confirm('Delete this backup file? This cannot be undone.');
    if (!ok) return;
    try {
      const response = await fetch(`/api/backups/${encodeURIComponent(backupId)}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`Failed to delete backup (${response.status})`);
      }
      await loadBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const restoreBackup = async (backup: BackupMetadata) => {
    const isTrip = backup.type === 'trip';
    const defaultTarget = backup.originalId;

    const action = isTrip
      ? window.confirm(`Restore deleted trip "${backup.title}" to ID "${defaultTarget}"?`)
      : window.confirm(`Restore deleted cost tracker for "${backup.title}" back into trip "${defaultTarget}"?`);

    if (!action) return;

    const doRestore = async (targetTripId: string | undefined, overwrite: boolean) => {
      const response = await fetch(`/api/backups/${encodeURIComponent(backup.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restoreType: backup.type,
          targetTripId,
          overwrite
        })
      });
      return response;
    };

    try {
      let response = await doRestore(undefined, false);
      if (response.status === 409) {
        if (backup.type === 'trip') {
          const overwrite = window.confirm(
            'A trip with this ID already exists. Click OK to overwrite it, or Cancel to restore as a new copy.'
          );
          if (overwrite) {
            response = await doRestore(undefined, true);
          } else {
            const newId = generateSafeTripId();
            response = await doRestore(newId, false);
          }
        } else {
          const overwrite = window.confirm('This trip already has cost tracking data. Overwrite it?');
          if (!overwrite) return;
          response = await doRestore(undefined, true);
        }
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Restore failed (${response.status})`);
      }

      await loadBackups();
      window.alert('Restore completed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runGc = async () => {
    setGcRunning(true);
    setError(null);
    try {
      const response = await fetch('/api/backups/gc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retentionDays: gcRetentionDays,
          keepLatest: gcKeepLatest,
          dryRun: gcDryRun
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `GC failed (${response.status})`);
      }
      const payload = (await response.json()) as { deletedCount: number; dryRun: boolean };
      await loadBackups();
      window.alert(`${payload.dryRun ? 'Dry run' : 'Cleanup'} complete. Deleted: ${payload.deletedCount}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGcRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Backups</h2>
        <div className="flex gap-2">
          <button
            onClick={loadBackups}
            disabled={loading}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={synchronize}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Sync metadata
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Stored backups</div>
            <div className="text-xl font-semibold text-gray-900 dark:text-white">{stats.totalCount}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Total size</div>
            <div className="text-xl font-semibold text-gray-900 dark:text-white">{formatBytes(stats.totalSize)}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Oldest / newest</div>
            <div className="text-sm text-gray-900 dark:text-white">
              {stats.oldestBackup ? formatDate(stats.oldestBackup) : '—'} / {stats.newestBackup ? formatDate(stats.newestBackup) : '—'}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="Title, trip ID, reason…"
            />
          </div>
          <div className="w-full md:w-56">
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | BackupType)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            >
              <option value="all">All</option>
              <option value="trip">Trips</option>
              <option value="cost">Cost trackers</option>
            </select>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-end">
            <div className="w-full md:w-48">
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Retention (days)</label>
              <input
                type="number"
                min={0}
                value={gcRetentionDays}
                onChange={(e) => setGcRetentionDays(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <div className="w-full md:w-48">
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Keep latest</label>
              <input
                type="number"
                min={0}
                value={gcKeepLatest}
                onChange={(e) => setGcKeepLatest(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={gcDryRun}
                onChange={(e) => setGcDryRun(e.target.checked)}
                className="h-4 w-4"
              />
              Dry run
            </label>
            <button
              onClick={runGc}
              disabled={gcRunning}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
            >
              {gcRunning ? 'Running…' : 'Run cleanup'}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Deletes backups older than the retention window, while keeping at least the newest N backups.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading backups...</p>
        </div>
      ) : filteredBackups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No backups found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBackups.map((backup) => (
            <div
              key={backup.id}
              className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${backup.type === 'trip' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200'}`}>
                    {backup.type === 'trip' ? 'Trip' : 'Cost'}
                  </span>
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{backup.title}</h3>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  <span className="mr-3">Trip ID: <span className="font-mono">{backup.originalId}</span></span>
                  <span>Deleted: {formatDate(backup.deletedAt)}</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Size: {formatBytes(backup.fileSize)}{backup.deletionReason ? ` · Reason: ${backup.deletionReason}` : ''}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => restoreBackup(backup)}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  Restore
                </button>
                <button
                  onClick={() => deleteBackup(backup.id)}
                  className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                >
                  Delete backup
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

