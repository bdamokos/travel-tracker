import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { get } from 'http';
import { buildMixedJourneyPrivacyFixture } from '@/app/__tests__/utils/mixedJourneyPrivacyFixture';

describe('public mixed journey privacy over HTTP', () => {
  it.each([false, true])('filters persisted sibling collections with populated days=%s', async (populatedDays) => {
    const dataDir = process.env.TEST_DATA_DIR;
    const baseUrl = process.env.TEST_API_BASE_URL;
    if (!dataDir || !baseUrl) throw new Error('Isolated integration server and TEST_DATA_DIR are required');

    const trip = buildMixedJourneyPrivacyFixture(populatedDays);
    trip.id = `privacymixed${populatedDays}`;
    const path = join(dataDir, `trip-${trip.id}.json`);
    await writeFile(path, JSON.stringify(trip));
    try {
      // Use node:http so the Host header reaches Next unchanged on all Node versions.
      const readTrip = (host: string): Promise<{ status?: number; cacheControl?: string; body: string }> =>
        new Promise((resolve, reject) => {
          get(`${baseUrl}/api/travel-data?id=${trip.id}`, { headers: { host } }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => { body += chunk; });
            response.on('end', () => resolve({
              status: response.statusCode, cacheControl: response.headers['cache-control'], body,
            }));
            response.on('error', reject);
          }).on('error', reject);
        });
      const response = await readTrip('public.example.test');
      const publicData = JSON.parse(response.body);
      expect(response.status).toBe(200);
      expect(JSON.stringify(publicData)).not.toContain('secret-');
      expect(JSON.stringify(publicData)).not.toMatch(/costTrackingLinks|privateNotes|accommodationIds|isAccommodationPublic|isReadOnly/);
      expect(publicData.locations[1].accommodationData).toBe('Public stay details');
      expect(publicData.routes[0].routePoints).toEqual([[50, 4], [51, 5]]);
      expect(publicData.days).toHaveLength(populatedDays ? 1 : 0);

      const adminResponse = await readTrip(new URL(baseUrl).host);
      const adminData = JSON.parse(adminResponse.body);
      expect(adminResponse.status).toBe(200);
      expect(adminResponse.cacheControl).toBe('no-store');
      expect(adminData.routes[0].privateNotes).toBe('secret-route-note');
      expect(adminData.locations[0].accommodationIds).toEqual(['secret-accommodation-id']);
    } finally {
      await unlink(path);
    }
  });
});
