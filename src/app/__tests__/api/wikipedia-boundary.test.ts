/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

import {
  DELETE as DELETE_WIKIPEDIA_LOCATION,
  GET as GET_WIKIPEDIA_LOCATION,
  PUT as PUT_WIKIPEDIA_LOCATION,
} from '@/app/api/wikipedia/[locationName]/route';
import {
  GET as GET_WIKIPEDIA_REFRESH,
  POST as POST_WIKIPEDIA_REFRESH,
} from '@/app/api/wikipedia/refresh/route';
import { wikipediaService } from '@/app/services/wikipediaService';
import { listAllTrips, loadUnifiedTripData } from '@/app/lib/unifiedDataService';

jest.mock('@/app/lib/server-domains', () => ({
  __esModule: true,
  isAdminDomain: jest.fn(),
}));

jest.mock('@/app/services/wikipediaService', () => ({
  __esModule: true,
  wikipediaService: {
    getLocationData: jest.fn(),
    getCachedData: jest.fn(),
    fetchLocationData: jest.fn(),
    listCachedFiles: jest.fn(),
  },
}));

jest.mock('@/app/lib/unifiedDataService', () => ({
  __esModule: true,
  listAllTrips: jest.fn(),
  loadUnifiedTripData: jest.fn(),
}));

const { isAdminDomain: mockIsAdminDomain } = jest.requireMock('@/app/lib/server-domains');
const mockGetLocationData = wikipediaService.getLocationData as jest.MockedFunction<typeof wikipediaService.getLocationData>;
const mockGetCachedData = wikipediaService.getCachedData as jest.MockedFunction<typeof wikipediaService.getCachedData>;
const mockFetchLocationData = wikipediaService.fetchLocationData as jest.MockedFunction<typeof wikipediaService.fetchLocationData>;
const mockListCachedFiles = wikipediaService.listCachedFiles as jest.MockedFunction<typeof wikipediaService.listCachedFiles>;
const mockListAllTrips = listAllTrips as jest.MockedFunction<typeof listAllTrips>;
const mockLoadUnifiedTripData = loadUnifiedTripData as jest.MockedFunction<typeof loadUnifiedTripData>;

const routeParams = (locationName = 'Paris') => ({
  params: Promise.resolve({ locationName }),
});

const buildRequest = (url: string, init?: RequestInit): NextRequest => new NextRequest(url, init);

describe('wikipedia API boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocationData.mockResolvedValue({
      title: 'Paris',
      extract: 'Paris is a city.',
      url: 'https://en.wikipedia.org/wiki/Paris',
      attribution: {
        text: 'Source: Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Paris',
        license: 'CC BY-SA 4.0',
        imageDisclaimer: 'Image licensing: verify on Wikipedia',
      },
      lastFetched: Date.now(),
      refreshStatus: 'success',
      cacheKey: 'paris.json',
      apiVersion: 'rest_v1',
    });
    mockGetCachedData.mockResolvedValue({
      title: 'Paris',
      extract: 'Paris is a city.',
      url: 'https://en.wikipedia.org/wiki/Paris',
      attribution: {
        text: 'Source: Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Paris',
        license: 'CC BY-SA 4.0',
        imageDisclaimer: 'Image licensing: verify on Wikipedia',
      },
      lastFetched: Date.now(),
      refreshStatus: 'success',
      cacheKey: 'paris.json',
      apiVersion: 'rest_v1',
    });
    mockFetchLocationData.mockResolvedValue(null);
    mockListCachedFiles.mockResolvedValue([]);
    mockListAllTrips.mockResolvedValue([]);
    mockLoadUnifiedTripData.mockResolvedValue(null);
  });

  it('rejects public refresh status before reading cache metadata', async () => {
    mockIsAdminDomain.mockResolvedValue(false);

    const response = await GET_WIKIPEDIA_REFRESH();

    expect(response.status).toBe(403);
    expect(mockListCachedFiles).not.toHaveBeenCalled();
  });

  it('rejects public batch refresh before parsing body or loading trip data', async () => {
    mockIsAdminDomain.mockResolvedValue(false);

    const request = buildRequest('https://public.example.test/api/wikipedia/refresh', {
      method: 'POST',
      body: '{',
    });
    const response = await POST_WIKIPEDIA_REFRESH(request);

    expect(response.status).toBe(403);
    expect(mockListAllTrips).not.toHaveBeenCalled();
    expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
    expect(mockFetchLocationData).not.toHaveBeenCalled();
  });

  it('rejects public forced per-location refresh before calling the service', async () => {
    mockIsAdminDomain.mockResolvedValue(false);

    const request = buildRequest(
      'https://public.example.test/api/wikipedia/Paris?lat=48.8566&lon=2.3522&refresh=true'
    );
    const response = await GET_WIKIPEDIA_LOCATION(request, routeParams());

    expect(response.status).toBe(403);
    expect(mockGetLocationData).not.toHaveBeenCalled();
    expect(mockGetCachedData).not.toHaveBeenCalled();
  });

  it('rejects malformed public location coordinates before calling the service', async () => {
    const request = buildRequest(
      'https://public.example.test/api/wikipedia/Paris?lat=48.8566&lon=2.3522evil'
    );
    const response = await GET_WIKIPEDIA_LOCATION(request, routeParams());

    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockGetLocationData).not.toHaveBeenCalled();
    expect(mockIsAdminDomain).not.toHaveBeenCalled();
  });

  it('serves normal public location lookup from cache only', async () => {
    mockIsAdminDomain.mockResolvedValue(false);

    const request = buildRequest(
      'https://public.example.test/api/wikipedia/Paris?lat=48.8566&lon=2.3522&wikipediaRef=Paris'
    );
    const response = await GET_WIKIPEDIA_LOCATION(request, routeParams());

    expect(response.status).toBe(200);
    expect(mockGetLocationData).not.toHaveBeenCalled();
    expect(mockGetCachedData).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Paris',
        coordinates: [48.8566, 2.3522],
        wikipediaRef: 'Paris',
      })
    );
  });

  it('allows admin forced per-location refresh', async () => {
    mockIsAdminDomain.mockResolvedValue(true);

    const request = buildRequest(
      'https://admin.example.test/api/wikipedia/Paris?lat=48.8566&lon=2.3522&refresh=true'
    );
    const response = await GET_WIKIPEDIA_LOCATION(request, routeParams());

    expect(response.status).toBe(200);
    expect(mockGetLocationData).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Paris' }),
      true,
      undefined
    );
  });

  it('rejects public PUT and DELETE before mutation work', async () => {
    mockIsAdminDomain.mockResolvedValue(false);

    const putRequest = buildRequest('https://public.example.test/api/wikipedia/Paris', {
      method: 'PUT',
      body: JSON.stringify({
        wikipediaRef: 'Paris',
        coordinates: [48.8566, 2.3522],
      }),
    });
    const deleteRequest = buildRequest('https://public.example.test/api/wikipedia/Paris', {
      method: 'DELETE',
    });

    const putResponse = await PUT_WIKIPEDIA_LOCATION(putRequest, routeParams());
    const deleteResponse = await DELETE_WIKIPEDIA_LOCATION(deleteRequest, routeParams());

    expect(putResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    expect(mockGetLocationData).not.toHaveBeenCalled();
  });
});
