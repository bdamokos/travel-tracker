import { mergeLocationVisits, type VisitLocation } from '@/app/lib/locationVisitUtils';

const buildLocation = (overrides: Partial<VisitLocation>): VisitLocation => ({
  id: overrides.id ?? 'loc-1',
  name: overrides.name ?? 'Lisbon',
  coordinates: overrides.coordinates ?? [38.7223, -9.1393],
  date: overrides.date ?? '2024-01-01',
  endDate: overrides.endDate,
  notes: overrides.notes,
  wikipediaRef: overrides.wikipediaRef,
  instagramPosts: overrides.instagramPosts,
  tikTokPosts: overrides.tikTokPosts,
  blogPosts: overrides.blogPosts,
});

describe('mergeLocationVisits', () => {
  it('merges repeat visits by normalized name + coordinates and keeps visits ordered by date', () => {
    const merged = mergeLocationVisits([
      buildLocation({ id: 'lis-2', name: ' lisbon ', date: '2024-04-10' }),
      buildLocation({ id: 'porto-1', name: 'Porto', coordinates: [41.1579, -8.6291], date: '2024-02-01' }),
      buildLocation({ id: 'lis-1', name: 'LISBON', date: '2024-01-05' }),
    ]);

    expect(merged).toHaveLength(2);

    const lisbon = merged.find(group => group.name === 'LISBON');
    expect(lisbon?.visits.map(visit => visit.id)).toEqual(['lis-1', 'lis-2']);
    expect(lisbon?.coordinates).toEqual([38.7223, -9.1393]);

    expect(merged.map(group => group.visits[0].id)).toEqual(['lis-1', 'porto-1']);
  });

  it('does not merge same name locations when rounded coordinates differ', () => {
    const merged = mergeLocationVisits([
      buildLocation({ id: 'tokyo-a', name: 'Tokyo', coordinates: [35.6895, 139.6917] }),
      buildLocation({ id: 'tokyo-b', name: 'Tokyo', coordinates: [35.6907, 139.6929] }),
    ]);

    expect(merged).toHaveLength(2);
  });

  it('returns an empty array when no locations are provided', () => {
    expect(mergeLocationVisits([])).toEqual([]);
  });

  it('does not merge different names at the same coordinates', () => {
    const merged = mergeLocationVisits([
      buildLocation({ id: 'a', name: 'Lisbon', coordinates: [38.7223, -9.1393] }),
      buildLocation({ id: 'b', name: 'Porto', coordinates: [38.7223, -9.1393] }),
    ]);

    expect(merged).toHaveLength(2);
  });

  it('sorts invalid visit dates to the end of a merged visit list', () => {
    const merged = mergeLocationVisits([
      buildLocation({ id: 'lis-invalid', name: 'Lisbon', date: 'not-a-date' }),
      buildLocation({ id: 'lis-valid', name: 'Lisbon', date: '2024-01-02' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].visits.map(visit => visit.id)).toEqual(['lis-valid', 'lis-invalid']);
  });

  it('returns a single merged group for a single location', () => {
    const merged = mergeLocationVisits([
      buildLocation({ id: 'single', name: 'Tokyo', coordinates: [35.6895, 139.6917] }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Tokyo');
    expect(merged[0].visits).toHaveLength(1);
  });
});
