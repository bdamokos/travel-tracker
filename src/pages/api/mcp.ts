import type { NextApiRequest, NextApiResponse } from 'next';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from '../../../mcp/registerTools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Create a fresh server instance per request (stateless) and connect to transport
  const server = new McpServer({ name: 'travel-tracker-mcp', version: '0.1.0' });
  registerTools(server);
  await server.connect(transport);
  // Next provides Node's IncomingMessage/ServerResponse; pass through to MCP transport
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await transport.handleRequest(req as any, res as any, req.body);
}


