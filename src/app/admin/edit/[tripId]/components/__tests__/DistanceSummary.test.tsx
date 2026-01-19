import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, jest } from '@jest/globals';
import DistanceSummary from '../DistanceSummary';
import { TravelRoute } from '@/app/types';

jest.mock('@/app/services/geocoding', () => ({
  calculateDistance: jest.fn((from: [number, number], to: [number, number]) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    return Math.sqrt(dx * dx + dy * dy) * 111; // Approximate km per degree
  })
}));

describe('DistanceSummary', () => {
  const mockRoute: TravelRoute = {
    id: 'route-1',
    from: 'New York',
    to: 'London',
    fromCoords: [40.7128, -74.0060],
    toCoords: [51.5074, -0.1278],
    transportType: 'plane',
    date: new Date('2025-01-15'),
    routePoints: []
  };

  describe('Simple Routes (no subRoutes)', () => {
    it('calculates distance using routePoints when available', () => {
      const routeWithPoints: TravelRoute = {
        ...mockRoute,
        routePoints: [
          [40.7128, -74.0060],
          [45.0, -60.0],
          [50.0, -30.0],
          [51.5074, -0.1278]
        ]
      };

      render(<DistanceSummary routes={[routeWithPoints]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
    });

    it('falls back to endpoint calculation when routePoints not available', () => {
      const routeWithoutPoints = {
        ...mockRoute,
        routePoints: undefined
      } as Partial<TravelRoute> as TravelRoute;

      render(<DistanceSummary routes={[routeWithoutPoints]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
    });

    it('handles routes with no coordinates gracefully', () => {
      const routeNoCoords = {
        ...mockRoute,
        fromCoords: undefined,
        toCoords: undefined,
        routePoints: undefined
      } as Partial<TravelRoute> as TravelRoute;

      render(<DistanceSummary routes={[routeNoCoords]} />);

      const totalDistance = screen.getByText(/Total distance/);
      expect(totalDistance).toBeInTheDocument();
    });

    it('handles routes with empty routePoints array', () => {
      const routeEmptyPoints: TravelRoute = {
        ...mockRoute,
        routePoints: []
      };

      render(<DistanceSummary routes={[routeEmptyPoints]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
    });

    it('handles routes with single point in routePoints', () => {
      const routeSinglePoint: TravelRoute = {
        ...mockRoute,
        routePoints: [[40.7128, -74.0060]]
      };

      render(<DistanceSummary routes={[routeSinglePoint]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
    });
  });

  describe('Routes with SubRoutes', () => {
    const routeWithSubRoutes: TravelRoute = {
      id: 'route-multi',
      from: 'New York',
      to: 'Paris',
      fromCoords: [40.7128, -74.0060],
      toCoords: [48.8566, 2.3522],
      transportType: 'plane',
      date: new Date('2025-01-15'),
      subRoutes: [
        {
          id: 'sub-1',
          from: 'New York',
          to: 'London',
          fromCoords: [40.7128, -74.0060],
          toCoords: [51.5074, -0.1278],
          transportType: 'plane',
          date: new Date('2025-01-15')
        },
        {
          id: 'sub-2',
          from: 'London',
          to: 'Paris',
          fromCoords: [51.5074, -0.1278],
          toCoords: [48.8566, 2.3522],
          transportType: 'plane',
          date: new Date('2025-01-16')
        }
      ]
    };

    it('calculates distance from subRoutes with routePoints', () => {
      const routeWithPoints: TravelRoute = {
        ...routeWithSubRoutes,
        subRoutes: [
          {
            ...routeWithSubRoutes.subRoutes![0],
            routePoints: [
              [40.7128, -74.0060],
              [45.0, -60.0],
              [51.5074, -0.1278]
            ]
          },
          {
            ...routeWithSubRoutes.subRoutes![1],
            routePoints: [
              [51.5074, -0.1278],
              [50.0, 1.0],
              [48.8566, 2.3522]
            ]
          }
        ]
      };

      render(<DistanceSummary routes={[routeWithPoints]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
      expect(screen.getByText(/2 routes/)).toBeInTheDocument();
    });

    it('falls back to endpoint calculation for subRoutes without routePoints', () => {
      render(<DistanceSummary routes={[routeWithSubRoutes]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
      expect(screen.getByText(/2 routes/)).toBeInTheDocument();
    });

    it('handles mixed subRoutes (some with routePoints, some without)', () => {
      const routeMixed: TravelRoute = {
        ...routeWithSubRoutes,
        subRoutes: [
          {
            ...routeWithSubRoutes.subRoutes![0],
            routePoints: [
              [40.7128, -74.0060],
              [45.0, -60.0],
              [51.5074, -0.1278]
            ]
          },
          {
            ...routeWithSubRoutes.subRoutes![1],
            routePoints: undefined
          } as Partial<TravelRoute> as TravelRoute
        ]
      };

      render(<DistanceSummary routes={[routeMixed]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
    });
  });

  describe('Multiple Routes of Different Types', () => {
    it('correctly aggregates distances by transportation type', () => {
      const routes: TravelRoute[] = [
        {
          ...mockRoute,
          id: 'route-1',
          transportType: 'plane',
          routePoints: [
            [40.7128, -74.0060],
            [51.5074, -0.1278]
          ]
        },
        {
          ...mockRoute,
          id: 'route-2',
          from: 'London',
          to: 'Paris',
          fromCoords: [51.5074, -0.1278],
          toCoords: [48.8566, 2.3522],
          transportType: 'train',
          routePoints: [
            [51.5074, -0.1278],
            [49.5, 1.0],
            [48.8566, 2.3522]
          ]
        },
        {
          ...mockRoute,
          id: 'route-3',
          from: 'Paris',
          to: 'Berlin',
          fromCoords: [48.8566, 2.3522],
          toCoords: [52.5200, 13.4050],
          transportType: 'train',
          routePoints: [
            [48.8566, 2.3522],
            [50.5, 8.0],
            [52.5200, 13.4050]
          ]
        }
      ];

      render(<DistanceSummary routes={routes} />);

      expect(screen.getByText(/Total distance across 3 routes/)).toBeInTheDocument();
      expect(screen.getByText(/By transportation type:/)).toBeInTheDocument();
      expect(screen.getByText(/Airplane/i)).toBeInTheDocument();
      expect(screen.getByText(/Train/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('returns null for empty routes array', () => {
      const { container } = render(<DistanceSummary routes={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('formats large distances correctly (>= 100 km)', () => {
      const longRoute: TravelRoute = {
        ...mockRoute,
        from: 'Sydney',
        to: 'Los Angeles',
        fromCoords: [-33.8688, 151.2093],
        toCoords: [34.0522, -118.2437],
        routePoints: [
          [-33.8688, 151.2093],
          [0.0, 120.0],
          [34.0522, -118.2437]
        ]
      };

      render(<DistanceSummary routes={[longRoute]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
      expect(screen.getAllByText(/km/).length).toBeGreaterThan(0);
    });

    it('formats small distances correctly (< 100 km)', () => {
      const shortRoute: TravelRoute = {
        ...mockRoute,
        from: 'Central Park',
        to: 'Brooklyn',
        fromCoords: [40.7829, -73.9654],
        toCoords: [40.6782, -73.9442],
        routePoints: [
          [40.7829, -73.9654],
          [40.7500, -73.9500],
          [40.6782, -73.9442]
        ]
      };

      render(<DistanceSummary routes={[shortRoute]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
      expect(screen.getAllByText(/km/).length).toBeGreaterThan(0);
    });
  });

  describe('Real-world Scenarios', () => {
    it('correctly handles ferry route with curved path', () => {
      const ferryRoute: TravelRoute = {
        ...mockRoute,
        transportType: 'ferry',
        routePoints: [
          [55.6761, 12.5683],
          [56.0, 11.0],
          [56.5, 10.0],
          [57.0, 9.0],
          [57.5, 8.5],
          [58.0, 8.0],
          [58.5, 8.0],
          [59.0, 8.0],
          [59.5, 8.0],
          [59.9, 10.0]
        ]
      };

      render(<DistanceSummary routes={[ferryRoute]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
      expect(screen.getByText(/ferry/i)).toBeInTheDocument();
    });

    it('handles complex multi-segment journey', () => {
      const complexRoute: TravelRoute = {
        id: 'complex',
        from: 'San Francisco',
        to: 'Tokyo',
        fromCoords: [37.7749, -122.4194],
        toCoords: [35.6762, 139.6503],
        transportType: 'plane',
        date: new Date('2025-02-01'),
        subRoutes: [
          {
            id: 'sub-1',
            from: 'San Francisco',
            to: 'Hawaii',
            fromCoords: [37.7749, -122.4194],
            toCoords: [21.3069, -157.8583],
            transportType: 'plane',
            date: new Date('2025-02-01'),
            routePoints: [
              [37.7749, -122.4194],
              [30.0, -140.0],
              [21.3069, -157.8583]
            ]
          },
          {
            id: 'sub-2',
            from: 'Hawaii',
            to: 'Tokyo',
            fromCoords: [21.3069, -157.8583],
            toCoords: [35.6762, 139.6503],
            transportType: 'plane',
            date: new Date('2025-02-02'),
            routePoints: [
              [21.3069, -157.8583],
              [28.0, 0.0],
              [35.6762, 139.6503]
            ]
          }
        ]
      };

      render(<DistanceSummary routes={[complexRoute]} />);

      expect(screen.getByText(/Total distance across 1 route/)).toBeInTheDocument();
      expect(screen.getByText(/2 routes/)).toBeInTheDocument();
    });
  });
});
