/**
 * MCP HTTP client — speaks JSON-RPC 2.0 to upstream MCP servers,
 * injecting a valid OAuth Bearer token on every request.
 */
import axios, { AxiosError } from 'axios';
import { MCPTool, MCPCallRequest, MCPCallResponse, MCPServer } from './types';
import { TokenManager } from './tokens';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: number;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolsListResult {
  tools: MCPTool[];
}

interface ToolsCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class MCPClient {
  private requestId = 0;

  constructor(private tokenManager: TokenManager) {}

  /**
   * Sends a JSON-RPC 2.0 request to the MCP server and returns the result.
   * Handles HTTP errors and JSON-RPC error objects with descriptive messages.
   */
  private async jsonRpcCall<T>(
    serverName: string,
    server: MCPServer,
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const token = await this.tokenManager.getValidToken(serverName, server);

    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      id: ++this.requestId,
      ...(params ? { params } : {}),
    };

    try {
      const response = await axios.post<JsonRpcResponse<T>>(server.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.access_token}`,
        },
      });

      const data = response.data;

      if (data.error) {
        throw new Error(`MCP server error: ${data.error.message} (code ${data.error.code})`);
      }

      if (data.result === undefined) {
        throw new Error(`MCP server returned no result for method '${method}'`);
      }

      return data.result;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.handleAxiosError(err, serverName, server.url);
      }
      throw err;
    }
  }

  private handleAxiosError(err: AxiosError, serverName: string, url: string): never {
    const status = err.response?.status;

    if (!err.response) {
      throw new Error(
        `Could not connect to MCP server '${serverName}' at ${url}: ${err.message}`
      );
    }

    if (status === 401 || status === 403) {
      throw new Error(
        `Authentication rejected by MCP server '${serverName}' (HTTP ${status}). ` +
        `Token may be invalid or revoked. Run: mcp-oauth-bridge auth ${serverName}`
      );
    }

    if (status && status >= 500) {
      throw new Error(
        `Upstream MCP server '${serverName}' returned an error (HTTP ${status}). ` +
        `Check the server status and try again.`
      );
    }

    throw new Error(
      `MCP server '${serverName}' returned HTTP ${status}: ${JSON.stringify(err.response?.data ?? {})}`
    );
  }

  /**
   * Lists all tools available on the MCP server.
   */
  async listTools(serverName: string, server: MCPServer): Promise<MCPTool[]> {
    const result = await this.jsonRpcCall<ToolsListResult>(
      serverName,
      server,
      'tools/list'
    );
    return result.tools ?? [];
  }

  /**
   * Calls a specific tool on the MCP server with the given arguments.
   */
  async callTool(
    serverName: string,
    server: MCPServer,
    request: MCPCallRequest
  ): Promise<MCPCallResponse> {
    const result = await this.jsonRpcCall<ToolsCallResult>(
      serverName,
      server,
      'tools/call',
      { name: request.tool, arguments: request.arguments }
    );

    return {
      content: result.content ?? [],
      isError: result.isError ?? false,
    };
  }
}
