import { Response } from 'undici';
import {
  cloneResponseForCache,
  isCacheableAppShellResponse,
  isCacheableResponse,
  isPreCacheFollowResponseCacheable,
  isRedirectResponse
} from '@/app/lib/serviceWorkerCacheUtils';

const makeResponse = (body = 'ok', init?: ResponseInit): Response => new Response(body, init);

const setResponseShape = (
  response: Response,
  overrides: Partial<Pick<Response, 'type' | 'redirected' | 'url'>>
): Response => {
  if (overrides.type !== undefined) {
    Object.defineProperty(response, 'type', { configurable: true, value: overrides.type });
  }

  if (overrides.redirected !== undefined) {
    Object.defineProperty(response, 'redirected', { configurable: true, value: overrides.redirected });
  }

  if (overrides.url !== undefined) {
    Object.defineProperty(response, 'url', { configurable: true, value: overrides.url });
  }

  return response;
};

describe('serviceWorkerCacheUtils', () => {
  it('accepts no-store app-shell responses while strict runtime caching rejects them', () => {
    const response = setResponseShape(
      makeResponse('html', { status: 200, headers: { 'Cache-Control': 'no-store, must-revalidate' } }),
      { type: 'basic', redirected: false, url: 'http://localhost:3000/admin' }
    );

    expect(isCacheableResponse(response)).toBe(false);
    expect(isCacheableAppShellResponse(response)).toBe(true);
  });

  it('accepts followed pre-cache responses before cloning them into cache-safe responses', () => {
    const response = setResponseShape(
      makeResponse('html', { status: 200, headers: { 'Cache-Control': 'no-store, must-revalidate' } }),
      { type: 'basic', redirected: true, url: 'http://localhost:3000/admin' }
    );

    expect(isPreCacheFollowResponseCacheable(response)).toBe(true);
    expect(isRedirectResponse(response)).toBe(true);
  });

  it('clones same-origin redirect results under the original key without leaving them redirected', async () => {
    const redirectedResponse = setResponseShape(
      makeResponse('admin shell', { status: 200 }),
      { type: 'basic', redirected: true, url: 'http://localhost:3000/admin' }
    );

    const cloned = await cloneResponseForCache(redirectedResponse, {
      originalUrl: 'http://localhost:3000/'
    });

    expect(cloned).not.toBe(redirectedResponse);
    expect(cloned.headers.get('X-Travel-Tracker-Original-Url')).toBe('http://localhost:3000/admin');
    expect(cloned.redirected).toBe(false);
    expect(cloned.type).toBe('default');
    expect(isCacheableAppShellResponse(cloned)).toBe(true);
    expect(isCacheableResponse(cloned)).toBe(false);
  });

  it('returns the original response when no clone is needed', async () => {
    const response = setResponseShape(
      makeResponse('maps shell', { status: 200 }),
      { type: 'basic', redirected: false, url: 'http://localhost:3000/maps' }
    );

    const cloned = await cloneResponseForCache(response, {
      originalUrl: 'http://localhost:3000/maps'
    });

    expect(cloned).toBe(response);
  });
});
