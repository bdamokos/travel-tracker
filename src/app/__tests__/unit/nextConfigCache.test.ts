import nextConfig from '../../../../next.config';

const getHeaderValue = async (source: string, key: string): Promise<string | undefined> => {
  const headers = await nextConfig.headers?.();
  const route = headers?.find(entry => entry.source === source);
  return route?.headers.find(header => header.key === key)?.value;
};

describe('next cache headers', () => {
  it('does not allow shared caches for host-sensitive map and calendar pages', async () => {
    await expect(getHeaderValue('/map/:id*', 'Cache-Control')).resolves.toBe('no-store');
    await expect(getHeaderValue('/calendars/:tripId*', 'Cache-Control')).resolves.toBe('no-store');
  });

  it('keeps embeddable public maps cacheable', async () => {
    await expect(getHeaderValue('/embed/:id*', 'Cache-Control')).resolves.toContain('public');
  });
});
