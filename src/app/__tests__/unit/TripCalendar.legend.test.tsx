import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import TripCalendar from '@/app/components/TripCalendar/TripCalendar';
import { SHADOW_LOCATION_PREFIX } from '@/app/lib/shadowConstants';
import type { Location, Trip } from '@/app/types';

jest.mock('@/app/components/LocationPopup', () => ({
  LocationPopupModal: () => null,
}));

function makeLocation(id: string, name: string, date: Date): Location {
  return {
    id,
    name,
    coordinates: [0, 0],
    date,
  };
}

function makeTrip(locations: Location[]): Trip {
  return {
    id: 'trip-calendar-legend',
    title: 'Legend sorting trip',
    description: '',
    startDate: '2026-01-01',
    endDate: '2026-01-03',
    locations,
    routes: [],
    accommodations: [],
  };
}

describe('TripCalendar legend sorting', () => {
  it('sorts prefixed shadow locations by their own dates', async () => {
    const shadowLocationName = `${SHADOW_LOCATION_PREFIX} Shadow stop`;
    const laterRealLocation = makeLocation('real-later', 'Later real stop', new Date('2026-01-03T00:00:00Z'));
    const earlierShadowLocation = makeLocation('shadow-earlier', shadowLocationName, new Date('2026-01-01T00:00:00Z'));

    render(
      <TripCalendar
        trip={makeTrip([laterRealLocation, earlierShadowLocation])}
        planningMode
      />
    );

    const legendHeading = await screen.findByRole('heading', { name: 'Locations' });
    const legend = legendHeading.nextElementSibling;

    await waitFor(() => {
      expect(within(legend as HTMLElement).getByText(shadowLocationName)).toBeInTheDocument();
    });

    const legendText = legend?.textContent ?? '';
    expect(legendText).toContain(shadowLocationName);
    expect(legendText).toContain('Later real stop');
    expect(legendText.indexOf(shadowLocationName)).toBeLessThan(
      legendText.indexOf('Later real stop')
    );
  });
});
