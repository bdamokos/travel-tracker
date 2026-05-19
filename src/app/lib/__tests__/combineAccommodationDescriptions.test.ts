import { combineAccommodationDescriptions } from '@/app/lib/combineAccommodationDescriptions';

describe('combineAccommodationDescriptions', () => {
  it('returns names unchanged when there is no legacy accommodation', () => {
    expect(combineAccommodationDescriptions(['A', 'B'], undefined)).toEqual(['A', 'B']);
  });

  it('adds legacy accommodation when provided', () => {
    expect(combineAccommodationDescriptions(['A'], 'Legacy place')).toEqual(['A', 'Legacy place']);
  });

  it('deduplicates case-insensitively while preserving order', () => {
    expect(combineAccommodationDescriptions(['Hostel', 'Hotel'], 'hostel')).toEqual(['Hostel', 'Hotel']);
  });

  it('trims and ignores empty values', () => {
    expect(combineAccommodationDescriptions(['  A  ', ''], '   ')).toEqual(['A']);
  });

  it('ignores malformed accommodation names without dropping valid values', () => {
    expect(
      combineAccommodationDescriptions([
        'Hotel',
        null,
        undefined,
        { name: 'bad shape' },
        42,
        '  Guesthouse  '
      ], 'Legacy place')
    ).toEqual(['Hotel', 'Guesthouse', 'Legacy place']);
  });

  it('ignores malformed legacy accommodation data', () => {
    expect(combineAccommodationDescriptions(['Hotel'], { text: 'Legacy place' })).toEqual(['Hotel']);
  });
});
