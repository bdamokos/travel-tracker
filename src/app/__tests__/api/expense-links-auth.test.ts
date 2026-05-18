/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import {
  DELETE as deleteTripExpenseLink,
  GET as getTripExpenseLinks,
  POST as postTripExpenseLink,
} from '@/app/api/travel-data/[tripId]/expense-links/route';
import {
  DELETE as deleteLegacyExpenseLink,
  POST as postLegacyExpenseLink,
} from '@/app/api/travel-data/expense-links/route';
import { POST as moveLegacyExpenseLink } from '@/app/api/travel-data/expense-links/move/route';

jest.mock('@/app/lib/server-domains', () => ({
  __esModule: true,
  isAdminDomain: jest.fn(),
}));

jest.mock('@/app/lib/unifiedDataService', () => ({
  __esModule: true,
  loadUnifiedTripData: jest.fn(),
  saveUnifiedTripData: jest.fn(),
}));

jest.mock('@/app/lib/expenseLinkingService', () => ({
  __esModule: true,
  createExpenseLinkingService: jest.fn(() => ({
    createMultipleLinks: jest.fn(),
    createOrUpdateLink: jest.fn(),
    removeLink: jest.fn(),
  })),
}));

const { isAdminDomain: mockIsAdminDomain } = jest.requireMock('@/app/lib/server-domains');
const {
  loadUnifiedTripData: mockLoadUnifiedTripData,
  saveUnifiedTripData: mockSaveUnifiedTripData,
} = jest.requireMock('@/app/lib/unifiedDataService');
const { createExpenseLinkingService: mockCreateExpenseLinkingService } = jest.requireMock('@/app/lib/expenseLinkingService');

const tripParams = { params: Promise.resolve({ tripId: 'trip-1' }) };

const jsonRequest = (url: string, method: string, body?: unknown): NextRequest =>
  new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  });

const expectForbidden = async (response: Response): Promise<void> => {
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: 'Forbidden - admin domain required',
  });
};

describe('expense-link API admin-domain authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockIsAdminDomain as jest.Mock).mockResolvedValue(false);
  });

  it('blocks trip-scoped expense-link reads on public domains', async () => {
    const response = await getTripExpenseLinks(
      jsonRequest('https://travel.example/api/travel-data/trip-1/expense-links', 'GET'),
      tripParams
    );

    await expectForbidden(response);
    expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
  });

  it('allows trip-scoped expense-link reads on admin domains', async () => {
    (mockIsAdminDomain as jest.Mock).mockResolvedValue(true);
    mockLoadUnifiedTripData.mockResolvedValue({
      costData: {
        expenses: [{ id: 'expense-1' }],
      },
      travelData: {
        locations: [
          {
            id: 'location-1',
            name: 'Berlin',
            costTrackingLinks: [{ expenseId: 'expense-1', splitMode: 'fixed', splitValue: 40 }],
          },
        ],
      },
    });

    const response = await getTripExpenseLinks(
      jsonRequest('https://admin.example/api/travel-data/trip-1/expense-links', 'GET'),
      tripParams
    );

    await expect(response.json()).resolves.toEqual([
      {
        expenseId: 'expense-1',
        travelItemId: 'location-1',
        travelItemName: 'Berlin',
        travelItemType: 'location',
        description: undefined,
        splitMode: 'fixed',
        splitValue: 40,
      },
    ]);
    expect(response.status).toBe(200);
    expect(mockLoadUnifiedTripData).toHaveBeenCalledWith('trip-1');
  });

  it('blocks trip-scoped expense-link mutations before parsing private split data', async () => {
    const response = await postTripExpenseLink(
      jsonRequest('https://travel.example/api/travel-data/trip-1/expense-links', 'POST', {
        expenseId: 'expense-1',
        links: [
          { type: 'route', id: 'route-1', name: 'Route 1', splitMode: 'fixed', splitValue: 70 },
          { type: 'route', id: 'route-2', name: 'Route 2', splitMode: 'fixed', splitValue: 20 },
        ],
      }),
      tripParams
    );

    await expectForbidden(response);
    expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
    expect(mockCreateExpenseLinkingService).not.toHaveBeenCalled();
  });

  it('blocks trip-scoped expense-link deletes on public domains', async () => {
    const response = await deleteTripExpenseLink(
      jsonRequest('https://travel.example/api/travel-data/trip-1/expense-links?expenseId=expense-1', 'DELETE'),
      tripParams
    );

    await expectForbidden(response);
    expect(mockCreateExpenseLinkingService).not.toHaveBeenCalled();
  });

  it('blocks legacy expense-link creation on public domains', async () => {
    const response = await postLegacyExpenseLink(
      jsonRequest('https://travel.example/api/travel-data/expense-links', 'POST', {
        tripId: 'trip-1',
        expenseId: 'expense-1',
        travelItemId: 'location-1',
        travelItemType: 'location',
      })
    );

    await expectForbidden(response);
    expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
    expect(mockSaveUnifiedTripData).not.toHaveBeenCalled();
  });

  it('blocks legacy expense-link deletes on public domains', async () => {
    const response = await deleteLegacyExpenseLink(
      jsonRequest('https://travel.example/api/travel-data/expense-links', 'DELETE', {
        tripId: 'trip-1',
        expenseId: 'expense-1',
        travelItemId: 'location-1',
      })
    );

    await expectForbidden(response);
    expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
    expect(mockSaveUnifiedTripData).not.toHaveBeenCalled();
  });

  it('blocks legacy expense-link moves on public domains', async () => {
    const response = await moveLegacyExpenseLink(
      jsonRequest('https://travel.example/api/travel-data/expense-links/move', 'POST', {
        tripId: 'trip-1',
        expenseId: 'expense-1',
        fromTravelItemId: 'location-1',
        toTravelItemId: 'route-1',
        toTravelItemType: 'route',
      })
    );

    await expectForbidden(response);
    expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
    expect(mockSaveUnifiedTripData).not.toHaveBeenCalled();
  });
});
