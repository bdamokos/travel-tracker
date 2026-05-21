/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/routing/osrm/route';

const buildRequest = (query: string): NextRequest =>
  new NextRequest(`http://localhost/api/routing/osrm?${query}`, {
    headers: { host: 'localhost' }
  });

describe('OSRM routing proxy validation', () => {
  const originalAdminDomain = process.env.ADMIN_DOMAIN;
  const originalAdminProxySecret = process.env.ADMIN_PROXY_SECRET;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalAdminDomain === undefined) {
      delete process.env.ADMIN_DOMAIN;
    } else {
      process.env.ADMIN_DOMAIN = originalAdminDomain;
    }
    if (originalAdminProxySecret === undefined) {
      delete process.env.ADMIN_PROXY_SECRET;
    } else {
      process.env.ADMIN_PROXY_SECRET = originalAdminProxySecret;
    }
  });

  it('rejects requests outside the admin domain before proxying upstream', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await GET(
      new NextRequest(
        'https://public.example.test/api/routing/osrm?profile=car&fromLat=51.5&fromLng=-0.1&toLat=48.8&toLng=2.3',
        { headers: { host: 'public.example.test' } }
      )
    );

    await expect(response.json()).resolves.toEqual({ error: 'Admin domain required' });
    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not trust forwarded admin hosts from public hosts', async () => {
    process.env.ADMIN_DOMAIN = 'admin.example.test';
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await GET(
      new NextRequest(
        'https://public.example.test/api/routing/osrm?profile=car&fromLat=51.5&fromLng=-0.1&toLat=48.8&toLng=2.3',
        {
          headers: {
            host: 'public.example.test',
            'x-forwarded-host': 'admin.example.test'
          }
        }
      )
    );

    await expect(response.json()).resolves.toEqual({ error: 'Admin domain required' });
    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects forwarded admin hosts from local proxy hops without the proxy secret', async () => {
    process.env.ADMIN_DOMAIN = 'admin.example.test';
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await GET(
      new NextRequest(
        'http://127.0.0.1:3000/api/routing/osrm?profile=car&fromLat=51.5&fromLng=-0.1&toLat=48.8&toLng=2.3',
        {
          headers: {
            host: '127.0.0.1:3000',
            'x-forwarded-host': 'admin.example.test'
          }
        }
      )
    );

    await expect(response.json()).resolves.toEqual({ error: 'Admin domain required' });
    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts forwarded admin hosts only from trusted local proxy hops', async () => {
    process.env.ADMIN_DOMAIN = 'admin.example.test';
    process.env.ADMIN_PROXY_SECRET = 'proxy-secret';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ routes: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await GET(
      new NextRequest(
        'http://127.0.0.1:3000/api/routing/osrm?profile=car&fromLat=51.5&fromLng=-0.1&toLat=48.8&toLng=2.3',
        {
          headers: {
            host: '127.0.0.1:3000',
            'x-forwarded-host': 'admin.example.test',
            'x-travel-tracker-admin-proxy-secret': 'proxy-secret'
          }
        }
      )
    );

    await expect(response.json()).resolves.toEqual({ routes: [] });
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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

  it('rejects inherited object property names as profiles', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await GET(buildRequest(
      'profile=toString&fromLat=51.5&fromLng=-0.1&toLat=48.8&toLng=2.3'
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

  it('rejects whitespace-only coordinate values', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await GET(buildRequest(
      'profile=car&fromLat=%20%20%20&fromLng=-0.1&toLat=48.8&toLng=2.3'
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
