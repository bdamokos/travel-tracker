import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import CostTrackingLinksManager from '../CostTrackingLinksManager';

// Mock the API calls
global.fetch = jest.fn();

describe('CostTrackingLinksManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should only load expenses from the specified trip when tripId is provided', async () => {
    const mockTripExpenses = {
      expenses: [
        {
          id: 'expense-1',
          description: 'Trip 1 Expense',
          amount: 100,
          currency: 'EUR',
          date: '2024-01-01',
          category: 'Food'
        },
        {
          id: 'expense-2',
          description: 'Trip 1 Another Expense',
          amount: 50,
          currency: 'EUR',
          date: '2024-01-02',
          category: 'Transport'
        }
      ]
    };

    // Mock the trip-specific API call
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTripExpenses)
    });

    render(
      <CostTrackingLinksManager
        currentLinks={[]}
        onLinksChange={() => {}}
        tripId="trip-123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Choose an expense/)).toBeInTheDocument();
    });

    // Verify that only the trip-specific API was called
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/cost-tracking?id=trip-123');
  });

  it('should load all expenses when no tripId is provided (legacy mode)', async () => {
    const mockCostEntries = [
      { id: 'trip-1' },
      { id: 'trip-2' }
    ];

    const mockTripData1 = {
      expenses: [
        {
          id: 'expense-1',
          description: 'Trip 1 Expense',
          amount: 100,
          currency: 'EUR',
          date: '2024-01-01',
          category: 'Food'
        }
      ]
    };

    const mockTripData2 = {
      expenses: [
        {
          id: 'expense-2',
          description: 'Trip 2 Expense',
          amount: 200,
          currency: 'EUR',
          date: '2024-01-02',
          category: 'Transport'
        }
      ]
    };

    // Mock the API calls
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCostEntries)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTripData1)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTripData2)
      });

    render(
      <CostTrackingLinksManager
        currentLinks={[]}
        onLinksChange={() => {}}
        // No tripId provided - should use legacy mode
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Choose an expense/)).toBeInTheDocument();
    });

    // Verify that the list API and individual trip APIs were called
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledWith('/api/cost-tracking/list');
    expect(global.fetch).toHaveBeenCalledWith('/api/cost-tracking?id=trip-1');
    expect(global.fetch).toHaveBeenCalledWith('/api/cost-tracking?id=trip-2');
  });

  it('should show warning when no tripId is provided', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([])
    });

    render(
      <CostTrackingLinksManager
        currentLinks={[]}
        onLinksChange={() => {}}
        // No tripId provided
      />
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'CostTrackingLinksManager: No tripId provided, loading expenses from all trips. This may show cross-trip data.'
      );
    });

    consoleSpy.mockRestore();
  });
});