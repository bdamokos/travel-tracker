import { filterUpdatesForPublic } from '@/app/lib/updateFilters';

describe('filterUpdatesForPublic', () => {
  it('returns [] when updates is undefined', () => {
    expect(filterUpdatesForPublic(undefined, [], [])).toEqual([]);
  });

  it('keeps manual updates even when no names exist', () => {
    const updates = [
      { id: 'manual-1', createdAt: '2024-01-01T00:00:00.000Z', message: 'Hello world', kind: 'manual' as const },
      { id: 'auto-1', createdAt: '2024-01-01T00:00:00.000Z', message: 'Auto update without names' }
    ];

    expect(filterUpdatesForPublic(updates, [], [])).toEqual([updates[0]]);
  });

  it('keeps manual updates and auto updates that reference public names', () => {
    const updates = [
      { id: 'manual-1', createdAt: '2024-01-01T00:00:00.000Z', message: 'General announcement', kind: 'manual' as const },
      { id: 'auto-1', createdAt: '2024-01-01T00:00:00.000Z', message: 'New trip location added: London.' },
      { id: 'auto-2', createdAt: '2024-01-01T00:00:00.000Z', message: 'Something unrelated' }
    ];

    const locations = [{ name: 'London' }];
    const routes = [{ from: 'Paris', to: 'Berlin' }];

    expect(filterUpdatesForPublic(updates, locations, routes)).toEqual([updates[0], updates[1]]);
  });
});

