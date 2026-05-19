import React, { act, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RouteForm from '@/app/admin/components/RouteForm';
import type { TravelRoute } from '@/app/types';

type MockDatePickerProps = {
  id: string;
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
  'aria-labelledby'?: string;
};

type MockSelectProps = {
  id: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
  disabled?: boolean;
};

type MockComboBoxProps = {
  id: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
};

function dateInputValueToLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

jest.mock('@/app/admin/components/AccessibleDatePicker', () => {
  return function MockAccessibleDatePicker(props: MockDatePickerProps) {
    const currentValue = props.value ?? props.defaultValue ?? null;
    const value = currentValue
      ? [
          currentValue.getFullYear(),
          String(currentValue.getMonth() + 1).padStart(2, '0'),
          String(currentValue.getDate()).padStart(2, '0')
        ].join('-')
      : '';

    return (
      <input
        id={props.id}
        data-testid={props.id}
        type="date"
        value={value}
        aria-labelledby={props['aria-labelledby']}
        onChange={(event) => {
          props.onChange?.(event.target.value ? dateInputValueToLocalDate(event.target.value) : null);
        }}
      />
    );
  };
});

jest.mock('@/app/admin/components/AriaSelect', () => {
  return function MockAriaSelect(props: MockSelectProps) {
    const selectValue = props.value ?? props.defaultValue ?? '';

    return (
      <select
        id={props.id}
        data-testid={props.id}
        value={selectValue}
        onChange={(event) => props.onChange?.(event.target.value)}
        disabled={props.disabled}
      >
        {(props.options || []).map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };
});

jest.mock('@/app/admin/components/AriaComboBox', () => {
  return function MockAriaComboBox(props: MockComboBoxProps) {
    return (
      <input
        id={props.id}
        data-testid={props.id}
        value={props.value ?? props.defaultValue ?? ''}
        onChange={(event) => props.onChange?.(event.target.value)}
        disabled={props.disabled}
      />
    );
  };
});

jest.mock('@/app/admin/components/CostTrackingLinksManager', () => {
  return function MockCostTrackingLinksManager() {
    return <div data-testid="mock-cost-tracking-links" />;
  };
});

type RouteFormHarnessProps = {
  initialRoute?: Partial<TravelRoute>;
  onRouteAdded?: (route: TravelRoute) => Promise<void>;
  onGeocode?: (locationName: string) => Promise<[number, number]>;
};

function RouteFormHarness({
  initialRoute,
  onRouteAdded = async () => {},
  onGeocode
}: RouteFormHarnessProps) {
  const [currentRoute, setCurrentRoute] = useState<Partial<TravelRoute>>(initialRoute ?? {
    id: 'route-1',
    transportType: 'plane',
    from: 'Cusco',
    to: 'Quito',
    fromCoords: [-13.517887, -71.978536],
    toCoords: [-0.220164, -78.5123274],
    date: new Date('2026-02-26T00:00:00.000Z'),
    notes: '',
    duration: '',
    privateNotes: '',
    costTrackingLinks: [],
    useManualRoutePoints: false,
    isReturn: false,
    doubleDistance: false,
    subRoutes: [
      {
        id: 'segment-1',
        from: 'Cusco',
        to: 'Quito',
        fromCoords: [-13.517887, -71.978536],
        toCoords: [-0.220164, -78.5123274],
        transportType: 'plane',
        date: new Date('2026-02-26T00:00:00.000Z'),
        duration: '',
        notes: '',
        privateNotes: '',
        costTrackingLinks: [],
        useManualRoutePoints: false,
        isReturn: false,
        doubleDistance: false
      }
    ]
  });

  return (
    <RouteForm
      currentRoute={currentRoute}
      setCurrentRoute={setCurrentRoute}
      onRouteAdded={onRouteAdded}
      editingRouteIndex={null}
      setEditingRouteIndex={() => {}}
      locationOptions={[
        { name: 'Cusco', coordinates: [-13.517887, -71.978536] },
        { name: 'Quito', coordinates: [-0.220164, -78.5123274] },
        { name: 'Lima', coordinates: [-12.046374, -77.042793] }
      ]}
      onGeocode={onGeocode}
      tripId={undefined}
    />
  );
}

describe('RouteForm sub-route coordinates', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not apply stale async geocode results after a sub-route endpoint changes again', async () => {
    jest.useFakeTimers();
    let resolveFirstGeocode: ((coords: [number, number]) => void) | undefined;
    let resolveSecondGeocode: ((coords: [number, number]) => void) | undefined;
    const onGeocode = jest.fn((locationName: string) => new Promise<[number, number]>((resolve) => {
      if (locationName === 'Old Custom') {
        resolveFirstGeocode = resolve;
      }
      if (locationName === 'New Custom') {
        resolveSecondGeocode = resolve;
      }
    }));

    render(<RouteFormHarness onGeocode={onGeocode} />);

    fireEvent.change(screen.getByTestId('sub-route-from-segment-1'), {
      target: { value: 'Old Custom' }
    });

    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    await waitFor(() => expect(onGeocode).toHaveBeenCalledWith('Old Custom'));

    fireEvent.change(screen.getByTestId('sub-route-from-segment-1'), {
      target: { value: 'New Custom' }
    });

    await act(async () => {
      resolveFirstGeocode?.([10, 20]);
    });

    expect(screen.getByLabelText('From latitude')).toHaveValue(0);
    expect(screen.getByLabelText('From longitude')).toHaveValue(0);

    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    await waitFor(() => expect(onGeocode).toHaveBeenCalledWith('New Custom'));

    await act(async () => {
      resolveSecondGeocode?.([30, 40]);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('From latitude')).toHaveValue(30);
      expect(screen.getByLabelText('From longitude')).toHaveValue(40);
    });
  });

  it('rejects composite route submission while a sub-route has zero coordinates', async () => {
    const onRouteAdded = jest.fn(async () => {});

    render(
      <RouteFormHarness
        initialRoute={{
          id: 'route-1',
          transportType: 'plane',
          from: 'Cusco',
          to: 'Quito',
          fromCoords: [-13.517887, -71.978536],
          toCoords: [-0.220164, -78.5123274],
          date: new Date('2026-02-26T00:00:00.000Z'),
          notes: '',
          duration: '',
          privateNotes: '',
          costTrackingLinks: [],
          useManualRoutePoints: false,
          isReturn: false,
          doubleDistance: false,
          subRoutes: [
            {
              id: 'segment-1',
              from: 'Cusco',
              to: 'Quito',
              fromCoords: [-13.517887, -71.978536],
              toCoords: [0, 0],
              transportType: 'plane',
              date: new Date('2026-02-26T00:00:00.000Z'),
              duration: '',
              notes: '',
              privateNotes: '',
              costTrackingLinks: [],
              useManualRoutePoints: false,
              isReturn: false,
              doubleDistance: false
            }
          ]
        }}
        onRouteAdded={onRouteAdded}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Route' }));

    await waitFor(() => {
      expect(screen.getByText('Segment 1: Please set valid coordinates for both endpoints.')).toBeInTheDocument();
      expect(onRouteAdded).not.toHaveBeenCalled();
    });
  });
});
