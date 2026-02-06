import { ensureMapDataPreloaderRunning } from '@/app/lib/mapDataPreloader';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  ensureMapDataPreloaderRunning();
}
