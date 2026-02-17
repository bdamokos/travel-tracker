import {
  extractInstagramProfileSummary,
  isValidInstagramUsername,
  normalizeInstagramUsername,
  payloadRequiresInstagramLogin,
} from '@/app/lib/instagramImportUtils';

describe('instagramImportUtils', () => {
  describe('normalizeInstagramUsername', () => {
    it('normalizes usernames from @handles and URLs', () => {
      expect(normalizeInstagramUsername('@my.user_name')).toBe('my.user_name');
      expect(normalizeInstagramUsername('https://www.instagram.com/my.user_name/?hl=en')).toBe('my.user_name');
      expect(normalizeInstagramUsername('instagram.com/my.user_name/')).toBe('my.user_name');
    });
  });

  describe('isValidInstagramUsername', () => {
    it('validates usernames with Instagram rules', () => {
      expect(isValidInstagramUsername('valid.user_name')).toBe(true);
      expect(isValidInstagramUsername('bad..dots')).toBe(false);
      expect(isValidInstagramUsername('')).toBe(false);
    });
  });

  describe('payloadRequiresInstagramLogin', () => {
    it('detects login-required payloads', () => {
      expect(payloadRequiresInstagramLogin({ require_login: true })).toBe(true);
      expect(payloadRequiresInstagramLogin({ status: 'fail', message: 'Please log in to continue' })).toBe(true);
      expect(payloadRequiresInstagramLogin({ status: 'fail', message: 'useragent mismatch' })).toBe(false);
    });
  });

  describe('extractInstagramProfileSummary', () => {
    it('extracts posts from standard timeline payload', () => {
      const payload = {
        data: {
          user: {
            username: 'demo_user',
            full_name: 'Demo User',
            edge_owner_to_timeline_media: {
              edges: [
                {
                  node: {
                    id: '123',
                    shortcode: 'ABC123',
                    taken_at_timestamp: 1730000000,
                    display_url: 'https://cdn.example.com/image.jpg',
                    edge_media_to_caption: {
                      edges: [{ node: { text: 'Hello world' } }],
                    },
                  },
                },
              ],
            },
          },
        },
      };

      const result = extractInstagramProfileSummary(payload, 'demo_user');
      expect(result).not.toBeNull();
      expect(result?.username).toBe('demo_user');
      expect(result?.fullName).toBe('Demo User');
      expect(result?.posts).toHaveLength(1);
      expect(result?.posts[0]).toMatchObject({
        id: '123',
        shortcode: 'ABC123',
        caption: 'Hello world',
        displayUrl: 'https://cdn.example.com/image.jpg',
        takenAt: 1730000000,
      });
    });

    it('falls back to generic node parsing and filters by expected owner', () => {
      const payload = {
        items: [
          {
            pk: 'one',
            code: 'MATCHED1',
            taken_at: 1730001000,
            caption: { text: 'Matched account post' },
            owner: { username: 'target_user' },
            image_versions2: {
              candidates: [{ url: 'https://cdn.example.com/a.jpg' }],
            },
          },
          {
            pk: 'two',
            code: 'OTHER1',
            taken_at: 1730002000,
            caption: { text: 'Other account post' },
            owner: { username: 'other_user' },
            image_versions2: {
              candidates: [{ url: 'https://cdn.example.com/b.jpg' }],
            },
          },
        ],
      };

      const result = extractInstagramProfileSummary(payload, 'target_user');
      expect(result).not.toBeNull();
      expect(result?.posts).toHaveLength(1);
      expect(result?.posts[0].shortcode).toBe('MATCHED1');
    });

    it('deduplicates duplicate shortcode entries and keeps the higher-ranked one', () => {
      const payload = {
        items: [
          {
            pk: 'low',
            code: 'SAME1',
            taken_at: 1730000000,
            caption: { text: 'Short caption' },
            owner: { username: 'target_user' },
            image_versions2: {
              candidates: [{ url: 'https://cdn.example.com/low.jpg' }],
            },
          },
          {
            pk: 'high',
            code: 'SAME1',
            taken_at: 1730003000,
            caption: { text: 'Longer caption for higher-ranked duplicate' },
            owner: { username: 'target_user' },
            image_versions2: {
              candidates: [
                { url: 'https://cdn.example.com/high-1.jpg' },
                { url: 'https://cdn.example.com/high-2.jpg' },
              ],
            },
          },
        ],
      };

      const result = extractInstagramProfileSummary(payload, 'target_user');
      expect(result).not.toBeNull();
      expect(result?.posts).toHaveLength(1);
      expect(result?.posts[0]).toMatchObject({
        id: 'high',
        shortcode: 'SAME1',
        caption: 'Longer caption for higher-ranked duplicate',
        takenAt: 1730003000,
      });
    });
  });
});
