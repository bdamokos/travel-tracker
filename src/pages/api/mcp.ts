import type { NextApiRequest, NextApiResponse } from 'next';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from '../../../mcp/registerTools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'HEAD') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(204).end();
    return;
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, HEAD, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      (req.headers['access-control-request-headers'] as string) || '*',
    );
    res.status(204).end();
    return;
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const logEnabled = process.env.MCP_LOGGING === 'true';
  const clientIp =
    (Array.isArray(req.headers['x-forwarded-for'])
      ? req.headers['x-forwarded-for'][0]
      : req.headers['x-forwarded-for']) || req.socket.remoteAddress;
  const sessionIdHeader = Array.isArray(req.headers['mcp-session-id'])
    ? req.headers['mcp-session-id'][0]
    : req.headers['mcp-session-id'];
  const logContext = {
    method: req.method,
    headers: {
      host: req.headers.host,
      'user-agent': req.headers['user-agent'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
    },
    clientIp,
    sessionId: sessionIdHeader || transport.sessionId,
  };

  if (logEnabled) {
    console.log('MCP request', logContext);
  }

  // Create a fresh server instance per request (stateless) and connect to transport
  const server = new McpServer({ name: 'travel-tracker-mcp', version: '0.1.0' });
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : 'http';
  const host = req.headers['x-forwarded-host'] ? String(req.headers['x-forwarded-host']) : req.headers.host || 'localhost:3000';
  const baseUrl = `${proto}://${host}`;
  registerTools(server, baseUrl);
  await server.connect(transport);
  // Next provides Node's IncomingMessage/ServerResponse; pass through to MCP transport
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await transport.handleRequest(req as any, res as any, req.body);

  // If this is an SSE request, immediately send a comment and start a lightweight heartbeat
  // to keep intermediaries (e.g., Cloudflare) from timing out idle connections.
  if (req.method === 'GET' && req.headers.accept?.includes('text/event-stream')) {
    try {
      if (!res.writableEnded) {
        res.write(': init\n\n');
      }
    } catch {
      // ignore write errors; transport will manage the stream
    }
    const heartbeat = setInterval(() => {
      try {
        if (!res.writableEnded) {
          res.write(': keepalive\n\n');
        } else {
          clearInterval(heartbeat);
        }
      } catch {
        clearInterval(heartbeat);
      }
    }, 20000);
    res.on('close', () => clearInterval(heartbeat));
    res.on('finish', () => clearInterval(heartbeat));
  }
}


