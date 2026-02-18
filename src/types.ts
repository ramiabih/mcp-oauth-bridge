/**
 * Core types for MCP OAuth Bridge
 */

export interface MCPServer {
  name: string;
  url: string;
  oauth?: {
    tokenPath?: string;
    clientId?: string;
    clientSecret?: string;
  };
}

export interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  expires_at?: number;
  scope?: string;
}

export interface BridgeConfig {
  port: number;
  host: string;
  auth: {
    type: 'password' | 'bearer';
    password?: string;
    token?: string;
  };
  servers: {
    [name: string]: MCPServer;
  };
  dataDir: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPCallRequest {
  tool: string;
  arguments: any;
}

export interface MCPCallResponse {
  content: any[];
  isError?: boolean;
}
