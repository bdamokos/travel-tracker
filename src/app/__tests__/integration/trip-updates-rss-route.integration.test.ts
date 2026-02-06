import { NextRequest } from 'next/server';
import { GET as rssGET } from '@/app/api/travel-data/[tripId]/updates/rss/route';
import { UnifiedTripData } from '@/app/lib/dataMigration';

jest.mock('@/app/lib/unifiedDataService', () => ({
  __esModule: true,
  loadUnifiedTripData: jest.fn(),
}));

const { loadUnifiedTripData: mockLoadUnifiedTripData } = jest.requireMock(
  '@/app/lib/unifiedDataService'
) as {
  loadUnifiedTripData: jest.Mock;
};

const createMockTripData = (): UnifiedTripData => ({
  schemaVersion: 9,
  id: 'trip-1',
  title: 'Europe & Beyond',
  description: 'A <trip> feed',
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2024-01-31T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-04T12:00:00.000Z',
  publicUpdates: [
    {
      id: 'manual-1',
      createdAt: '2024-01-03T09:00:00.000Z',
      message: 'Manual <announce> & update',
      kind: 'manual',
      links: [{ url: 'javascript:alert(1)', title: 'Invalid link' }],
    },
    {
      id: 'auto-1',
      createdAt: '2024-01-04T10:00:00.000Z',
      message: 'New trip location added: Budapest on Jan 4, 2024.',
      kind: 'auto',
      links: [{ url: 'https://example.com/post?x=1&y=2', title: 'Trip & Post' }],
    },
    {
      id: 'auto-2',
      createdAt: '2024-01-02T10:00:00.000Z',
      message: 'New trip location added: Secret Base on Jan 2, 2024.',
      kind: 'auto',
    },
  ],
  travelData: {
    locations: [
      {
        id: 'loc-1',
        name: 'Budapest',
        coordinates: [47.4979, 19.0402],
        date: new Date('2024-01-04T00:00:00.000Z'),
      },
    ],
    routes: [],
    days: [],
  },
});

describe('Trip updates RSS route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when trip does not exist', async () => {
    mockLoadUnifiedTripData.mockResolvedValue(null);

    const request = new NextRequest('https://travel.example/api/travel-data/trip-1/updates/rss');
    const response = await rssGET(request, { params: Promise.resolve({ tripId: 'trip-1' }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Trip not found' });
  });

  it('returns RSS XML with filtering and escaped output', async () => {
    mockLoadUnifiedTripData.mockResolvedValue(createMockTripData());

    const request = new NextRequest('https://travel.example/api/travel-data/trip-1/updates/rss');
    const response = await rssGET(request, { params: Promise.resolve({ tripId: 'trip-1' }) });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/rss+xml');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=3600');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>Europe &amp; Beyond - Trip Updates</title>');
    expect(xml).toContain('<description>A &lt;trip&gt; feed</description>');
    expect(xml).toContain(
      '<atom:link href="https://travel.example/api/travel-data/trip-1/updates/rss" rel="self" type="application/rss+xml"/>'
    );
    expect(xml).toContain('Manual &lt;announce&gt; &amp; update');
    expect(xml).toContain('https://example.com/post?x=1&amp;y=2');
    expect(xml).toContain(
      '<guid isPermaLink="false">https://travel.example/api/travel-data/trip-1/updates/rss#auto-1</guid>'
    );
    expect(xml).not.toContain('Secret Base');
    expect(xml).not.toContain('javascript:alert(1)');

    const budapestIndex = xml.indexOf('Budapest');
    const manualIndex = xml.indexOf('Manual &lt;announce&gt;');
    expect(budapestIndex).toBeGreaterThanOrEqual(0);
    expect(manualIndex).toBeGreaterThanOrEqual(0);
    expect(budapestIndex).toBeLessThan(manualIndex);
  });

  it('falls back to trip updatedAt when item dates are invalid', async () => {
    const tripData = createMockTripData();
    tripData.publicUpdates = [
      {
        id: 'bad-date',
        createdAt: 'not-a-date',
        message: 'Date fallback check',
        kind: 'manual',
      },
    ];
    mockLoadUnifiedTripData.mockResolvedValue(tripData);

    const request = new NextRequest('https://travel.example/api/travel-data/trip-1/updates/rss');
    const response = await rssGET(request, { params: Promise.resolve({ tripId: 'trip-1' }) });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('Thu, 04 Jan 2024 12:00:00 GMT');
    expect(xml).not.toContain('Invalid Date');
  });
});
