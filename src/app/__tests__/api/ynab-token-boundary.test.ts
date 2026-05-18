/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

import { GET as costTrackingGET } from '@/app/api/cost-tracking/route';
import { GET as costTrackingListGET } from '@/app/api/cost-tracking/list/route';
import { POST as ynabCategoriesPOST } from '@/app/api/ynab/categories/route';
import {
  GET as ynabTransactionsGET,
  POST as ynabTransactionsPOST,
} from '@/app/api/ynab/transactions/route';
import { loadUnifiedTripData, listAllTrips } from '@/app/lib/unifiedDataService';
import { YnabApiClient } from '@/app/lib/ynabApiClient';

const mockGetCategories = jest.fn();

jest.mock('@/app/lib/server-domains', () => ({
  __esModule: true,
  isAdminDomain: jest.fn(),
}));

jest.mock('@/app/lib/unifiedDataService', () => ({
  __esModule: true,
  loadUnifiedTripData: jest.fn(),
  listAllTrips: jest.fn(),
}));

jest.mock('@/app/lib/ynabPendingSync', () => ({
  __esModule: true,
  maybeSyncPendingYnabTransactions: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/app/lib/tripBoundaryValidation', () => ({
  __esModule: true,
  validateAllTripBoundaries: jest.fn(() => ({ isValid: true, errors: [] })),
}));

jest.mock('@/app/lib/ynabApiClient', () => ({
  __esModule: true,
  YnabApiClient: Object.assign(
    jest.fn().mockImplementation(() => ({
      getCategories: mockGetCategories,
    })),
    {
      convertMilliUnitsToCurrency: jest.fn((amount: number) => amount / 1000),
    }
  ),
}));

const { isAdminDomain: mockIsAdminDomain } = jest.requireMock('@/app/lib/server-domains');
const mockLoadUnifiedTripData = loadUnifiedTripData as jest.MockedFunction<typeof loadUnifiedTripData>;
const mockListAllTrips = listAllTrips as jest.MockedFunction<typeof listAllTrips>;
const mockYnabApiClient = YnabApiClient as jest.MockedClass<typeof YnabApiClient>;

const buildTrip = () => ({
  schemaVersion: 9,
  id: 'trip-1',
  title: 'Secret Budget Trip',
  description: '',
  startDate: '2026-06-01',
  endDate: '2026-06-10',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
  travelData: {
    locations: [],
    routes: [],
  },
  costData: {
    overallBudget: 1000,
    reservedBudget: 0,
    currency: 'EUR',
    countryBudgets: [],
    expenses: [],
    ynabConfig: {
      costTrackerId: 'cost-trip-1',
      apiKey: 'SECRET-YNAB-TOKEN',
      selectedBudgetId: 'budget-1',
      selectedBudgetName: 'Travel Budget',
      currency: 'EUR',
    },
  },
});

describe('YNAB token boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redacts stored YNAB tokens from cost-tracking GET responses', async () => {
    mockIsAdminDomain.mockResolvedValue(true);
    mockLoadUnifiedTripData.mockResolvedValue(buildTrip());

    const response = await costTrackingGET(
      new NextRequest('https://admin.example.test/api/cost-tracking?id=trip-1')
    );
    const result = await response.json();
    const serialized = JSON.stringify(result);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(result.ynabConfig).toMatchObject({
      costTrackerId: 'cost-trip-1',
      selectedBudgetId: 'budget-1',
      hasApiKey: true,
    });
    expect(result.ynabConfig.apiKey).toBeUndefined();
    expect(serialized).not.toContain('SECRET-YNAB-TOKEN');
  });

  it('redacts stored YNAB tokens from cost-tracking list data', async () => {
    mockIsAdminDomain.mockResolvedValue(true);
    mockListAllTrips.mockResolvedValue([
      {
        id: 'trip-1',
        title: 'Secret Budget Trip',
        description: '',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        hasTravel: true,
        hasCost: true,
      },
    ]);
    mockLoadUnifiedTripData.mockResolvedValue(buildTrip());

    const response = await costTrackingListGET(
      new NextRequest('https://admin.example.test/api/cost-tracking/list?includeCostData=1')
    );
    const result = await response.json();
    const serialized = JSON.stringify(result);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(result[0].costData.ynabConfig.hasApiKey).toBe(true);
    expect(result[0].costData.ynabConfig.apiKey).toBeUndefined();
    expect(serialized).not.toContain('SECRET-YNAB-TOKEN');
  });

  it('rejects public YNAB category proxy calls before contacting YNAB', async () => {
    mockIsAdminDomain.mockResolvedValue(false);

    const response = await ynabCategoriesPOST(
      new NextRequest('https://public.example.test/api/ynab/categories', {
        method: 'POST',
        body: JSON.stringify({ costTrackerId: 'cost-trip-1' }),
      })
    );

    expect(response.status).toBe(403);
    expect(mockYnabApiClient).not.toHaveBeenCalled();
  });

  it('disables YNAB transaction GET so API keys cannot be placed in URLs', async () => {
    const response = await ynabTransactionsGET();
    const result = await response.json();

    expect(response.status).toBe(405);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(result.error).toContain('Use POST');
  });

  it('rejects public YNAB transaction proxy calls before contacting YNAB', async () => {
    mockIsAdminDomain.mockResolvedValue(false);

    const response = await ynabTransactionsPOST(
      new NextRequest('https://public.example.test/api/ynab/transactions', {
        method: 'POST',
        body: JSON.stringify({
          costTrackerId: 'cost-trip-1',
          categoryMappings: [{ ynabCategoryId: 'cat-1', mappingType: 'general' }],
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(mockYnabApiClient).not.toHaveBeenCalled();
  });

  it('loads YNAB categories using the server-stored token for admin callers', async () => {
    mockIsAdminDomain.mockResolvedValue(true);
    mockLoadUnifiedTripData.mockResolvedValue(buildTrip());
    mockGetCategories.mockResolvedValue({
      categories: [
        {
          id: 'cat-1',
          name: 'Hotels',
          category_group_name: 'Travel',
          hidden: false,
          balance: 0,
          budgeted: 1000,
          activity: -500,
        },
      ],
      serverKnowledge: 42,
    });

    const response = await ynabCategoriesPOST(
      new NextRequest('https://admin.example.test/api/ynab/categories', {
        method: 'POST',
        body: JSON.stringify({ costTrackerId: 'cost-trip-1' }),
      })
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockYnabApiClient).toHaveBeenCalledWith('SECRET-YNAB-TOKEN');
    expect(result).toMatchObject({
      success: true,
      serverKnowledge: 42,
      categories: [
        {
          id: 'cat-1',
          name: 'Hotels',
          category_group_name: 'Travel',
        },
      ],
    });
  });
});
