import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, jest } from '@jest/globals';
import { TravelData, TravelRoute } from '@/app/types';

jest.mock('../DistanceSummary', () => ({
  __esModule: true,
  default: () => <div>Distance summary</div>
}));

jest.mock('@/app/admin/components/RouteForm', () => ({
  __esModule: true,
  default: () => <div>Route form</div>
}));

jest.mock('@/app/admin/components/InPlaceEditor', () => ({
  __esModule: true,
  default: ({ data, children }: { data: TravelRoute; children: (data: TravelRoute, isEditing: boolean, onEdit: () => void) => ReactNode }) => (
    <>{children(data, false, jest.fn())}</>
  )
}));

jest.mock('@/app/admin/components/RouteDisplay', () => ({
  __esModule: true,
  default: ({ route }: { route: TravelRoute }) => (
    <div>{`Route details: ${route.from} -> ${route.to}`}</div>
  )
}));

jest.mock('@/app/admin/components/RouteInlineEditor', () => ({
  __esModule: true,
  default: () => <div>Route inline editor</div>
}));

jest.mock('@/app/admin/components/LinkedExpensesDisplay', () => ({
  __esModule: true,
  default: () => <div>Linked expenses</div>
}));

jest.mock('@/app/hooks/useExpenseLinks', () => ({
  useExpenseLinksForTravelItem: () => ({
    expenseLinks: [],
    isLoading: false
  })
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RouteManager = require('../RouteManager').default as typeof import('../RouteManager').default;

describe('RouteManager', () => {
  const baseTravelData: TravelData = {
    id: 'trip-1',
    title: 'South America',
    description: '',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-10'),
    locations: [
      {
        id: 'loc-1',
        name: 'Quito',
        coordinates: [0, 0],
        date: new Date('2026-01-01'),
        notes: '',
        instagramPosts: [],
        tikTokPosts: [],
        blogPosts: [],
        accommodationIds: [],
        costTrackingLinks: []
      }
    ],
    accommodations: [],
    routes: [
      {
        id: 'route-1',
        from: 'Quito',
        to: 'Lima',
        fromCoords: [0, 0],
        toCoords: [1, 1],
        transportType: 'plane',
        date: new Date('2026-01-02'),
        notes: '',
        privateNotes: '',
        costTrackingLinks: []
      }
    ]
  };

  const defaultProps = {
    travelData: baseTravelData,
    setTravelData: jest.fn(),
    setHasUnsavedChanges: jest.fn(),
    currentRoute: {},
    setCurrentRoute: jest.fn(),
    editingRouteIndex: null,
    setEditingRouteIndex: jest.fn(),
    handleRouteAdded: jest.fn(async () => {}),
    geocodeLocation: jest.fn(async () => [0, 0] as [number, number]),
    deleteRoute: jest.fn(),
    recalculateRoutePoints: jest.fn(),
    generateMap: jest.fn(),
    tripId: 'trip-1'
  };

  it('renders route cards without native details elements', () => {
    const { container } = render(<RouteManager {...defaultProps} />);

    expect(container.querySelector('details')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quito → Lima/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles route content from the disclosure button', () => {
    render(<RouteManager {...defaultProps} />);

    expect(screen.queryByText('Route details: Quito -> Lima')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Quito → Lima/i }));

    expect(screen.getByText('Route details: Quito -> Lima')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quito → Lima/i })).toHaveAttribute('aria-expanded', 'true');
  });
});
