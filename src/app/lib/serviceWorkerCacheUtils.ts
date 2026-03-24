// These helpers mirror the equivalents in public/sw.js so they can be unit tested in Jest.
// Keep both copies in sync when changing service worker cache behavior.
export const isHttpRedirectStatus = (status: number): boolean => status >= 300 && status < 400;

export const isRedirectResponse = (response: Response | null | undefined): boolean => {
  if (!response) {
    return false;
  }

  if (response.type === 'opaqueredirect') {
    return true;
  }

  if (response.redirected) {
    return true;
  }

  return isHttpRedirectStatus(response.status);
};

export const isCacheableResponse = (response: Response | null | undefined): boolean => {
  if (!response || !response.ok) {
    return false;
  }

  if (response.redirected) {
    return false;
  }

  if (response.type !== 'basic' && response.type !== 'cors') {
    return false;
  }

  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !cacheControl.includes('no-store');
};

const normalizeUrl = (requestUrl: string | URL): URL => {
  if (requestUrl instanceof URL) {
    return requestUrl;
  }

  return new URL(requestUrl, 'http://localhost');
};

export const isSameOriginStaticAssetUrl = (requestUrl: string | URL): boolean => {
  const normalizedUrl = normalizeUrl(requestUrl);

  return (
    normalizedUrl.pathname.startsWith('/_next/static/') ||
    normalizedUrl.pathname.startsWith('/_next/image') ||
    normalizedUrl.pathname.startsWith('/images/') ||
    normalizedUrl.pathname.startsWith('/icon-') ||
    normalizedUrl.pathname === '/manifest.json'
  );
};

export const isCacheableStaticAssetResponse = (
  response: Response | null | undefined,
  requestUrl: string | URL
): boolean => {
  if (!response || !response.ok) {
    return false;
  }

  if (response.redirected) {
    return false;
  }

  if (response.type !== 'basic' && response.type !== 'cors') {
    return false;
  }

  return isSameOriginStaticAssetUrl(requestUrl) || isCacheableResponse(response);
};

export const isCacheableAppShellResponse = (response: Response | null | undefined): boolean => {
  if (!response || !response.ok) {
    return false;
  }

  if (response.redirected) {
    return false;
  }

  return response.type === 'basic' || response.type === 'cors' || response.type === 'default';
};

export const isCacheableTileResponse = (response: Response | null | undefined): boolean => {
  if (!response) {
    return false;
  }

  if (response.type === 'opaque') {
    return true;
  }

  return isCacheableResponse(response);
};

export const isPreCacheFollowResponseCacheable = (response: Response | null | undefined): boolean => {
  if (!response || !response.ok) {
    return false;
  }

  return response.type === 'basic' || response.type === 'cors';
};

type CloneResponseOptions = {
  originalUrl?: string;
};

export const cloneResponseForCache = async (
  response: Response,
  { originalUrl }: CloneResponseOptions = {}
): Promise<Response> => {
  const responseUrl = response.url || null;
  const normalizedOriginalUrl = typeof originalUrl === 'string' ? originalUrl : null;
  const shouldCloneResponse =
    response.redirected ||
    (normalizedOriginalUrl !== null && responseUrl !== null && responseUrl !== normalizedOriginalUrl);

  if (!shouldCloneResponse) {
    return response;
  }

  const responseBody = await response.arrayBuffer();
  const responseHeaders = new Headers(response.headers);
  if (responseUrl) {
    responseHeaders.set('X-Travel-Tracker-Original-Url', responseUrl);
  }

  return new Response(responseBody, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};
