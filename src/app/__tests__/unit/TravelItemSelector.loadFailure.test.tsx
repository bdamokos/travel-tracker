import { render, waitFor } from '@testing-library/react';

import TravelItemSelector from '@/app/admin/components/TravelItemSelector';

jest.mock('@/app/hooks/useExpenseLinks', () => ({
  useExpenseLinks: () => ({
    expenseLinks: [],
    isLoading: false,
    error: null
  })
}));

describe('TravelItemSelector load failures', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('clears the current reference when travel item loading fails', async () => {
    const onReferenceChange = jest.fn();
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as jest.Mock;

    render(
      <TravelItemSelector
        expenseId="expense-1"
        tripId="trip-1"
        initialValue={{
          id: 'route-1',
          type: 'route',
          name: 'Stale route'
        }}
        onReferenceChange={onReferenceChange}
      />
    );

    await waitFor(() => {
      expect(onReferenceChange).toHaveBeenCalledWith(undefined);
    });
  });
});
