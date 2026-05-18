import { render, screen } from '@testing-library/react';
import TripContextSection from '@/app/components/LocationPopup/TripContextSection';
import type { JourneyDay, Location } from '@/app/types';

const location: Location = {
  id: 'loc-1',
  name: 'Paris',
  coordinates: [48.8566, 2.3522],
  date: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-01-03T00:00:00.000Z'),
  arrivalTime: '2026-01-01T08:30:00.000Z',
  notes: 'Hotel door code 1234',
};

const day: JourneyDay = {
  id: 'day-1',
  title: 'Paris',
  date: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-01-03T00:00:00.000Z'),
  locations: [location],
  customNotes: 'Private side trip details',
};

const otherLocation: Location = {
  id: 'loc-2',
  name: 'London',
  coordinates: [51.5074, -0.1278],
  date: new Date('2026-01-03T00:00:00.000Z'),
  endDate: new Date('2026-01-05T00:00:00.000Z'),
};

const transitionDay: JourneyDay = {
  ...day,
  locations: [location, otherLocation],
};

describe('TripContextSection privacy', () => {
  it('hides detailed itinerary fields for public views', () => {
    render(<TripContextSection location={location} day={day} tripId="trip-1" />);

    expect(screen.getByText('Location:')).toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.queryByText(/Stay:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Arrival:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Hotel door code 1234')).not.toBeInTheDocument();
    expect(screen.queryByText('Private side trip details')).not.toBeInTheDocument();
  });

  it('shows detailed itinerary fields for admin views', () => {
    render(<TripContextSection location={location} day={day} tripId="trip-1" isAdminView />);

    expect(screen.getByText(/Stay:/)).toBeInTheDocument();
    expect(screen.getByText(/Arrival:/)).toBeInTheDocument();
    expect(screen.getByText('2026-01-01T08:30:00.000Z')).toBeInTheDocument();
    expect(screen.getByText('Hotel door code 1234')).toBeInTheDocument();
    expect(screen.getByText('Private side trip details')).toBeInTheDocument();
  });

  it('shows public transition names without detailed itinerary fields', () => {
    render(<TripContextSection location={location} day={transitionDay} tripId="trip-1" />);

    expect(screen.getByText('Transition Day Details')).toBeInTheDocument();
    expect(screen.getByText('Departure:')).toBeInTheDocument();
    expect(screen.getByText('Arrival:')).toBeInTheDocument();
    expect(screen.getByText('London')).toBeInTheDocument();
    expect(screen.queryByText(/Stay period:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Arrival to:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Hotel door code 1234')).not.toBeInTheDocument();
    expect(screen.queryByText('Private side trip details')).not.toBeInTheDocument();
  });

  it('shows detailed transition fields for admin views', () => {
    render(<TripContextSection location={location} day={transitionDay} tripId="trip-1" isAdminView />);

    expect(screen.getByText('Transition Day Details')).toBeInTheDocument();
    expect(screen.getByText(/Departure from:/)).toBeInTheDocument();
    expect(screen.getByText(/Arrival to:/)).toBeInTheDocument();
    expect(screen.getAllByText(/Stay period:/)).toHaveLength(2);
    expect(screen.getByText('Hotel door code 1234')).toBeInTheDocument();
    expect(screen.getByText('Private side trip details')).toBeInTheDocument();
  });
});
