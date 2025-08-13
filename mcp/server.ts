import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './registerTools';

const BASE = process.env.TRAVEL_TRACKER_BASE_URL || 'http://localhost:3000';

const mcp = new McpServer(
  { name: 'travel-tracker-mcp', version: '0.1.0' }
);

registerTools(mcp, BASE);

(async () => {
  await mcp.connect(new StdioServerTransport());
})().catch((err) => {
  console.error('MCP server failed to start', err);
  if (typeof process !== 'undefined' && process.exit) process.exit(1);
});


