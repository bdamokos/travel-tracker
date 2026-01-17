import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import MapView from '@/app/components/Map';
import type { Journey, Location } from '@/app/types';

expect.extend(toHaveNoViolations);

jest.mock('@/app/hooks/useWeather', () => ({
  useWeather: () => ({ data: null, loading: false }),
}));

jest.mock('@/app/hooks/useWikipediaData', () => ({
  useWikipediaData: () => ({ data: null, loading: false, error: null }),
}));

jest.mock('@/app/components/LocationPopup/TripContextSection', () => ({
  __esModule: true,
  default: () => <div>Trip context</div>,
}));

jest.mock('@/app/components/LocationPopup/WikipediaSection', () => ({
  __esModule: true,
  default: () => <div>Wikipedia</div>,
}));

jest.mock('@/app/components/Weather/WeatherSummary', () => ({
  __esModule: true,
  default: () => <div>Weather</div>,
}));

const makeLocation = (overrides: Partial<Location> = {}): Location => ({
  id: overrides.id ?? `loc-${Math.random().toString(16).slice(2)}`,
  name: overrides.name ?? 'London',
  coordinates: overrides.coordinates ?? [51.5074, -0.1278],
  date: overrides.date ?? new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

const makeJourney = (locations: Location[]): Journey => ({
  id: 'journey-a11y',
  title: 'Accessibility Test Trip',
  startDate: new Date('2024-01-01T00:00:00.000Z'),
  endDate: new Date('2024-01-10T00:00:00.000Z'),
  days: [
    {
      id: 'day-1',
      date: new Date('2024-01-01T00:00:00.000Z'),
      title: 'Day 1',
      locations,
    },
  ],
});

const getMapStatusRegion = () => {
  const statusRegions = screen.queryAllByRole('status');
  return statusRegions.find(region => !region.closest('[role="dialog"]')) ?? null;
};

const dispatchKeyDown = (element: HTMLElement, key: string, options: Partial<KeyboardEventInit> = {}) => {
  element.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    })
  );
};

describe('Map accessibility', () => {
  it('has no basic axe violations for the map container', async () => {
    const journey = makeJourney([
      makeLocation({ id: 'loc-london', name: 'London', coordinates: [51.5074, -0.1278] }),
      makeLocation({ id: 'loc-paris', name: 'Paris', coordinates: [48.8566, 2.3522], date: new Date('2024-01-02T00:00:00.000Z') }),
    ]);

    const { container } = render(<MapView journey={journey} />);

    expect(
      screen.getByRole('application', { name: /interactive travel map for accessibility test trip/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/keyboard controls:/i)).toBeInTheDocument();
    expect(getMapStatusRegion()).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('supports keyboard navigation between markers and announces movements', async () => {
    const journey = makeJourney([
      makeLocation({ id: 'loc-london', name: 'London', coordinates: [51.5074, -0.1278] }),
      makeLocation({ id: 'loc-paris', name: 'Paris', coordinates: [48.8566, 2.3522], date: new Date('2024-01-02T00:00:00.000Z') }),
    ]);

    render(<MapView journey={journey} />);

    const map = screen.getByRole('application', { name: /interactive travel map for accessibility test trip/i });

    act(() => {
      map.focus();
    });
    expect(document.activeElement).toBe(map);

    // First Tab from the map container focuses the first marker in the computed focus order.
    act(() => {
      dispatchKeyDown(map, 'Tab');
    });
    await waitFor(() => {
      expect(document.activeElement).toBeInstanceOf(HTMLButtonElement);
    });
    const firstFocused = document.activeElement as HTMLElement;
    const firstLabel = firstFocused.getAttribute('aria-label') ?? '';
    expect(firstLabel).toMatch(/london|paris/i);
    await waitFor(() => expect(getMapStatusRegion()).toHaveTextContent(/focused on/i));
    await act(async () => {});

    act(() => {
      dispatchKeyDown(firstFocused, 'Tab');
    });
    await waitFor(() => {
      const active = document.activeElement as HTMLElement;
      expect(active).toBeInstanceOf(HTMLButtonElement);
      const label = active.getAttribute('aria-label') ?? '';
      expect(label).toMatch(/london|paris/i);
      expect(label).not.toBe(firstLabel);
    });
    const secondFocused = document.activeElement as HTMLElement;
    const secondLabel = secondFocused.getAttribute('aria-label') ?? '';
    expect(secondLabel).toMatch(/london|paris/i);
    expect(secondLabel).not.toBe(firstLabel);

    expect(getMapStatusRegion()).toHaveTextContent(/focused on/i);

    fireEvent.keyDown(map, { key: 'ArrowRight' });
    await waitFor(() => expect(getMapStatusRegion()).toHaveTextContent(/map moved east/i));

    fireEvent.keyDown(map, { key: '+' });
    await waitFor(() => expect(getMapStatusRegion()).toHaveTextContent(/zoom level/i));
  });

  it('opens a location popup via keyboard and restores focus when closed', async () => {
    const journey = makeJourney([
      makeLocation({ id: 'loc-london', name: 'London', coordinates: [51.5074, -0.1278] }),
    ]);

    render(<MapView journey={journey} />);

    const marker = screen.getByRole('button', { name: /london/i });

    await waitFor(() => {
      act(() => {
        marker.focus();
      });
      expect(document.activeElement).toBe(marker);
    });

    act(() => {
      dispatchKeyDown(marker, 'Enter');
    });
    await waitFor(() => expect(getMapStatusRegion()).toHaveTextContent(/opened popup/i));
    const dialog = await screen.findByRole('dialog', { name: /london/i });
    expect(dialog).toBeInTheDocument();

    const close = screen.getByRole('button', { name: /close modal/i });
    fireEvent.click(close);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => {
      const active = document.activeElement as HTMLElement | null;
      expect(active).toBeInstanceOf(HTMLButtonElement);
      expect(active?.getAttribute('aria-label') ?? '').toMatch(/london/i);
    });
  });

  it('supports grouped markers: expand, navigate, and collapse via keyboard', async () => {
    const sharedCoords: [number, number] = [51.5074, -0.1278];
    const journey = makeJourney([
      makeLocation({ id: 'loc-a', name: 'London', coordinates: sharedCoords }),
      makeLocation({ id: 'loc-b', name: 'Paris', coordinates: sharedCoords, date: new Date('2024-01-02T00:00:00.000Z') }),
    ]);

    render(<MapView journey={journey} />);

    const collapse = await screen.findByRole('button', { name: /collapse group of 2 locations/i });

    await waitFor(() => {
      act(() => {
        collapse.focus();
      });
      expect(document.activeElement).toBe(collapse);
    });

    act(() => {
      dispatchKeyDown(collapse, 'Enter');
    });
    await waitFor(() =>
      expect(getMapStatusRegion()).toHaveTextContent(/collapsed 2 locations back to group marker/i)
    );

    const group = await screen.findByRole('button', { name: /group of 2 locations\. activate to expand\./i });

    await waitFor(() => {
      act(() => {
        group.focus();
      });
      expect(document.activeElement).toBe(group);
    });

    act(() => {
      dispatchKeyDown(group, 'Enter');
    });
    await waitFor(() => expect(getMapStatusRegion()).toHaveTextContent(/expanded group of 2 locations/i));
  });
});
