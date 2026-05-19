import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AccommodationReadOnlyDisplay from '@/app/admin/components/AccommodationReadOnlyDisplay';
import { Accommodation } from '@/app/types';
import { useExpenseLinksForTravelItem } from '@/app/hooks/useExpenseLinks';
import { useExpenses } from '@/app/hooks/useExpenses';

jest.mock('@/app/hooks/useExpenseLinks', () => ({
  useExpenseLinksForTravelItem: jest.fn()
}));

jest.mock('@/app/hooks/useExpenses', () => ({
  useExpenses: jest.fn()
}));

const mockUseExpenseLinksForTravelItem = jest.mocked(useExpenseLinksForTravelItem);
const mockUseExpenses = jest.mocked(useExpenses);

const buildAccommodation = (website: string): Accommodation => ({
  id: 'acc-1',
  name: 'Test Hotel',
  locationId: 'loc-1',
  accommodationData: `---
name: Test Hotel
website: ${website}
---`,
  isAccommodationPublic: false,
  createdAt: '2026-05-19T00:00:00.000Z'
});

describe('AccommodationReadOnlyDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseExpenseLinksForTravelItem.mockReturnValue({
      expenseLinks: [],
      isLoading: false,
      error: null,
      mutate: jest.fn()
    });

    mockUseExpenses.mockReturnValue({
      expenses: [],
      isLoading: false,
      error: null,
      mutate: jest.fn()
    });
  });

  it('renders http and https accommodation websites as external links', () => {
    render(
      <AccommodationReadOnlyDisplay
        accommodation={buildAccommodation('https://hotel.example')}
        tripId="trip-1"
      />
    );

    expect(screen.getByRole('link', { name: 'https://hotel.example' })).toHaveAttribute(
      'href',
      'https://hotel.example'
    );
  });

  it('does not render unsafe accommodation website schemes as clickable links', () => {
    render(
      <AccommodationReadOnlyDisplay
        accommodation={buildAccommodation('javascript:alert(1)')}
        tripId="trip-1"
      />
    );

    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
  });
});
