import { NextRequest, NextResponse } from 'next/server';
import {
  buildInstagramCookieHeaderFromEnv,
  extractInstagramProfileSummary,
  isValidInstagramUsername,
  normalizeInstagramUsername,
  payloadRequiresInstagramLogin,
} from '@/app/lib/instagramImportUtils';

const DEFAULT_INSTAGRAM_APP_ID = '936619743392459';
const MAX_IMPORTED_POSTS = 40;
const INSTAGRAM_PROFILE_ENDPOINTS = [
  'https://www.instagram.com/api/v1/users/web_profile_info/?username=',
  'https://i.instagram.com/api/v1/users/web_profile_info/?username=',
] as const;

const INSTAGRAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'application/json',
  'X-Requested-With': 'XMLHttpRequest'
};

const getInstagramPayloadFailureMessage = (payload: unknown): string | null => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const statusValue = 'status' in payload ? payload.status : undefined;
  const status = typeof statusValue === 'string' ? statusValue.toLowerCase() : '';
  if (status !== 'fail' && status !== 'error') {
    return null;
  }

  const messageValue = 'message' in payload ? payload.message : undefined;
  if (typeof messageValue === 'string' && messageValue.trim()) {
    return messageValue;
  }

  return 'Instagram payload reported a failure';
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawUsername = searchParams.get('username') ?? '';
  const username = normalizeInstagramUsername(rawUsername);
  const instagramAppId = process.env.INSTAGRAM_APP_ID?.trim() || DEFAULT_INSTAGRAM_APP_ID;
  const cookieHeader = buildInstagramCookieHeaderFromEnv();
  const usePrivateCache = Boolean(cookieHeader);

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  if (!isValidInstagramUsername(username)) {
    return NextResponse.json(
      { error: 'Invalid Instagram username format' },
      { status: 400 }
    );
  }

  try {
    let sawNotFound = false;
    let sawRateLimit = false;
    let sawLoginRequirement = false;

    for (const endpointPrefix of INSTAGRAM_PROFILE_ENDPOINTS) {
      const endpoint = `${endpointPrefix}${encodeURIComponent(username)}`;
      const fetchOptions: RequestInit & { next?: { revalidate: number } } = {
        headers: {
          ...INSTAGRAM_HEADERS,
          'X-IG-App-ID': instagramAppId,
          Referer: `https://www.instagram.com/${username}/`,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      };

      if (usePrivateCache) {
        fetchOptions.cache = 'no-store';
      } else {
        fetchOptions.next = { revalidate: 600 };
      }

      let response: Response;
      try {
        response = await fetch(endpoint, fetchOptions);
      } catch (endpointError) {
        console.error('Error fetching Instagram endpoint:', endpoint, endpointError);
        continue;
      }

      if (!response.ok) {
        if (response.status === 404) {
          sawNotFound = true;
        }
        if (response.status === 429) {
          sawRateLimit = true;
        }
        if (response.status === 401 || response.status === 403) {
          sawLoginRequirement = true;
        }
        continue;
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() || '';
      if (!contentType.includes('json')) {
        continue;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (parseError) {
        console.error('Error parsing Instagram payload:', endpoint, parseError);
        continue;
      }

      if (payloadRequiresInstagramLogin(payload)) {
        sawLoginRequirement = true;
        continue;
      }

      const payloadFailureMessage = getInstagramPayloadFailureMessage(payload);
      if (payloadFailureMessage) {
        const normalizedFailureMessage = payloadFailureMessage.toLowerCase();
        if (
          normalizedFailureMessage.includes('rate limit') ||
          normalizedFailureMessage.includes('too many') ||
          normalizedFailureMessage.includes('wait')
        ) {
          sawRateLimit = true;
        }
        continue;
      }

      const summary = extractInstagramProfileSummary(payload, username);
      if (!summary) {
        continue;
      }

      return NextResponse.json(
        {
          username: summary.username || username,
          fullName: summary.fullName || '',
          posts: summary.posts.slice(0, MAX_IMPORTED_POSTS)
        },
        {
          headers: {
            'Cache-Control': usePrivateCache
              ? 'private, no-store'
              : 'public, s-maxage=600, stale-while-revalidate=300'
          }
        }
      );
    }

    if (sawLoginRequirement) {
      return NextResponse.json(
        {
          error: 'Instagram is requiring a logged-in session. Configure INSTAGRAM_SESSIONID (and optionally INSTAGRAM_CSRFTOKEN / INSTAGRAM_DS_USER_ID).'
        },
        { status: 403 }
      );
    }

    if (sawRateLimit) {
      return NextResponse.json(
        { error: 'Instagram temporarily rate-limited profile requests. Try again shortly.' },
        { status: 429 }
      );
    }

    if (sawNotFound) {
      return NextResponse.json(
        { error: 'Instagram profile not found or not publicly accessible.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch Instagram profile from available endpoints' },
      { status: 502 }
    );
  } catch (error) {
    console.error('Error fetching Instagram profile:', error);
    return NextResponse.json({ error: 'Failed to fetch Instagram profile' }, { status: 500 });
  }
}
