/**
 * HTTP client to call MCP servers with Bearer tokens
 */
import axios, { AxiosError } from 'axios';
import { ConfigManager } from './config';
import { TokenManager } from './tokens';
import { MCPTool, MCPCallRequest, MCPCallResponse } from './types';

interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id: number;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number;
}

export class MCPClient {
  private configManager: ConfigManager;
  private tokenManager: TokenManager;
  private requestId: number = 1;

  constructor(configManager: ConfigManager, tokenManager: TokenManager) {
    this.configManager = configManager;
    this.tokenManager = tokenManager;
  }

  /**
   * List available tools from MCP server
   */
  async listTools(serverName: string): Promise<MCPTool[]> {
    const server = await this.configManager.getServer(serverName);
    const token = await this.tokenManager.getValidToken(serverName, {
      clientId: server.oauth?.clientId || '',
      clientSecret: server.oauth?.clientSecret,
      tokenEndpoint: '', // Will be needed for refresh
    });

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: this.requestId++,
    };

    try {
      const response = await axios.post<JSONRPCResponse>(
        server.url,
        request,
        {
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
          },
          timeout: 30000,
        }
      );

      if (response.data.error) {
        throw new Error(
          `MCP error: ${response.data.error.message} (code: ${response.data.error.code})`
        );
      }

      return response.data.result?.tools || [];
    } catch (error) {
      return this.handleError(error, serverName, 'list tools');
    }
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: any
  ): Promise<MCPCallResponse> {
    const server = await this.configManager.getServer(serverName);
    const token = await this.tokenManager.getValidToken(serverName, {
      clientId: server.oauth?.clientId || '',
      clientSecret: server.oauth?.clientSecret,
      tokenEndpoint: '',
    });

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
      id: this.requestId++,
    };

    try {
      const response = await axios.post<JSONRPCResponse>(
        server.url,
        request,
        {
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
          },
          timeout: 60000, // Tool calls may take longer
        }
      );

      if (response.data.error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${response.data.error.message}`,
          }],
          isError: true,
        };
      }

      return response.data.result || { content: [] };
    } catch (error) {
      return this.handleError(error, serverName, 'call tool');
    }
  }

  /**
   * Handle HTTP and MCP errors
   */
  private handleError(error: unknown, serverName: string, operation: string): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.response?.status === 401) {
        throw new Error(
          `Authentication failed for ${serverName}. ` +
          `Token may be expired or invalid. ` +
          `Please re-authenticate: mcp-oauth-bridge auth ${serverName}`
        );
      }

      if (axiosError.response?.status === 403) {
        throw new Error(
          `Access forbidden for ${serverName}. ` +
          `Check that your OAuth token has the required scopes.`
        );
      }

      if (axiosError.code === 'ECONNREFUSED') {
        throw new Error(
          `Cannot connect to ${serverName} at ${axiosError.config?.url}. ` +
          `Is the MCP server running?`
        );
      }

      if (axiosError.code === 'ETIMEDOUT') {
        throw new Error(
          `Request to ${serverName} timed out. ` +
          `The server may be slow or unresponsive.`
        );
      }

      const responseData = axiosError.response?.data as any;
      const message = responseData?.error?.message ||
                     responseData?.message ||
                     axiosError.message;

      throw new Error(`Failed to ${operation} on ${serverName}: ${message}`);
    }

    if (error instanceof Error) {
      throw new Error(`Failed to ${operation} on ${serverName}: ${error.message}`);
    }

    throw new Error(`Failed to ${operation} on ${serverName}: Unknown error`);
  }
}
