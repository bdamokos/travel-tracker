import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import LocationAccommodationsManager from '@/app/admin/components/LocationAccommodationsManager';
import { useAccommodations } from '@/app/hooks/useAccommodations';

jest.mock('@/app/hooks/useAccommodations', () => ({
  useAccommodations: jest.fn()
}));

const mockUseAccommodations = jest.mocked(useAccommodations);

describe('LocationAccommodationsManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAccommodations.mockReturnValue({
      accommodations: [],
      loading: false,
      error: null,
      createAccommodation: jest.fn(),
      updateAccommodation: jest.fn(),
      deleteAccommodation: jest.fn(),
      getAccommodationsByLocation: jest.fn().mockReturnValue([]),
      getAccommodationById: jest.fn().mockReturnValue(undefined),
      loadAccommodationsForTrip: jest.fn()
    });
  });

  it('fills the accommodation name from parsed YAML when adding a new accommodation', async () => {
    const user = userEvent.setup();

    render(
      <LocationAccommodationsManager
        tripId="trip-1"
        locationId="location-1"
        locationName="Paris"
        accommodationIds={[]}
        onAccommodationIdsChange={jest.fn()}
        travelLookup={null}
        costData={null}
      />
    );

    await user.click(screen.getByRole('button', { name: /\+ add accommodation/i }));

    await user.type(
      screen.getByRole('textbox', { name: /Accommodation Details/i }),
      `---
name: Hotel Lutetia
address: Paris
---`
    );

    expect(screen.getByLabelText(/Accommodation Name/i)).toHaveValue('Hotel Lutetia');
  });

  it('preserves a manual accommodation name override when YAML is parsed later', async () => {
    const user = userEvent.setup();

    render(
      <LocationAccommodationsManager
        tripId="trip-1"
        locationId="location-1"
        locationName="Paris"
        accommodationIds={[]}
        onAccommodationIdsChange={jest.fn()}
        travelLookup={null}
        costData={null}
      />
    );

    await user.click(screen.getByRole('button', { name: /\+ add accommodation/i }));

    const nameInput = screen.getByLabelText(/Accommodation Name/i);
    await user.type(nameInput, 'Custom Display Name');

    await user.type(
      screen.getByRole('textbox', { name: /Accommodation Details/i }),
      `---
name: Parsed Hotel Name
---`
    );

    expect(nameInput).toHaveValue('Custom Display Name');
  });
});
