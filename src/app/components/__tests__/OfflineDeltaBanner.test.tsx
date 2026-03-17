/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OfflineDeltaBanner from '@/app/components/OfflineDeltaBanner';
import {
  getOfflineQueueEntries,
  queueTravelDelta,
  syncOfflineDeltaQueue
} from '@/app/lib/offlineDeltaSync';
import type { TravelData } from '@/app/types';

const makeTravelData = (overrides: Partial<TravelData> = {}): TravelData => ({
  id: 'trip-conflict-1',
  title: 'Base Trip',
  description: 'Base Description',
  startDate: new Date('2026-01-10'),
  endDate: new Date('2026-01-20'),
  instagramUsername: '',
  locations: [],
  routes: [],
  accommodations: [],
  ...overrides
});

describe('OfflineDeltaBanner', () => {
  const makeResponse = <T,>(payload: T, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  });

  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('lets the user discard a stored conflict from the top banner', async () => {
    const base = makeTravelData();
    const pending = makeTravelData({ title: 'Offline Title Change' });
    const serverChanged = makeTravelData({ description: 'Server changed while offline' });

    queueTravelDelta({
      id: base.id || 'trip-conflict-1',
      baseSnapshot: base,
      pendingSnapshot: pending
    });

    global.fetch = jest.fn().mockResolvedValueOnce(makeResponse(serverChanged)) as unknown as typeof fetch;
    await syncOfflineDeltaQueue();

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(<OfflineDeltaBanner />);

    expect(await screen.findByText(/could not be synced because server data changed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /review conflicts/i }));
    expect(await screen.findByText(/travel map: trip-conflict-1/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss warning/i }));

    await waitFor(() => {
      expect(screen.queryByText(/could not be synced because server data changed/i)).not.toBeInTheDocument();
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      'Discard the queued offline change for travel "trip-conflict-1"? This cannot be undone.'
    );
    expect(getOfflineQueueEntries()).toHaveLength(0);

    confirmSpy.mockRestore();
  });
});
