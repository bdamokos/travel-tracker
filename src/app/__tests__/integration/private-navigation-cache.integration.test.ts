import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { request as httpRequest } from 'http';
import { CURRENT_SCHEMA_VERSION } from '@/app/lib/dataMigration';

const baseUrl = process.env.TEST_API_BASE_URL;
const dataDir = process.env.TEST_DATA_DIR;
if (!baseUrl || !dataDir) throw new Error('Isolated integration server and TEST_DATA_DIR are required');

const tripId = 'privateNavigationFixture';
const accommodation = {
  id: 'acc-fixture', name: 'Synthetic private hotel', locationId: 'location-fixture',
  accommodationData: 'Synthetic reservation', isAccommodationPublic: false,
  costTrackingLinks: [{ expenseId: 'expense-fixture' }], createdAt: '2026-01-01T00:00:00Z'
};
const paths = [
  `/admin/api/accommodations?tripId=${tripId}`,
  `/admin/api/accommodations/acc-fixture?tripId=${tripId}`,
  `/api/travel-data/${tripId}/expense-links`
];

describe('private API navigation HTTP cache policy', () => {
  beforeAll(async () => {
    await writeFile(join(dataDir, `trip-${tripId}.json`), JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION, id: tripId, title: 'Synthetic cache regression',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      accommodations: [accommodation], travelData: { locations: [], routes: [] },
      costData: { expenses: [{ id: 'expense-fixture' }] }
    }));
  });

  afterAll(async () => { await unlink(join(dataDir, `trip-${tripId}.json`)); });

  it.each(paths)('protects online navigation to %s', async (pathname) => {
    const response = await fetch(`${baseUrl}${pathname}`, { headers: { 'Sec-Fetch-Mode': 'navigate' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    if (pathname.includes('/expense-links')) {
      expect(body).toEqual([{
        expenseId: 'expense-fixture', travelItemId: 'acc-fixture',
        travelItemName: accommodation.name, travelItemType: 'accommodation'
      }]);
    } else {
      expect(body).toEqual(pathname.includes('/acc-fixture?') ? accommodation : [accommodation]);
    }
  });

  it.each(paths)('protects authorization failures for %s', async (pathname) => {
    // Use node:http so the synthetic Host is sent literally, independently of fetch normalization.
    const response = await new Promise<{ status: number | undefined; cacheControl: string | undefined; body: string }>((resolve, reject) => {
      const req = httpRequest(`${baseUrl}${pathname}`, { headers: { Host: 'public.example.test' } }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, cacheControl: res.headers['cache-control'], body }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
    expect(response.status).toBe(403);
    expect(response.cacheControl).toBe('private, no-store');
    expect(response.body).not.toContain('Synthetic private hotel');
  });

  it.each([
    '/admin/api/accommodations',
    '/admin/api/accommodations/missing?tripId=missingFixture',
    '/api/travel-data/missingFixture/expense-links'
  ])('protects invalid or missing records for %s', async (pathname) => {
    const response = await fetch(`${baseUrl}${pathname}`);
    expect([400, 404]).toContain(response.status);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
