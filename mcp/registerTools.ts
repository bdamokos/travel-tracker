import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const BASE = process.env.TRAVEL_TRACKER_BASE_URL || 'http://localhost:3000';

export function registerTools(mcp: McpServer) {
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
    { tripId: z.string() },
    async ({ tripId }) => {
      const url = `${BASE}/api/travel-data?id=${encodeURIComponent(tripId)}`;
      const res = await fetch(url, { headers: { host: new URL(BASE).host } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(json) }] };
    }
  );

  mcp.tool(
    'get_public_page_html',
    'Fetch HTML from a public path like /map/{id} or /embed/{id}',
    { path: z.string().regex(/^\/(map|embed)\//) },
    async ({ path }) => {
      const url = `${BASE}${path}`;
      const res = await fetch(url, { headers: { host: new URL(BASE).host } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      return { content: [{ type: 'text', text: html }] };
    }
  );
}


