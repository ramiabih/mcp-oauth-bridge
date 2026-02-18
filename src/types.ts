/**
 * Core types for MCP OAuth Bridge
 */

export interface OAuthConfig {
  tokenPath?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
}

export interface MCPServer {
  name: string;
  url: string;
  oauth?: OAuthConfig;
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
  inputSchema: Record<string, unknown>;
}

export interface MCPCallRequest {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface MCPCallResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface OAuthCallbackResult {
  code: string;
  state: string;
}
