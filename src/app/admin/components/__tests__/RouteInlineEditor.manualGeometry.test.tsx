import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RouteInlineEditor from '@/app/admin/components/RouteInlineEditor';
import type { TravelRoute } from '@/app/types';

jest.mock('../AriaSelect', () => ({
  __esModule: true,
  default: ({
    id,
    value,
    onChange,
    options,
    disabled
  }: {
    id?: string;
    value?: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    disabled?: boolean;
  }) => (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}));

jest.mock('../AriaComboBox', () => ({
  __esModule: true,
  default: ({
    id,
    value,
    onChange,
    disabled
  }: {
    id?: string;
    value?: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <input
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}));

jest.mock('../AccessibleDatePicker', () => ({
  __esModule: true,
  default: ({ value }: { value?: Date | null }) => (
    <input readOnly aria-label="Date" value={value?.toISOString?.().slice(0, 10) ?? ''} />
  )
}));

jest.mock('../CostTrackingLinksManager', () => ({
  __esModule: true,
  default: () => <div>Cost links</div>
}));

const baseRoute: TravelRoute = {
  id: 'route-1',
  from: 'Start',
  to: 'End',
  fromCoords: [10, 20],
  toCoords: [30, 40],
  transportType: 'car',
  date: new Date('2026-01-02T00:00:00.000Z'),
  duration: '',
  notes: '',
  privateNotes: '',
  costTrackingLinks: [],
  isReturn: false,
  doubleDistance: false
};

describe('RouteInlineEditor manual route geometry', () => {
  const locationOptions = [
    { name: 'Start', coordinates: [10, 20] as [number, number] },
    { name: 'End', coordinates: [30, 40] as [number, number] }
  ];

  it('lets users keep simple-route manual geometry when endpoint coordinates change', async () => {
    const onSave = jest.fn();
    const routePoints: [number, number][] = [[10, 20], [15, 25], [30, 40]];
    render(
      <RouteInlineEditor
        route={{
          ...baseRoute,
          routePoints,
          useManualRoutePoints: true
        }}
        onSave={onSave}
        onCancel={jest.fn()}
        locationOptions={locationOptions}
      />
    );

    fireEvent.change(screen.getByLabelText('From latitude'), { target: { value: '11' } });
    expect(screen.getByText('Route endpoints no longer match the manual route.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Keep as is'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      fromCoords: [11, 20],
      routePoints,
      useManualRoutePoints: true
    }));
  });

  it('can extend simple-route manual geometry to changed endpoint coordinates', async () => {
    const onSave = jest.fn();
    render(
      <RouteInlineEditor
        route={{
          ...baseRoute,
          routePoints: [[10, 20], [15, 25], [30, 40]],
          useManualRoutePoints: true
        }}
        onSave={onSave}
        onCancel={jest.fn()}
        locationOptions={locationOptions}
      />
    );

    fireEvent.change(screen.getByLabelText('From latitude'), { target: { value: '11' } });
    fireEvent.click(screen.getByText('Extend to endpoints'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      fromCoords: [11, 20],
      useManualRoutePoints: true
    }));
    expect(onSave.mock.calls[0][0].routePoints[0]).toEqual([11, 20]);
    expect(onSave.mock.calls[0][0].routePoints.length).toBeGreaterThan(3);
  });

  it('can clear sub-route manual geometry when segment endpoint coordinates change', async () => {
    const onSave = jest.fn();
    render(
      <RouteInlineEditor
        route={{
          ...baseRoute,
          transportType: 'multimodal',
          subRoutes: [{
            id: 'segment-1',
            from: 'Start',
            to: 'End',
            fromCoords: [10, 20],
            toCoords: [30, 40],
            transportType: 'car',
            date: new Date('2026-01-02T00:00:00.000Z'),
            duration: '',
            distanceOverride: undefined,
            notes: '',
            privateNotes: '',
            costTrackingLinks: [],
            isReturn: false,
            doubleDistance: false,
            routePoints: [[10, 20], [15, 25], [30, 40]],
            useManualRoutePoints: true
          }]
        }}
        onSave={onSave}
        onCancel={jest.fn()}
        locationOptions={locationOptions}
      />
    );

    fireEvent.change(screen.getByLabelText('To longitude'), { target: { value: '41' } });
    expect(screen.getByText('Segment endpoints no longer match the manual route.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear manual route'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    expect(onSave.mock.calls[0][0].subRoutes[0]).toEqual(expect.objectContaining({
      toCoords: [30, 41],
      routePoints: undefined,
      useManualRoutePoints: false
    }));
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      toCoords: [30, 41],
      routePoints: undefined,
      useManualRoutePoints: false
    }));
  });
});
