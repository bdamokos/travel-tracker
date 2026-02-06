import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { filterUpdatesForPublic } from '@/app/lib/updateFilters';
import { TripUpdate, TripUpdateLink } from '@/app/types';

const RSS_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';
const XML_INVALID_CHARS = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g;

const isValidHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const sanitizeXml = (value: string): string => value.replace(XML_INVALID_CHARS, '');

const escapeXml = (value: string): string =>
  sanitizeXml(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const parseDate = (value: string | Date | undefined | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getValidLinks = (links: TripUpdateLink[] | undefined): TripUpdateLink[] =>
  (links || []).filter(link => isValidHttpUrl(link.url));

const buildItemDescription = (update: TripUpdate): string => {
  const lines: string[] = [update.message];
  const links = getValidLinks(update.links);
  if (links.length > 0) {
    lines.push('', 'Links:');
    links.forEach(link => {
      const label = link.title?.trim() || 'View post';
      lines.push(`- ${label}: ${link.url}`);
    });
  }
  return lines.join('\n');
};

const getUpdateDate = (update: TripUpdate, fallbackDate: Date): Date => parseDate(update.createdAt) || fallbackDate;

const sortUpdatesByDateDesc = (updates: TripUpdate[], fallbackDate: Date): TripUpdate[] =>
  [...updates].sort((left, right) => {
    const leftDate = getUpdateDate(left, fallbackDate);
    const rightDate = getUpdateDate(right, fallbackDate);
    return rightDate.getTime() - leftDate.getTime();
  });

const buildRssXml = ({
  title,
  description,
  mapUrl,
  feedUrl,
  updates,
  fallbackDate,
}: {
  title: string;
  description: string;
  mapUrl: string;
  feedUrl: string;
  updates: TripUpdate[];
  fallbackDate: Date;
}): string => {
  const sortedUpdates = sortUpdatesByDateDesc(updates, fallbackDate);
  const latestDate = sortedUpdates[0] ? getUpdateDate(sortedUpdates[0], fallbackDate) : fallbackDate;

  const itemsXml = sortedUpdates
    .map(update => {
      const links = getValidLinks(update.links);
      const itemLink = links[0]?.url || `${mapUrl}#update-${encodeURIComponent(update.id)}`;
      const pubDate = getUpdateDate(update, fallbackDate).toUTCString();
      const guid = `${feedUrl}#${update.id}`;
      return [
        '<item>',
        `<title>${escapeXml(update.message)}</title>`,
        `<description>${escapeXml(buildItemDescription(update))}</description>`,
        `<link>${escapeXml(itemLink)}</link>`,
        `<guid isPermaLink="false">${escapeXml(guid)}</guid>`,
        `<pubDate>${escapeXml(pubDate)}</pubDate>`,
        '</item>',
      ].join('');
    })
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(title)}</title>`,
    `<description>${escapeXml(description)}</description>`,
    `<link>${escapeXml(mapUrl)}</link>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `<lastBuildDate>${escapeXml(latestDate.toUTCString())}</lastBuildDate>`,
    itemsXml,
    '</channel>',
    '</rss>',
  ].join('');
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
): Promise<NextResponse> {
  try {
    const { tripId } = await params;
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const unified = await loadUnifiedTripData(tripId);
    if (!unified) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const locations = unified.travelData?.locations || [];
    const routes = unified.travelData?.routes || [];
    const updates = filterUpdatesForPublic(unified.publicUpdates || [], locations, routes);
    const fallbackDate = parseDate(unified.updatedAt) || new Date();

    const origin = request.nextUrl.origin;
    const encodedTripId = encodeURIComponent(tripId);
    const mapUrl = `${origin}/map/${encodedTripId}`;
    const feedUrl = `${origin}/api/travel-data/${encodedTripId}/updates/rss`;
    const feedTitle = `${unified.title} - Trip Updates`;
    const feedDescription =
      unified.description?.trim() || `Latest public trip updates for ${unified.title}.`;

    const rss = buildRssXml({
      title: feedTitle,
      description: feedDescription,
      mapUrl,
      feedUrl,
      updates,
      fallbackDate,
    });

    return new NextResponse(rss, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': RSS_CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error('[TripUpdatesRSS] GET error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
