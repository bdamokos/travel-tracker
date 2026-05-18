import { join } from 'path';
import { readFile } from 'fs/promises';
import { getDataDir } from '@/app/lib/dataDirectory';
import type { ShadowTrip } from '@/app/types';

const SHADOW_DATA_FILE = join(getDataDir(), 'shadowTravelData.json');

export async function loadShadowTrip(tripId: string): Promise<ShadowTrip | null> {
  try {
    const content = await readFile(SHADOW_DATA_FILE, 'utf-8');
    const shadowTrips = JSON.parse(content) as Record<string, ShadowTrip>;
    return shadowTrips[tripId] || null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.error('Error loading shadow data:', error);
    }
    return null;
  }
}
