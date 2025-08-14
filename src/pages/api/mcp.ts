import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from '../../../mcp/registerTools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Gate legacy SSE compatibility with an env flag. Default OFF to favor Streamable HTTP.
  const ENABLE_LEGACY_SSE = ((process.env.MCP_LEGACY_SSE ?? 'false').toLowerCase() !== 'false') && process.env.MCP_LEGACY_SSE !== '0';
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
  // Backwards-compatibility: some legacy MCP clients send POST initialize with only
  // "Accept: application/json". The Streamable HTTP transport requires that clients
  // accept both application/json and text/event-stream. To avoid a 406 for these
  // clients, normalize the Accept header to include both.
  let requestForTransport: NextApiRequest | (NextApiRequest & { rawHeaders?: string[] }) = req;
  if (req.method === 'POST') {
    const currentAccept = Array.isArray(req.headers.accept) ? req.headers.accept.join(', ') : req.headers.accept || '';
    const hasJson = /application\/json/i.test(currentAccept);
    const hasSse = /text\/event-stream/i.test(currentAccept);
    let normalizedAccept = currentAccept;
    if (!hasJson || !hasSse) {
      const parts: string[] = [];
      if (hasJson) parts.push(currentAccept);
      else parts.push(currentAccept ? `${currentAccept}, application/json` : 'application/json');
      if (!hasSse) parts.push('text/event-stream');
      normalizedAccept = parts.filter(Boolean).join(', ').replace(/\s+,/g, ',');
    }

    // Compatibility: Some older clients omit params.clientInfo (and sometimes protocolVersion)
    // on initialize. If we detect such a request, inject a minimal clientInfo and default protocol.
    const contentType = Array.isArray(req.headers['content-type']) ? req.headers['content-type'].join(', ') : req.headers['content-type'] || '';
    const isJson = /application\/json/i.test(contentType);
    const originalBody: unknown = (req as unknown as { body?: unknown }).body;
    let modifiedBody = originalBody;
    if (isJson && originalBody && typeof originalBody === 'object') {
      const rpc = originalBody as { method?: unknown; params?: unknown };
      if (rpc && rpc.method === 'initialize') {
        const params = (rpc.params && typeof rpc.params === 'object') ? (rpc.params as Record<string, unknown>) : {};
        if (!('clientInfo' in params) || params.clientInfo == null) {
          params.clientInfo = { name: 'legacy-client', version: '0.0.0' };
        }
        if (!('protocolVersion' in params) || params.protocolVersion == null) {
          params.protocolVersion = '2025-03-26';
        }
        if (!('capabilities' in params) || params.capabilities == null) {
          params.capabilities = {};
        }
        (rpc as { params: Record<string, unknown> }).params = params;
        modifiedBody = rpc;
      }
    }

    if (normalizedAccept !== currentAccept || modifiedBody !== originalBody) {
      const raw = (req as unknown as { rawHeaders?: string[] }).rawHeaders;
      let newRawHeaders: string[] | undefined = undefined;
      if (Array.isArray(raw)) {
        // Remove existing Accept entries
        newRawHeaders = [];
        for (let i = 0; i < raw.length; i += 2) {
          const key = raw[i];
          const value = raw[i + 1];
          if (typeof key === 'string' && key.toLowerCase() === 'accept') {
            // skip existing accept header
            continue;
          }
          newRawHeaders.push(key, value);
        }
        newRawHeaders.push('Accept', normalizedAccept);
      }
      requestForTransport = Object.assign({}, req, {
        headers: { ...req.headers, accept: normalizedAccept },
        rawHeaders: newRawHeaders ?? raw,
        body: modifiedBody,
      });
    }
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
      accept: req.headers['accept'],
      'mcp-session-id': req.headers['mcp-session-id'],
      'content-type': req.headers['content-type'],
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
  await transport.handleRequest(requestForTransport as any, res as any, (requestForTransport as unknown as { body?: unknown }).body);

  // If this is an SSE request, immediately send a comment and start a lightweight heartbeat
  // to keep intermediaries (e.g., Cloudflare) from timing out idle connections.
  if (req.method === 'GET' && req.headers.accept?.includes('text/event-stream')) {
    if (!ENABLE_LEGACY_SSE) {
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Allow', 'POST, HEAD, OPTIONS');
      res.status(405).end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Legacy SSE transport disabled. Use Streamable HTTP (POST).' },
        id: null,
      }));
      return;
    }
    // Ensure a session id header is present so legacy clients can reuse it on POST
    try {
      const existingHeader = res.getHeader('Mcp-Session-Id');
      const alreadySet = typeof existingHeader === 'string' ? existingHeader : (Array.isArray(existingHeader) ? existingHeader[0] : undefined);
      if (!alreadySet) {
        const requested = Array.isArray(req.headers['mcp-session-id']) ? req.headers['mcp-session-id'][0] : req.headers['mcp-session-id'];
        const sid = requested || (transport as unknown as { sessionId?: string }).sessionId || crypto.randomUUID();
        res.setHeader('Mcp-Session-Id', sid);
      }
    } catch {
      // best-effort only
    }
    try {
      if (!res.writableEnded) {
        // Initial comment for connectivity
        res.write(': init\n\n');
        // Legacy SSE clients (e.g., older Warp builds) expect an initial "endpoint" event
        // to learn where to POST JSON-RPC messages. Provide absolute URL for robustness.
        const sessionHeaderNow = res.getHeader('Mcp-Session-Id');
        const sessionIdForEndpoint = Array.isArray(sessionHeaderNow)
          ? sessionHeaderNow[0]
          : (typeof sessionHeaderNow === 'string' ? sessionHeaderNow : (transport as unknown as { sessionId?: string }).sessionId);
        const endpointPayload = {
          // Some clients expect `uri`, others `url`.
          uri: `${baseUrl}/api/mcp`,
          url: `${baseUrl}/api/mcp`,
          method: 'POST',
          headers: {
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
            ...(sessionIdForEndpoint ? { 'mcp-session-id': String(sessionIdForEndpoint) } : {}),
          },
        };
        res.write('event: endpoint\n');
        res.write(`data: ${JSON.stringify(endpointPayload)}\n\n`);
        // Also provide current session id so clients can bind POSTs to the same session
        // without having to infer it from headers.
        const sessionHeader = res.getHeader('Mcp-Session-Id');
        const fromHeader = Array.isArray(sessionHeader) ? sessionHeader[0] : (typeof sessionHeader === 'string' ? sessionHeader : undefined);
        const sessionId = fromHeader || (transport as unknown as { sessionId?: string }).sessionId;
        if (sessionId) {
          const sessionPayload = { id: sessionId };
          res.write('event: session\n');
          res.write(`data: ${JSON.stringify(sessionPayload)}\n\n`);
        }
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


