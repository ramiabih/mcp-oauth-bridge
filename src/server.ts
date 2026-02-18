/**
 * Express HTTP server — the bridge API that remote MCP clients talk to.
 *
 * All routes (except /health) require a Bearer token that matches the
 * password configured in ~/.mcp-bridge/config.json.
 */
import express, { Express, Request, Response, NextFunction } from 'express';
import chalk from 'chalk';
import { BridgeConfig } from './types';
import { ConfigManager } from './config';
import { TokenManager } from './tokens';
import { MCPClient } from './mcp-client';

// --- Auth middleware ---

function authMiddleware(config: BridgeConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or malformed Authorization header. Use: Bearer <password>' });
      return;
    }

    const provided = authHeader.slice(7);
    const expected = config.auth.password ?? config.auth.token;

    if (!expected || provided !== expected) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    next();
  };
}

// --- App factory ---

/**
 * Creates and configures the Express app without starting it.
 * Separated from startServer to make routes independently testable.
 */
export function createApp(
  config: BridgeConfig,
  configManager: ConfigManager,
  tokenManager: TokenManager,
  mcpClient: MCPClient
): Express {
  const app = express();
  app.use(express.json());

  // Health check — no auth required
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      servers: Object.keys(config.servers).length,
    });
  });

  // Apply auth to all routes below
  app.use(authMiddleware(config));

  // List configured servers with token status
  app.get('/servers', async (_req: Request, res: Response) => {
    try {
      const servers: Record<string, { url: string; hasToken: boolean; tokenExpired: boolean | null }> = {};

      for (const [name, server] of Object.entries(config.servers)) {
        const token = await tokenManager.loadToken(name);
        servers[name] = {
          url: server.url,
          hasToken: token !== null,
          tokenExpired: token ? tokenManager.isExpired(token) : null,
        };
      }

      res.json({ servers });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // List tools for a specific MCP server
  app.get('/mcp/:server/tools', async (req: Request, res: Response) => {
    const serverName = req.params.server;
    const server = config.servers[serverName];

    if (!server) {
      res.status(404).json({ error: `Server '${serverName}' not found. Run: mcp-oauth-bridge list` });
      return;
    }

    try {
      const tools = await mcpClient.listTools(serverName, server);
      res.json({ tools });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const isAuthError = message.includes('Authentication rejected') || message.includes('invalid or revoked');
      res.status(isAuthError ? 401 : 502).json({ error: message });
    }
  });

  // Call a tool on a specific MCP server
  app.post('/mcp/:server/call', async (req: Request, res: Response) => {
    const serverName = req.params.server;
    const server = config.servers[serverName];

    if (!server) {
      res.status(404).json({ error: `Server '${serverName}' not found. Run: mcp-oauth-bridge list` });
      return;
    }

    const { tool, arguments: args } = req.body as { tool?: string; arguments?: Record<string, unknown> };

    if (!tool) {
      res.status(400).json({ error: 'Request body must include "tool" field' });
      return;
    }

    try {
      const result = await mcpClient.callTool(serverName, server, {
        tool,
        arguments: args ?? {},
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const isAuthError = message.includes('Authentication rejected') || message.includes('invalid or revoked');
      res.status(isAuthError ? 401 : 502).json({ error: message });
    }
  });

  return app;
}

// --- Server startup ---

export async function startServer(
  configManager: ConfigManager,
  overrides: { port?: number; host?: string } = {}
): Promise<void> {
  const config = await configManager.load();
  const port = overrides.port ?? config.port;
  const host = overrides.host ?? config.host;

  const tokenManager = new TokenManager(configManager);
  const mcpClient = new MCPClient(tokenManager);
  const app = createApp(config, configManager, tokenManager, mcpClient);

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(port, host, () => {
      console.log(chalk.green(`\n✅ MCP OAuth Bridge running at http://${host}:${port}`));
      console.log(chalk.dim(`   Servers: ${Object.keys(config.servers).join(', ') || 'none configured'}`));
      console.log(chalk.dim(`   API key: ${config.auth.password ?? config.auth.token}`));
      console.log(chalk.dim('\nEndpoints:'));
      console.log(chalk.dim(`   GET  http://${host}:${port}/health`));
      console.log(chalk.dim(`   GET  http://${host}:${port}/servers`));
      console.log(chalk.dim(`   GET  http://${host}:${port}/mcp/:server/tools`));
      console.log(chalk.dim(`   POST http://${host}:${port}/mcp/:server/call`));
      resolve();
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Use --port to choose a different port.`));
      } else {
        reject(err);
      }
    });
  });
}
