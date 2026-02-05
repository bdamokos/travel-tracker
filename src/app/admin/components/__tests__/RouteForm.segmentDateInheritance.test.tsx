import React, { useState } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

jest.mock('@/app/admin/components/AccessibleDatePicker', () => {
  return function MockAccessibleDatePicker(props: MockDatePickerProps) {
    const currentValue = props.value ?? props.defaultValue ?? null;
    const value = currentValue ? currentValue.toISOString().slice(0, 10) : '';

    return (
      <input
        id={props.id}
        data-testid={props.id}
        type="date"
        value={value}
        aria-labelledby={props['aria-labelledby']}
        onChange={(event) => {
          props.onChange?.(event.target.value ? new Date(`${event.target.value}T00:00:00.000Z`) : null);
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

function RouteFormHarness({ initialDate }: { initialDate: Date }) {
  const [currentRoute, setCurrentRoute] = useState<Partial<TravelRoute>>({
    transportType: 'plane',
    from: 'Cusco',
    to: 'Quito',
    fromCoords: [-13.517887, -71.978536],
    toCoords: [-0.220164, -78.5123274],
    date: initialDate,
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

describe('RouteForm segment date inheritance', () => {
  it('uses the current route date when adding the first segment', async () => {
    const user = userEvent.setup();
    const { container } = render(<RouteFormHarness initialDate={new Date('2026-02-05T00:00:00.000Z')} />);

    fireEvent.change(screen.getByTestId('route-date'), {
      target: { value: '2026-02-26' }
    });

    await user.click(screen.getByRole('button', { name: 'Add segment' }));

    await waitFor(() => {
      const segmentDateInputs = container.querySelectorAll('input[data-testid^="sub-route-date-"]');
      expect(segmentDateInputs).toHaveLength(1);
      expect((segmentDateInputs[0] as HTMLInputElement).value).toBe('2026-02-26');
    });
  });

  it('uses the previous segment date when adding subsequent segments', async () => {
    const user = userEvent.setup();
    const { container } = render(<RouteFormHarness initialDate={new Date('2026-02-26T00:00:00.000Z')} />);

    await user.click(screen.getByRole('button', { name: 'Add segment' }));

    await waitFor(() => {
      const firstSegmentDateInput = container.querySelector('input[data-testid^="sub-route-date-"]') as HTMLInputElement | null;
      expect(firstSegmentDateInput).not.toBeNull();
      expect(firstSegmentDateInput?.value).toBe('2026-02-26');
    });

    const firstSegmentDateInput = container.querySelector('input[data-testid^="sub-route-date-"]') as HTMLInputElement;
    fireEvent.change(firstSegmentDateInput, {
      target: { value: '2026-02-28' }
    });

    await user.click(screen.getByRole('button', { name: 'Add segment' }));

    await waitFor(() => {
      const segmentDateInputs = container.querySelectorAll('input[data-testid^="sub-route-date-"]');
      expect(segmentDateInputs).toHaveLength(2);
      expect((segmentDateInputs[1] as HTMLInputElement).value).toBe('2026-02-28');
    });
  });
});
