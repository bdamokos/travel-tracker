/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET as getShadowTrip } from '@/app/api/shadow-trips/[tripId]/route';
import { GET as getBackups } from '@/app/api/backups/route';
import { GET as getBackup } from '@/app/api/backups/[backupId]/route';
import { isAdminDomain, isAdminHost } from '@/app/lib/server-domains';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { backupService } from '@/app/lib/backupService';

jest.mock('@/app/lib/dataDirectory', () => ({ getDataDir: () => '/synthetic-test-data' }));
jest.mock('fs', () => ({ existsSync: jest.fn(() => true) }));
jest.mock('fs/promises', () => ({
  readFile: jest.fn(async () => '{}'),
  writeFile: jest.fn(async () => undefined),
  mkdir: jest.fn(async () => undefined),
}));
jest.mock('@/app/lib/server-domains', () => ({ isAdminDomain: jest.fn(), isAdminHost: jest.fn() }));
jest.mock('@/app/lib/unifiedDataService', () => ({ loadUnifiedTripData: jest.fn() }));
jest.mock('@/app/lib/backupService', () => ({
  backupService: {
    listBackups: jest.fn(),
    getStorageStats: jest.fn(),
    getBackupById: jest.fn(),
    verifyBackupIntegrity: jest.fn(),
  }
}));

const trip = { id: 'trip-1', costData: { ynabConfig: { apiKey: 'synthetic-fixture-only' } } };
const backup = { id: 'backup-1', tripName: 'Synthetic private trip' };
const stats = { totalSize: 123 };
const routes = [
  {
    name: 'shadow trip',
    call: () => getShadowTrip(new NextRequest('https://admin.example.test/api/shadow-trips/trip-1'), {
      params: Promise.resolve({ tripId: 'trip-1' })
    }),
    fail: () => jest.mocked(loadUnifiedTripData).mockRejectedValueOnce(new Error('synthetic failure')),
  },
  {
    name: 'backup list',
    call: () => getBackups(new NextRequest('https://admin.example.test/api/backups?type=trip&q=synthetic')),
    fail: () => jest.mocked(backupService.listBackups).mockRejectedValueOnce(new Error('synthetic failure')),
  },
  {
    name: 'backup detail',
    call: () => getBackup(new NextRequest('https://admin.example.test/api/backups/backup-1'), {
      params: Promise.resolve({ backupId: 'backup-1' })
    }),
    fail: () => jest.mocked(backupService.getBackupById).mockRejectedValueOnce(new Error('synthetic failure')),
  },
];

describe('private shadow and backup API cache headers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(isAdminDomain).mockResolvedValue(true);
    jest.mocked(isAdminHost).mockReturnValue(true);
    // The runtime handlers only need these fixture fields; storage is entirely mocked.
    jest.mocked(loadUnifiedTripData).mockResolvedValue(trip as Awaited<ReturnType<typeof loadUnifiedTripData>>);
    jest.mocked(backupService.listBackups).mockResolvedValue([backup] as Awaited<ReturnType<typeof backupService.listBackups>>);
    jest.mocked(backupService.getStorageStats).mockResolvedValue(stats as Awaited<ReturnType<typeof backupService.getStorageStats>>);
    jest.mocked(backupService.getBackupById).mockResolvedValue(backup as Awaited<ReturnType<typeof backupService.getBackupById>>);
    jest.mocked(backupService.verifyBackupIntegrity).mockResolvedValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(routes)('keeps $name successful payloads available online with no-store', async ({ call }) => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    if (call === routes[0].call) {
      expect(body).toMatchObject({ ...trip, shadowData: { shadowLocations: [], shadowRoutes: [], shadowAccommodations: [] } });
    } else if (call === routes[1].call) {
      expect(body).toEqual({ backups: [backup], stats });
      expect(backupService.listBackups).toHaveBeenCalledWith({
        type: 'trip', dateFrom: undefined, dateTo: undefined, searchQuery: 'synthetic'
      });
    } else {
      expect(body).toEqual({ backup, integrityOk: true });
    }
  });

  it.each(routes)('keeps $name authorization failures private', async ({ call }) => {
    jest.mocked(isAdminDomain).mockResolvedValue(false);
    jest.mocked(isAdminHost).mockReturnValue(false);
    const response = await call();
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(loadUnifiedTripData).not.toHaveBeenCalled();
    expect(backupService.listBackups).not.toHaveBeenCalled();
    expect(backupService.getBackupById).not.toHaveBeenCalled();
  });

  it.each(routes)('keeps $name server errors private', async ({ call, fail }) => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fail();
    const response = await call();
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it.each([routes[0], routes[2]])('keeps $name missing records private', async ({ call }) => {
    jest.mocked(loadUnifiedTripData).mockResolvedValue(null);
    jest.mocked(backupService.getBackupById).mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
