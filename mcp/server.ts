import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = process.env.TRAVEL_TRACKER_BASE_URL || 'http://localhost:3000';

const server = new Server(
  { name: 'travel-tracker-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.tool(
  'get_next_steps',
  {
    description: 'Return next steps summary for a trip',
    inputSchema: z.object({ tripId: z.string() })
  },
  async ({ input }) => {
    const url = `${BASE}/api/travel-data/${encodeURIComponent(input.tripId)}/next-steps`;
    const res = await fetch(url, { headers: { host: new URL(BASE).host } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { content: [{ type: 'json', data: json }] };
  }
);

server.tool(
  'get_trip',
  {
    description: 'Return public trip data',
    inputSchema: z.object({ tripId: z.string() })
  },
  async ({ input }) => {
    const url = `${BASE}/api/travel-data?id=${encodeURIComponent(input.tripId)}`;
    const res = await fetch(url, { headers: { host: new URL(BASE).host } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { content: [{ type: 'json', data: json }] };
  }
);

server.tool(
  'get_public_page_html',
  {
    description: 'Fetch HTML from a public path like /map/{id} or /embed/{id}',
    inputSchema: z.object({ path: z.string().regex(/^\/(map|embed)\//) })
  },
  async ({ input }) => {
    const url = `${BASE}${input.path}`;
    const res = await fetch(url, { headers: { host: new URL(BASE).host } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return { content: [{ type: 'text', text: html }] };
  }
);

await server.connect(new StdioServerTransport());


