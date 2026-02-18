/**
 * Token persistence and refresh logic
 */
import * as fs from 'fs-extra';
import * as path from 'path';
import { OAuthToken } from './types';
import { OAuthHandler, OAuthConfig } from './oauth';

export class TokenManager {
  private tokensDir: string;
  private oauthHandler: OAuthHandler;

  constructor(tokensDir: string) {
    this.tokensDir = tokensDir;
    this.oauthHandler = new OAuthHandler();
  }

  /**
   * Save token to disk with secure permissions
   */
  async saveToken(serverName: string, token: OAuthToken): Promise<void> {
    const tokenPath = this.getTokenPath(serverName);
    await fs.ensureDir(this.tokensDir);
    await fs.writeJSON(tokenPath, token, { spaces: 2, mode: 0o600 });
    console.log(`✅ Token saved: ${tokenPath}`);
  }

  /**
   * Load token from disk
   */
  async loadToken(serverName: string): Promise<OAuthToken | null> {
    const tokenPath = this.getTokenPath(serverName);

    if (!await fs.pathExists(tokenPath)) {
      return null;
    }

    try {
      const token = await fs.readJSON(tokenPath);
      return token;
    } catch (error: any) {
      console.error(`Failed to load token for ${serverName}:`, error.message);
      return null;
    }
  }

  /**
   * Delete token from disk
   */
  async deleteToken(serverName: string): Promise<void> {
    const tokenPath = this.getTokenPath(serverName);

    if (await fs.pathExists(tokenPath)) {
      await fs.remove(tokenPath);
      console.log(`✅ Token deleted: ${tokenPath}`);
    }
  }

  /**
   * Check if token is expired
   */
  isExpired(token: OAuthToken): boolean {
    if (!token.expires_at) {
      // No expiration timestamp - assume it's valid
      return false;
    }

    // Add 60 second buffer to refresh before actual expiration
    const bufferMs = 60 * 1000;
    return Date.now() >= (token.expires_at - bufferMs);
  }

  /**
   * Refresh an expired token
   */
  async refreshToken(
    serverName: string,
    refreshToken: string,
    oauthConfig: Pick<OAuthConfig, 'clientId' | 'clientSecret' | 'tokenEndpoint'>
  ): Promise<OAuthToken> {
    console.log(`🔄 Refreshing token for ${serverName}...`);

    try {
      const newToken = await this.oauthHandler.refreshToken(refreshToken, oauthConfig);
      await this.saveToken(serverName, newToken);
      console.log(`✅ Token refreshed successfully`);
      return newToken;
    } catch (error: any) {
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }

  /**
   * Get valid token, refreshing if needed
   */
  async getValidToken(
    serverName: string,
    oauthConfig?: Pick<OAuthConfig, 'clientId' | 'clientSecret' | 'tokenEndpoint'>
  ): Promise<OAuthToken> {
    const token = await this.loadToken(serverName);

    if (!token) {
      throw new Error(
        `No token found for ${serverName}. Run: mcp-oauth-bridge auth ${serverName}`
      );
    }

    // Check if token is expired
    if (this.isExpired(token)) {
      // Try to refresh if we have a refresh token
      if (token.refresh_token && oauthConfig) {
        try {
          return await this.refreshToken(serverName, token.refresh_token, oauthConfig);
        } catch (error: any) {
          throw new Error(
            `Token expired and refresh failed: ${error.message}. ` +
            `Please re-authenticate: mcp-oauth-bridge auth ${serverName}`
          );
        }
      } else {
        throw new Error(
          `Token expired for ${serverName}. ` +
          `Please re-authenticate: mcp-oauth-bridge auth ${serverName}`
        );
      }
    }

    return token;
  }

  /**
   * List all saved tokens
   */
  async listTokens(): Promise<string[]> {
    if (!await fs.pathExists(this.tokensDir)) {
      return [];
    }

    const files = await fs.readdir(this.tokensDir);
    return files
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => path.basename(f, '.json'));
  }

  /**
   * Get path to token file
   */
  private getTokenPath(serverName: string): string {
    return path.join(this.tokensDir, `${serverName}.json`);
  }
}
