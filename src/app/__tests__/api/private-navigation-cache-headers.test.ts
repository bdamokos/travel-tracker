/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET as getAccommodations } from '@/app/admin/api/accommodations/route';
import { GET as getAccommodation } from '@/app/admin/api/accommodations/[id]/route';
import { GET as getExpenseLinks } from '@/app/api/travel-data/[tripId]/expense-links/route';
import { isAdminDomain } from '@/app/lib/server-domains';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';

jest.mock('@/app/lib/server-domains', () => ({ isAdminDomain: jest.fn() }));
jest.mock('@/app/lib/unifiedDataService', () => ({ loadUnifiedTripData: jest.fn(), saveUnifiedTripData: jest.fn() }));
jest.mock('@/app/lib/expenseLinkingService', () => ({ createExpenseLinkingService: jest.fn() }));

const accommodation = {
  id: 'acc-fixture', name: 'Synthetic private hotel', locationId: 'location-fixture',
  accommodationData: 'Synthetic reservation', isAccommodationPublic: false,
  costTrackingLinks: [{ expenseId: 'expense-fixture' }], createdAt: '2026-01-01T00:00:00Z'
};
const trip = { id: 'trip-fixture', accommodations: [accommodation], costData: { expenses: [{ id: 'expense-fixture' }] } };
const request = (pathname: string): NextRequest => new NextRequest(`https://admin.example.test${pathname}`);
const routes = [
  {
    name: 'accommodation list',
    call: () => getAccommodations(request('/admin/api/accommodations?tripId=trip-fixture')),
    invalid: () => getAccommodations(request('/admin/api/accommodations')),
    expected: [accommodation]
  },
  {
    name: 'filtered accommodations',
    call: () => getAccommodations(request('/admin/api/accommodations?tripId=trip-fixture&locationId=location-fixture')),
    invalid: () => getAccommodations(request('/admin/api/accommodations?locationId=location-fixture')),
    expected: [accommodation]
  },
  {
    name: 'accommodation detail',
    call: () => getAccommodation(request('/admin/api/accommodations/acc-fixture?tripId=trip-fixture'), { params: Promise.resolve({ id: 'acc-fixture' }) }),
    invalid: () => getAccommodation(request('/admin/api/accommodations/acc-fixture'), { params: Promise.resolve({ id: 'acc-fixture' }) }),
    expected: accommodation
  },
  {
    name: 'expense links',
    call: () => getExpenseLinks(request('/api/travel-data/trip-fixture/expense-links'), { params: Promise.resolve({ tripId: 'trip-fixture' }) }),
    invalid: () => getExpenseLinks(request('/api/travel-data/fixture/expense-links'), { params: Promise.resolve({ tripId: '' }) }),
    expected: [{ expenseId: 'expense-fixture', travelItemId: 'acc-fixture', travelItemName: accommodation.name, travelItemType: 'accommodation' }]
  }
];

describe('private navigation API cache headers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(isAdminDomain).mockResolvedValue(true);
    jest.mocked(loadUnifiedTripData).mockResolvedValue(trip as Awaited<ReturnType<typeof loadUnifiedTripData>>);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(routes)('preserves $name online payloads with no-store', async ({ call, expected }) => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual(expected);
  });

  it.each(routes)('protects $name authorization failures before loading data', async ({ call }) => {
    jest.mocked(isAdminDomain).mockResolvedValue(false);
    const response = await call();
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(loadUnifiedTripData).not.toHaveBeenCalled();
  });

  it.each(routes)('protects $name invalid input before loading data', async ({ invalid }) => {
    const response = await invalid();
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(loadUnifiedTripData).not.toHaveBeenCalled();
  });

  it.each(routes)('protects $name missing records', async ({ call }) => {
    jest.mocked(loadUnifiedTripData).mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('protects a missing accommodation inside an existing trip', async () => {
    jest.mocked(loadUnifiedTripData).mockResolvedValue({ id: 'trip-fixture', accommodations: [] });
    const response = await routes[2].call();
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it.each(routes)('protects $name server errors', async ({ call }) => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.mocked(loadUnifiedTripData).mockRejectedValueOnce(new Error('synthetic failure'));
    const response = await call();
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
