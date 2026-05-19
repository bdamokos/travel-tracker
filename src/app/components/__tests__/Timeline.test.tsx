import { render, screen } from '@testing-library/react';
import Timeline from '@/app/components/Timeline';
import type { Journey } from '@/app/types';

jest.mock('@/app/components/AccommodationDisplay', () => ({
  __esModule: true,
  default: () => null,
}));

const journeyWithPostUrls: Journey = {
  id: 'journey-1',
  title: 'Test Journey',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-01-02T00:00:00.000Z'),
  days: [
    {
      id: 'day-1',
      title: 'Day One',
      date: new Date('2026-01-01T00:00:00.000Z'),
      locations: [
        {
          id: 'location-1',
          name: 'Paris',
          coordinates: [48.8566, 2.3522],
          date: new Date('2026-01-01T00:00:00.000Z'),
          blogPosts: [
            { id: 'blog-safe', title: 'Safe blog post', url: 'https://example.com/blog' },
            { id: 'blog-unsafe', title: 'Unsafe blog post', url: 'javascript:alert(1)' },
          ],
          instagramPosts: [
            { id: 'ig-safe-location', url: 'https://instagram.com/p/safe-location' },
            { id: 'ig-unsafe-location', url: 'data:text/html,<script>alert(1)</script>' },
          ],
          tikTokPosts: [
            { id: 'tt-safe-location', url: 'http://example.com/tiktok-location', caption: 'safe clip' },
            { id: 'tt-unsafe-location', url: 'vbscript:msgbox(1)', caption: 'unsafe clip' },
          ],
        },
      ],
      instagramPosts: [
        { id: 'ig-safe-day', url: 'https://instagram.com/p/safe-day' },
        { id: 'ig-unsafe-day', url: 'javascript:alert(1)' },
      ],
      tikTokPosts: [
        { id: 'tt-safe-day', url: 'https://example.com/tiktok-day' },
        { id: 'tt-unsafe-day', url: 'data:text/html,<script>alert(1)</script>' },
      ],
    },
  ],
};

describe('Timeline post links', () => {
  it('only renders HTTP(S) post URLs', () => {
    render(
      <Timeline
        journey={journeyWithPostUrls}
        selectedDayId="day-1"
        onDaySelect={jest.fn()}
        onAddDay={jest.fn()}
      />
    );

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));

    expect(hrefs).toEqual([
      'https://example.com/blog',
      'https://instagram.com/p/safe-location',
      'http://example.com/tiktok-location',
      'https://instagram.com/p/safe-day',
      'https://example.com/tiktok-day',
    ]);
    expect(hrefs).not.toContain('javascript:alert(1)');
    expect(hrefs).not.toContain('data:text/html,<script>alert(1)</script>');
    expect(hrefs).not.toContain('vbscript:msgbox(1)');
  });
});
