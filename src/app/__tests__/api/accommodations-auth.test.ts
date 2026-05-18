/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

import {
  DELETE,
  GET,
  POST,
  PUT,
} from '@/app/admin/api/accommodations/route';
import {
  loadUnifiedTripData,
  saveUnifiedTripData,
} from '@/app/lib/unifiedDataService';

jest.mock('@/app/lib/server-domains', () => ({
  __esModule: true,
  isAdminDomain: jest.fn(),
}));

jest.mock('@/app/lib/unifiedDataService', () => ({
  __esModule: true,
  loadUnifiedTripData: jest.fn(),
  saveUnifiedTripData: jest.fn(),
}));

const { isAdminDomain: mockIsAdminDomain } = jest.requireMock('@/app/lib/server-domains');
const mockLoadUnifiedTripData = loadUnifiedTripData as jest.MockedFunction<typeof loadUnifiedTripData>;
const mockSaveUnifiedTripData = saveUnifiedTripData as jest.MockedFunction<typeof saveUnifiedTripData>;

const jsonRequest = (url: string, method: string, body?: string): NextRequest =>
  new NextRequest(url, {
    method,
    body,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  });

const expectUnauthorized = async (response: Response): Promise<void> => {
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
  expect(mockSaveUnifiedTripData).not.toHaveBeenCalled();
};

describe('accommodations admin API authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockIsAdminDomain as jest.Mock).mockResolvedValue(false);
  });

  it('blocks accommodation GET requests on public domains before loading trip data', async () => {
    const response = await GET(
      jsonRequest('https://travel.example/admin/api/accommodations?tripId=trip-1', 'GET')
    );

    await expectUnauthorized(response);
  });

  it('blocks accommodation POST requests on public domains before parsing request JSON', async () => {
    const response = await POST(
      jsonRequest('https://travel.example/admin/api/accommodations', 'POST', '{')
    );

    await expectUnauthorized(response);
  });

  it('blocks accommodation PUT requests on public domains before parsing request JSON', async () => {
    const response = await PUT(
      jsonRequest('https://travel.example/admin/api/accommodations', 'PUT', '{')
    );

    await expectUnauthorized(response);
  });

  it('blocks accommodation DELETE requests on public domains before mutating trip data', async () => {
    const response = await DELETE(
      jsonRequest('https://travel.example/admin/api/accommodations?tripId=trip-1&id=acc-1', 'DELETE')
    );

    await expectUnauthorized(response);
  });

  it('allows admin accommodation updates without persisting request-only fields', async () => {
    (mockIsAdminDomain as jest.Mock).mockResolvedValue(true);
    mockLoadUnifiedTripData.mockResolvedValue({
      id: 'trip-1',
      accommodations: [
        {
          id: 'acc-1',
          name: 'Old Hotel',
          locationId: 'loc-1',
          accommodationData: 'old',
          isAccommodationPublic: false,
          costTrackingLinks: [{ expenseId: 'expense-1' }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const response = await PUT(
      jsonRequest(
        'https://admin.example/admin/api/accommodations',
        'PUT',
        JSON.stringify({
          tripId: 'trip-1',
          id: 'acc-1',
          name: 'New Hotel',
          costTrackingLinks: [{ expenseId: 'attacker-expense' }],
        })
      )
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      id: 'acc-1',
      name: 'New Hotel',
      locationId: 'loc-1',
      costTrackingLinks: [{ expenseId: 'expense-1' }],
    });
    expect(result.tripId).toBeUndefined();
    expect(mockSaveUnifiedTripData).toHaveBeenCalledTimes(1);
    const savedTrip = mockSaveUnifiedTripData.mock.calls[0]?.[0];
    expect(savedTrip.accommodations[0]).not.toHaveProperty('tripId');
    expect(savedTrip.accommodations[0].costTrackingLinks).toEqual([{ expenseId: 'expense-1' }]);
  });
});
