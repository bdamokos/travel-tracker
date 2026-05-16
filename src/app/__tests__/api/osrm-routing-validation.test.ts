/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/routing/osrm/route';

const buildRequest = (query: string): NextRequest =>
  new NextRequest(`http://localhost/api/routing/osrm?${query}`);

describe('OSRM routing proxy validation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects profiles outside the server allowlist', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await GET(buildRequest(
      'profile=http://127.0.0.1&fromLat=51.5&fromLng=-0.1&toLat=48.8&toLng=2.3'
    ));

    await expect(response.json()).resolves.toEqual({ error: 'Invalid profile' });
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects partially numeric coordinate values', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await GET(buildRequest(
      'profile=car&fromLat=51.5abc&fromLng=-0.1&toLat=48.8&toLng=2.3'
    ));

    await expect(response.json()).resolves.toEqual({ error: 'Invalid coordinates' });
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('builds upstream URLs from validated server-owned profile values', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ routes: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await GET(buildRequest(
      'profile=bike&fromLat=51.5&fromLng=-0.1&toLat=48.8&toLng=2.3'
    ));

    await expect(response.json()).resolves.toEqual({ routes: [] });
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://router.project-osrm.org/route/v1/bike/-0.1,51.5;2.3,48.8?overview=full&geometries=geojson',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
    );
  });
});
