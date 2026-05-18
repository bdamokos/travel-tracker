import { buildTravelDataDeleteUrl } from '@/app/admin/components/TripList';

describe('TripList delete URL construction', () => {
  it('encodes trip IDs as query parameters before deletion', () => {
    expect(buildTravelDataDeleteUrl('victim&x=1')).toBe('/api/travel-data?id=victim%26x%3D1');
    expect(buildTravelDataDeleteUrl('victim#fragment')).toBe('/api/travel-data?id=victim%23fragment');
  });
});
