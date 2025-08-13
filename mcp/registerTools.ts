import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerTools(mcp: McpServer, baseUrl?: string) {
  const BASE = baseUrl || process.env.TRAVEL_TRACKER_BASE_URL || 'http://localhost:3000';
  const DEFAULT_MAX_CHARS = Number(process.env.MCP_MAX_CHARS || 20000);

  // Basic shapes to avoid any in this file
  type Coord = [number, number];
  interface RawLocation { id?: string; name?: string; coordinates?: Coord; date?: string | Date; endDate?: string | Date; }
  interface RawRoute { id?: string; type?: string; from?: string; to?: string; departureTime?: string; arrivalTime?: string; fromCoordinates?: Coord; toCoordinates?: Coord; routePoints?: Coord[]; }
  interface RawAccommodation { id?: string; name?: string; locationId?: string }
  interface RawDay { id?: string; date?: string | Date; endDate?: string | Date; title?: string }
  interface RawTrip { id?: string; title?: string; description?: string; startDate?: string; endDate?: string; locations?: RawLocation[]; routes?: RawRoute[]; accommodations?: RawAccommodation[]; days?: RawDay[] }
  interface ListedTrip { id: string; title: string; description?: string; startDate?: string; endDate?: string; createdAt?: string }
  type ShapedCounts = { locations?: number; routes?: number; accommodations?: number; days?: number };
  interface ShapedTripResult {
    meta: { id?: string; title?: string; description?: string; startDate?: string; endDate?: string };
    counts?: ShapedCounts;
    locations?: Array<{ id?: string; name?: string; coordinates?: Coord; date?: string | Date; endDate?: string | Date }>;
    routes?: Array<{ id?: string; type?: string; from?: string; to?: string; departureTime?: string; arrivalTime?: string; fromCoordinates?: Coord; toCoordinates?: Coord; routePoints?: Coord[] }>;
    accommodations?: Array<{ id?: string; name?: string; locationId?: string }>;
    days?: Array<{ id?: string; date?: string | Date; endDate?: string | Date; title?: string }>;
    nextLocationsOffset?: number;
    nextRoutesOffset?: number;
    nextDaysOffset?: number;
    truncated?: boolean;
    tip?: string;
  }

  function safeJsonStringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify({ error: 'Failed to stringify JSON' });
    }
  }

  function stripHtml(html: string): string {
    // Remove script/style tags and their content
    const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    // Remove all tags
    const noTags = noStyles.replace(/<[^>]+>/g, ' ');
    // Collapse whitespace
    return noTags.replace(/\s+/g, ' ').trim();
  }

  function shapeTripData(raw: RawTrip, options?: {
    sections?: Array<'meta' | 'locations' | 'routes' | 'accommodations' | 'days'>;
    maxLocations?: number;
    maxRoutes?: number;
    includeRoutePoints?: boolean;
    fromDate?: string;
    toDate?: string;
    locationsOffset?: number;
    routesOffset?: number;
    daysOffset?: number;
  }) {
    const parseTs = (input: unknown): number | null => {
      if (!input) return null;
      const d = typeof input === 'string' || input instanceof Date ? new Date(input) : null;
      if (!d || Number.isNaN(d.getTime())) return null;
      return d.getTime();
    };
    const fromTs = options?.fromDate ? parseTs(options.fromDate) : null;
    const toTs = options?.toDate ? parseTs(options.toDate) : null;
    const inRange = (ts: number | null): boolean => {
      if (ts === null) return true;
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      return true;
    };
    const sections = options?.sections;
    const maxLocations = options?.maxLocations ?? 50;
    const maxRoutes = options?.maxRoutes ?? 50;
    const includeRoutePoints = options?.includeRoutePoints ?? false;
    const locOffset = Math.max(0, options?.locationsOffset ?? 0);
    const routeOffset = Math.max(0, options?.routesOffset ?? 0);
    const dayOffset = Math.max(0, options?.daysOffset ?? 0);

    const meta = {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      startDate: raw.startDate,
      endDate: raw.endDate,
    };

    const result: ShapedTripResult = { meta };

    const want = (key: 'meta' | 'locations' | 'routes' | 'accommodations' | 'days') =>
      !sections || sections.includes(key);

    if (want('locations')) {
      const allLocs: RawLocation[] = Array.isArray(raw.locations) ? raw.locations : [];
      const filteredLocs = allLocs.filter(l => inRange(parseTs(l.date)) || inRange(parseTs(l.endDate)));
      const paged = filteredLocs.slice(locOffset, locOffset + maxLocations).map((l) => ({
        id: l.id,
        name: l.name,
        coordinates: l.coordinates,
        date: l.date,
        endDate: l.endDate,
      }));
      result.locations = paged;
      result.counts = { ...(result.counts ?? {}), locations: filteredLocs.length };
      if (filteredLocs.length > locOffset + paged.length) result.nextLocationsOffset = locOffset + paged.length;
    }

    if (want('routes')) {
      const allRoutes: RawRoute[] = Array.isArray(raw.routes) ? raw.routes : [];
      const filteredRoutes = allRoutes.filter(r => inRange(parseTs(r.departureTime)) || inRange(parseTs(r.arrivalTime)));
      const paged = filteredRoutes.slice(routeOffset, routeOffset + maxRoutes).map((r) => ({
        id: r.id,
        type: r.type,
        from: r.from,
        to: r.to,
        departureTime: r.departureTime,
        arrivalTime: r.arrivalTime,
        fromCoordinates: r.fromCoordinates,
        toCoordinates: r.toCoordinates,
        ...(includeRoutePoints ? { routePoints: Array.isArray(r.routePoints) ? r.routePoints.slice(0, 200) : undefined } : {}),
      }));
      result.routes = paged;
      result.counts = { ...(result.counts ?? {}), routes: filteredRoutes.length };
      if (filteredRoutes.length > routeOffset + paged.length) result.nextRoutesOffset = routeOffset + paged.length;
    }

    if (want('accommodations')) {
      const acc: RawAccommodation[] = Array.isArray(raw.accommodations) ? raw.accommodations : [];
      result.accommodations = acc.slice(0, 50).map((a) => ({ id: a.id, name: a.name, locationId: a.locationId }));
      result.counts = { ...(result.counts ?? {}), accommodations: acc.length };
    }

    if (want('days')) {
      const allDays: RawDay[] = Array.isArray(raw.days) ? raw.days : [];
      const filteredDays = allDays.filter(d => inRange(parseTs(d.date)) || inRange(parseTs(d.endDate)));
      const paged = filteredDays.slice(dayOffset, dayOffset + 30).map((d) => ({ id: d.id, date: d.date, endDate: d.endDate, title: d.title }));
      result.days = paged;
      result.counts = { ...(result.counts ?? {}), days: filteredDays.length };
      if (filteredDays.length > dayOffset + paged.length) result.nextDaysOffset = dayOffset + paged.length;
    }

    return result;
  }

  mcp.tool(
    'list_trips',
    'List available trips (ids, titles, dates)',
    { limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional(), query: z.string().optional(), fromDate: z.string().optional(), toDate: z.string().optional() },
    async ({ limit, offset, query, fromDate, toDate }) => {
      const url = `${BASE}/api/travel-data/list`;
      const res = await fetch(url, { headers: { host: new URL(BASE).host } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      let items: ListedTrip[] = Array.isArray(json) ? json : [];
      if (query) {
        const q = query.toLowerCase();
        items = items.filter((t) =>
          (t.title && String(t.title).toLowerCase().includes(q)) ||
          (t.id && String(t.id).toLowerCase().includes(q))
        );
      }
      const parseTs = (s?: string): number | null => (s ? new Date(s).getTime() : null);
      const fromTs = fromDate ? parseTs(fromDate) : null;
      const toTs = toDate ? parseTs(toDate) : null;
      if (fromTs !== null || toTs !== null) {
        items = items.filter((t) => {
          const start = parseTs(t.startDate);
          const end = parseTs(t.endDate);
          const ref = start ?? end;
          if (ref === null) return false;
          if (fromTs !== null && ref < fromTs) return false;
          if (toTs !== null && ref > toTs) return false;
          return true;
        });
      }
      const off = offset ?? 0;
      const lim = limit ?? 50;
      const paged = items.slice(off, off + lim);
      const payload = { total: items.length, offset: off, limit: lim, items: paged };
      return { content: [{ type: 'text', text: safeJsonStringify(payload) }] };
    }
  );

  mcp.tool(
    'get_next_steps',
    'Return next steps summary for a trip',
    { tripId: z.string() },
    async ({ tripId }) => {
      const url = `${BASE}/api/travel-data/${encodeURIComponent(tripId)}/next-steps`;
      const res = await fetch(url, { headers: { host: new URL(BASE).host } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(json) }] };
    }
  );

  mcp.tool(
    'get_trip',
    'Return public trip data',
    {
      tripId: z.string(),
      sections: z.array(z.enum(['meta', 'locations', 'routes', 'accommodations', 'days'])).optional(),
      maxLocations: z.number().int().min(1).max(1000).optional(),
      maxRoutes: z.number().int().min(1).max(1000).optional(),
      includeRoutePoints: z.boolean().optional(),
      maxChars: z.number().int().min(1000).max(200000).optional(),
      summaryOnly: z.boolean().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      locationsOffset: z.number().int().min(0).optional(),
      routesOffset: z.number().int().min(0).optional(),
      daysOffset: z.number().int().min(0).optional(),
    },
    async ({ tripId, sections, maxLocations, maxRoutes, includeRoutePoints, maxChars, summaryOnly, fromDate, toDate, locationsOffset, routesOffset, daysOffset }) => {
      const url = `${BASE}/api/travel-data?id=${encodeURIComponent(tripId)}`;
      const res = await fetch(url, { headers: { host: new URL(BASE).host } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: RawTrip = await res.json();

      let shaped = summaryOnly
        ? shapeTripData(json, { sections, maxLocations, maxRoutes, includeRoutePoints, fromDate, toDate, locationsOffset, routesOffset, daysOffset })
        : {
            // default: trim heavy fields to avoid token overflow
            ...json,
            routes: Array.isArray(json.routes)
              ? json.routes.map((r) => ({ ...r, routePoints: undefined }))
              : [],
          };

      // If sections were provided, prefer shaped view
      if (sections && sections.length > 0) {
        shaped = shapeTripData(json, { sections, maxLocations, maxRoutes, includeRoutePoints, fromDate, toDate, locationsOffset, routesOffset, daysOffset });
      }

      const limit = maxChars ?? DEFAULT_MAX_CHARS;
      let text = safeJsonStringify(shaped);
      if (text.length > limit) {
        const reduced = shapeTripData(json, { sections: sections ?? ['meta', 'locations', 'routes', 'accommodations'], maxLocations: Math.min(maxLocations ?? 50, 50), maxRoutes: Math.min(maxRoutes ?? 50, 50), includeRoutePoints: false, fromDate, toDate, locationsOffset, routesOffset, daysOffset });
        text = safeJsonStringify({ ...reduced, truncated: true, tip: 'Pass sections/maxLocations/maxRoutes/includeRoutePoints to retrieve more details in smaller chunks.' });
      }
      return { content: [{ type: 'text', text }] };
    }
  );

  mcp.tool(
    'get_public_page_html',
    'Fetch HTML from a public path like /map/{id} or /embed/{id}',
    { path: z.string().regex(/^\/(map|embed)\//), textOnly: z.boolean().optional(), maxChars: z.number().int().min(500).max(200000).optional() },
    async ({ path, textOnly, maxChars }) => {
      const url = `${BASE}${path}`;
      const res = await fetch(url, { headers: { host: new URL(BASE).host } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const limit = maxChars ?? Math.min(DEFAULT_MAX_CHARS, 8000);
      if (textOnly !== false) {
        const text = stripHtml(html);
        const truncated = text.length > limit ? text.slice(0, limit) + '… [truncated]' : text;
        return { content: [{ type: 'text', text: truncated }] };
      }
      const truncatedHtml = html.length > limit ? html.slice(0, limit) + '… <!-- truncated -->' : html;
      return { content: [{ type: 'text', text: truncatedHtml }] };
    }
  );
}


