import {
  clearCachedTravelData,
  getCachedTravelData,
  setCachedTravelData
} from '@/app/lib/travelDataCache';
import { TravelData } from '@/app/types';

const buildTravelData = (id: string): TravelData => ({
  id,
  title: 'Test Trip',
  description: 'Trip description',
  startDate: '2026-03-01' as unknown as Date,
  endDate: '2026-03-05' as unknown as Date,
  instagramUsername: 'testtrip',
  locations: [],
  routes: [],
  accommodations: []
});

describe('travelDataCache', () => {
  beforeEach(() => {
    clearCachedTravelData('trip-1');
    window.sessionStorage.clear();
  });

  it('stores and reads cached travel data by id', () => {
    const travelData = buildTravelData('trip-1');

    setCachedTravelData(travelData);

    expect(getCachedTravelData('trip-1')).toEqual(travelData);
  });

  it('restores cached data from sessionStorage after memory cache is cleared', () => {
    const travelData = buildTravelData('trip-1');

    setCachedTravelData(travelData);
    clearCachedTravelData('trip-1');
    window.sessionStorage.setItem(
      'travel-tracker-trip-cache:trip-1',
      JSON.stringify(travelData)
    );

    expect(getCachedTravelData('trip-1')).toEqual(travelData);
  });
});
