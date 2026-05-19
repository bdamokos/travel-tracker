import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RouteForm from '@/app/admin/components/RouteForm';
import type { TravelRoute } from '@/app/types';

type MockDatePickerProps = {
  id: string;
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
  name?: string;
};

type MockSelectProps = {
  id: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
  disabled?: boolean;
  name?: string;
};

type MockComboBoxProps = {
  id: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
};

function formatDateInputValue(date: Date | null): string {
  if (!date) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

jest.mock('@/app/admin/components/AccessibleDatePicker', () => {
  return function MockAccessibleDatePicker(props: MockDatePickerProps) {
    const currentValue = props.value ?? props.defaultValue ?? null;

    return (
      <input
        id={props.id}
        data-testid={props.id}
        name={props.name}
        type="date"
        value={formatDateInputValue(currentValue)}
        onChange={(event) => {
          const value = event.target.value;
          props.onChange?.(value ? new Date(`${value}T00:00:00`) : null);
        }}
        readOnly
      />
    );
  };
});

jest.mock('@/app/admin/components/AriaSelect', () => {
  return function MockAriaSelect(props: MockSelectProps) {
    return (
      <select
        id={props.id}
        data-testid={props.id}
        name={props.name}
        value={props.value ?? props.defaultValue ?? ''}
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
    const [uncontrolledValue, setUncontrolledValue] = useState(props.defaultValue ?? '');
    const isControlled = props.value !== undefined;
    const currentValue = isControlled ? props.value : uncontrolledValue;

    return (
      <input
        id={props.id}
        data-testid={props.id}
        name={props.name}
        value={currentValue}
        onChange={(event) => {
          if (!isControlled) {
            setUncontrolledValue(event.target.value);
          }
          props.onChange?.(event.target.value);
        }}
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

function RouteFormHarness({ onRouteAdded }: { onRouteAdded: (route: TravelRoute) => Promise<void> }) {
  const [currentRoute, setCurrentRoute] = useState<Partial<TravelRoute>>({
    transportType: 'plane',
    from: '',
    to: '',
    fromCoords: [0, 0],
    toCoords: [0, 0],
    date: new Date('2026-02-26T00:00:00.000Z'),
    notes: '',
    duration: '',
    privateNotes: '',
    costTrackingLinks: [],
    useManualRoutePoints: false,
    isReturn: false,
    doubleDistance: false
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
        { name: 'Quito', coordinates: [-0.220164, -78.5123274] }
      ]}
      onGeocode={undefined}
      tripId={undefined}
    />
  );
}

describe('RouteForm location reset', () => {
  it('clears top-level route location comboboxes after adding a route', async () => {
    const onRouteAdded = jest.fn(async () => {});

    render(<RouteFormHarness onRouteAdded={onRouteAdded} />);

    fireEvent.change(screen.getByTestId('route-from'), {
      target: { value: 'Cusco' }
    });
    fireEvent.change(screen.getByTestId('route-to'), {
      target: { value: 'Quito' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Route' }));

    await waitFor(() => expect(onRouteAdded).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('route-from')).toHaveValue('');
    expect(screen.getByTestId('route-to')).toHaveValue('');
  });
});
