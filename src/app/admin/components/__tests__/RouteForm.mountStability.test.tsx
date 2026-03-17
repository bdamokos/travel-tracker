import React, { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, jest } from '@jest/globals';
import type { TravelRoute } from '@/app/types';

type MockDatePickerProps = {
  id: string;
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
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

jest.mock('@/app/admin/components/AccessibleDatePicker', () => {
  return function MockAccessibleDatePicker(props: MockDatePickerProps) {
    const { id, value, defaultValue, onChange } = props;
    const currentValue = value ?? defaultValue ?? null;

    useEffect(() => {
      onChange?.(currentValue);
    }, [currentValue, onChange]);

    return (
      <input
        id={id}
        data-testid={id}
        type="date"
        value={currentValue ? currentValue.toISOString().slice(0, 10) : ''}
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
    const { id, value, defaultValue, onChange, disabled } = props;
    const currentValue = value ?? defaultValue ?? '';

    useEffect(() => {
      onChange?.(currentValue);
    }, [currentValue, onChange]);

    return (
      <input
        id={id}
        data-testid={id}
        value={currentValue}
        disabled={disabled}
        readOnly
      />
    );
  };
});

jest.mock('@/app/admin/components/CostTrackingLinksManager', () => {
  return function MockCostTrackingLinksManager() {
    return <div data-testid="mock-cost-tracking-links" />;
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RouteForm = require('@/app/admin/components/RouteForm').default as typeof import('@/app/admin/components/RouteForm').default;

function RouteFormHarness() {
  const [currentRoute, setCurrentRoute] = useState<Partial<TravelRoute>>({
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
    doubleDistance: false
  });

  return (
    <RouteForm
      currentRoute={currentRoute}
      setCurrentRoute={setCurrentRoute}
      onRouteAdded={async () => {}}
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

describe('RouteForm mount stability', () => {
  it('ignores same-value child callbacks on mount', () => {
    expect(() => render(<RouteFormHarness />)).not.toThrow();

    expect(screen.getByTestId('route-date')).toHaveValue('2026-02-26');
    expect(screen.getByTestId('route-from')).toHaveValue('Cusco');
    expect(screen.getByTestId('route-to')).toHaveValue('Quito');
  });
});
