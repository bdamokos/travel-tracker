/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/instagram/route';

jest.mock('@/app/lib/server-domains', () => ({
  __esModule: true,
  isAdminDomain: jest.fn(),
}));

const { isAdminDomain: mockIsAdminDomain } = jest.requireMock('@/app/lib/server-domains');

const instagramPayload = {
  data: {
    user: {
      username: 'demo_user',
      full_name: 'Demo User',
      edge_owner_to_timeline_media: {
        edges: [
          {
            node: {
              id: 'post-1',
              shortcode: 'ABC123',
              taken_at_timestamp: 1730000000,
              display_url: 'https://cdn.example.test/post.jpg',
              edge_media_to_caption: {
                edges: [{ node: { text: 'Hello from Instagram' } }],
              },
            },
          },
        ],
      },
    },
  },
};

const buildRequest = (host: string): NextRequest =>
  new NextRequest(`https://${host}/api/instagram?username=demo_user`, {
    headers: { host },
  });

describe('instagram API auth and cache boundary', () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    INSTAGRAM_SESSIONID: process.env.INSTAGRAM_SESSIONID,
    INSTAGRAM_CSRFTOKEN: process.env.INSTAGRAM_CSRFTOKEN,
    INSTAGRAM_DS_USER_ID: process.env.INSTAGRAM_DS_USER_ID,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INSTAGRAM_SESSIONID = 'operator-session';
    process.env.INSTAGRAM_CSRFTOKEN = 'operator-csrf';
    process.env.INSTAGRAM_DS_USER_ID = '12345';
    global.fetch = jest.fn().mockImplementation(async () =>
      new Response(JSON.stringify(instagramPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as jest.MockedFunction<typeof fetch>;
  });

  afterAll(() => {
    global.fetch = originalFetch;

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key as keyof typeof originalEnv];
      } else {
        process.env[key as keyof typeof originalEnv] = value;
      }
    }
  });

  it('does not attach operator Instagram cookies for public requests', async () => {
    mockIsAdminDomain.mockResolvedValue(false);

    const response = await GET(buildRequest('public.example.test'));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=600, stale-while-revalidate=300'
    );
    expect(result.posts).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.instagram.com/api/v1/users/web_profile_info/?username=demo_user',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Cookie: expect.any(String),
        }),
        next: { revalidate: 600 },
      })
    );
  });

  it('attaches operator Instagram cookies only for admin-domain requests', async () => {
    mockIsAdminDomain.mockResolvedValue(true);

    const response = await GET(buildRequest('admin.example.test'));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(result).toMatchObject({
      username: 'demo_user',
      fullName: 'Demo User',
      posts: [
        expect.objectContaining({
          shortcode: 'ABC123',
          caption: 'Hello from Instagram',
        }),
      ],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.instagram.com/api/v1/users/web_profile_info/?username=demo_user',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          Cookie: 'sessionid=operator-session; csrftoken=operator-csrf; ds_user_id=12345',
        }),
      })
    );
  });
});
