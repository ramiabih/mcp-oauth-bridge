/**
 * Express HTTP bridge server
 */
import express, { Request, Response, NextFunction } from 'express';
import { BridgeConfig } from './types';
import { MCPClient } from './mcp-client';

interface AuthRequest extends Request {
  authenticated?: boolean;
}

export class BridgeServer {
  private app: express.Application;
  private config: BridgeConfig;
  private mcpClient: MCPClient;
  private server: any = null;

  constructor(config: BridgeConfig, mcpClient: MCPClient) {
    this.config = config;
    this.mcpClient = mcpClient;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Authentication middleware
   */
  private authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: 'Missing Authorization header',
        code: 401,
      });
      return;
    }

    const expectedAuth = `Bearer ${this.config.auth.password || this.config.auth.token}`;

    if (authHeader !== expectedAuth) {
      res.status(401).json({
        error: 'Invalid authorization token',
        code: 401,
      });
      return;
    }

    req.authenticated = true;
    next();
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      });
    });

    // List configured servers (requires auth)
    this.app.get('/servers', this.authMiddleware.bind(this), async (req: Request, res: Response) => {
      try {
        const servers = Object.keys(this.config.servers);
        res.json({ servers });
      } catch (error: any) {
        res.status(500).json({
          error: error.message,
          code: 500,
        });
      }
    });

    // List tools for a server (requires auth)
    this.app.get('/mcp/:server/tools', this.authMiddleware.bind(this), async (req: Request, res: Response) => {
      try {
        const serverName = req.params.server;
        const tools = await this.mcpClient.listTools(serverName);
        res.json({ tools });
      } catch (error: any) {
        const statusCode = error.message.includes('not found') ? 404 :
                          error.message.includes('Authentication failed') ? 401 : 500;
        res.status(statusCode).json({
          error: error.message,
          code: statusCode,
        });
      }
    });

    // Call tool on server (requires auth)
    this.app.post('/mcp/:server/call', this.authMiddleware.bind(this), async (req: Request, res: Response) => {
      try {
        const serverName = req.params.server;
        const { tool, arguments: args } = req.body;

        if (!tool) {
          res.status(400).json({
            error: 'Missing required field: tool',
            code: 400,
          });
          return;
        }

        const result = await this.mcpClient.callTool(serverName, tool, args || {});

        if (result.isError) {
          res.status(500).json({
            error: result.content[0]?.text || 'Tool execution failed',
            code: 500,
            result,
          });
        } else {
          res.json({ result });
        }
      } catch (error: any) {
        const statusCode = error.message.includes('not found') ? 404 :
                          error.message.includes('Authentication failed') ? 401 : 500;
        res.status(statusCode).json({
          error: error.message,
          code: statusCode,
        });
      }
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        code: 404,
        path: req.path,
      });
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Unhandled error:', err);
      res.status(500).json({
        error: 'Internal server error',
        code: 500,
        message: err.message,
      });
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          console.log(`\n🚀 MCP OAuth Bridge running on http://${this.config.host}:${this.config.port}`);
          console.log(`\n📋 Available routes:`);
          console.log(`   GET  /health              - Health check (no auth)`);
          console.log(`   GET  /servers             - List servers (auth required)`);
          console.log(`   GET  /mcp/:server/tools   - List tools (auth required)`);
          console.log(`   POST /mcp/:server/call    - Call tool (auth required)`);
          console.log(`\n🔑 Use Authorization header: Bearer ${this.config.auth.password || this.config.auth.token}`);
          console.log(`\n Press Ctrl+C to stop\n`);
          resolve();
        });

        this.server.on('error', (err: Error) => {
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: Error) => {
          if (err) {
            reject(err);
          } else {
            console.log('\n👋 Server stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
