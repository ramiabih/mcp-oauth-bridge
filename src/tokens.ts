/**
 * Token manager — handles saving, loading, expiry, and auto-refresh of OAuth tokens.
 */
import * as fs from 'fs-extra';
import axios from 'axios';
import { OAuthToken, MCPServer } from './types';
import { ConfigManager } from './config';

// Refresh a token 5 minutes before it actually expires to avoid race conditions
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export class TokenManager {
  constructor(private configManager: ConfigManager) {}

  /**
   * Save a token to disk. Stamps expires_at from expires_in if not already set.
   */
  async saveToken(serverName: string, token: OAuthToken): Promise<void> {
    const tokenPath = this.configManager.getTokenPath(serverName);
    await fs.ensureDir(this.configManager.getTokensDir());

    // Stamp expiry timestamp if server provided expires_in
    if (token.expires_in && !token.expires_at) {
      token = { ...token, expires_at: Date.now() + token.expires_in * 1000 };
    }

    await fs.writeJSON(tokenPath, token, { spaces: 2 });
    await fs.chmod(tokenPath, 0o600);
  }

  /**
   * Load a token from disk. Returns null if the file does not exist.
   */
  async loadToken(serverName: string): Promise<OAuthToken | null> {
    const tokenPath = this.configManager.getTokenPath(serverName);

    if (!await fs.pathExists(tokenPath)) {
      return null;
    }

    return fs.readJSON(tokenPath) as Promise<OAuthToken>;
  }

  /**
   * Returns true if the token is expired or will expire within the buffer window.
   * Tokens with no expires_at are treated as non-expiring (returns false).
   */
  isExpired(token: OAuthToken): boolean {
    if (!token.expires_at) return false;
    return token.expires_at - Date.now() < TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Attempts to refresh the token using the server's token endpoint.
   * Handles refresh token rotation — always saves the full new token response.
   * Throws a descriptive error if the refresh fails.
   */
  async refreshToken(serverName: string, server: MCPServer): Promise<OAuthToken> {
    const currentToken = await this.loadToken(serverName);

    if (!currentToken?.refresh_token) {
      throw new Error(
        `No refresh token available for '${serverName}'. Run: mcp-oauth-bridge auth ${serverName}`
      );
    }

    if (!server.oauth?.tokenUrl) {
      throw new Error(`Server '${serverName}' has no tokenUrl configured`);
    }

    if (!server.oauth?.clientId) {
      throw new Error(`Server '${serverName}' has no clientId configured`);
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentToken.refresh_token,
      client_id: server.oauth.clientId,
    });

    if (server.oauth.clientSecret) {
      params.append('client_secret', server.oauth.clientSecret);
    }

    try {
      const response = await axios.post<OAuthToken>(
        server.oauth.tokenUrl,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const newToken = response.data;

      // If the server didn't return a new refresh_token, preserve the old one (rotation not used)
      if (!newToken.refresh_token) {
        newToken.refresh_token = currentToken.refresh_token;
      }

      await this.saveToken(serverName, newToken);
      return newToken;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = JSON.stringify(err.response?.data ?? {});
        throw new Error(
          `Token refresh failed for '${serverName}' (HTTP ${status}): ${body}. ` +
          `Run: mcp-oauth-bridge auth ${serverName}`
        );
      }
      throw err;
    }
  }

  /**
   * Returns a valid token, refreshing if necessary.
   * This is the primary method used by the MCP client before each request.
   *
   * Note: Not concurrency-safe. For single-process sequential use only.
   */
  async getValidToken(serverName: string, server: MCPServer): Promise<OAuthToken> {
    const token = await this.loadToken(serverName);

    if (!token) {
      throw new Error(
        `No token for '${serverName}'. Run: mcp-oauth-bridge auth ${serverName}`
      );
    }

    if (this.isExpired(token)) {
      return this.refreshToken(serverName, server);
    }

    return token;
  }

  /**
   * Delete a server's token file from disk.
   */
  async deleteToken(serverName: string): Promise<void> {
    const tokenPath = this.configManager.getTokenPath(serverName);
    if (await fs.pathExists(tokenPath)) {
      await fs.remove(tokenPath);
    }
  }

  /**
   * Returns true if a token file exists for this server.
   */
  async hasToken(serverName: string): Promise<boolean> {
    const tokenPath = this.configManager.getTokenPath(serverName);
    return fs.pathExists(tokenPath);
  }
}
