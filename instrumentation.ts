export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { ensureMapDataPreloaderRunning } = await import('@/app/lib/mapDataPreloader');
  ensureMapDataPreloaderRunning();
}
