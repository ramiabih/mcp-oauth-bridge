/**
 * OAuth handler - opens browser and captures tokens
 */
import * as http from 'http';
import * as crypto from 'crypto';
import * as open from 'open';
import axios from 'axios';
import { URL } from 'url';
import { OAuthToken } from './types';

interface PKCECodes {
  verifier: string;
  challenge: string;
}

interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri?: string;
  scope?: string;
}

export class OAuthHandler {
  private server: http.Server | null = null;
  private port: number = 8080;
  private pkceVerifier: string | null = null;

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): PKCECodes {
    // Generate random 32-byte verifier
    const verifier = crypto.randomBytes(32).toString('base64url');

    // Create SHA-256 hash challenge
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');

    return { verifier, challenge };
  }

  /**
   * Build authorization URL with PKCE
   */
  buildAuthorizationUrl(config: OAuthConfig): string {
    const pkce = this.generatePKCE();
    this.pkceVerifier = pkce.verifier;

    const redirectUri = config.redirectUri || `http://localhost:${this.port}/callback`;
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state,
    });

    if (config.scope) {
      params.append('scope', config.scope);
    }

    return `${config.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(
    code: string,
    config: OAuthConfig
  ): Promise<OAuthToken> {
    if (!this.pkceVerifier) {
      throw new Error('PKCE verifier not found - call buildAuthorizationUrl first');
    }

    const redirectUri = config.redirectUri || `http://localhost:${this.port}/callback`;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: this.pkceVerifier,
      client_id: config.clientId,
    });

    if (config.clientSecret) {
      params.append('client_secret', config.clientSecret);
    }

    try {
      const response = await axios.post(config.tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const token: OAuthToken = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in,
        scope: response.data.scope,
      };

      // Calculate expiration timestamp
      if (token.expires_in) {
        token.expires_at = Date.now() + token.expires_in * 1000;
      }

      return token;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error_description ||
                       error.response?.data?.error ||
                       error.message;
        throw new Error(`Token exchange failed: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Authenticate with OAuth server using browser flow
   */
  async authenticate(
    serverName: string,
    config: OAuthConfig
  ): Promise<OAuthToken> {
    const authUrl = this.buildAuthorizationUrl(config);

    return new Promise((resolve, reject) => {
      console.log(`\n🔐 Authenticating with ${serverName}...`);
      console.log(`\n🌐 Opening browser to: ${authUrl}`);
      console.log(`📝 After approving, you'll be redirected back.\n`);

      // Start callback server
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, `http://localhost:${this.port}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; padding: 50px; text-align: center;">
                  <h1>✅ Authentication Successful!</h1>
                  <p>You can close this window and return to your terminal.</p>
                  <p style="color: green; font-weight: bold;">Exchanging code for token...</p>
                </body>
              </html>
            `);

            // Close server
            this.server?.close();

            try {
              // Exchange code for token
              const token = await this.exchangeCodeForToken(code, config);
              resolve(token);
            } catch (err: any) {
              reject(err);
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; padding: 50px; text-align: center;">
                  <h1>❌ Authentication Failed</h1>
                  <p>Error: ${error || 'Unknown error'}</p>
                </body>
              </html>
            `);
            this.server?.close();
            reject(new Error(`OAuth failed: ${error}`));
          }
        }
      });

      this.server.listen(this.port, () => {
        console.log(`🔗 Callback server listening on http://localhost:${this.port}`);

        // Open browser
        open.default(authUrl).catch(err => {
          console.error('Failed to open browser:', err);
          console.log('\n📋 Please open this URL manually:');
          console.log(authUrl);
        });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.server?.listening) {
          this.server.close();
          reject(new Error('OAuth timeout - took longer than 5 minutes'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Refresh an expired access token
   */
  async refreshToken(
    refreshToken: string,
    config: Pick<OAuthConfig, 'clientId' | 'clientSecret' | 'tokenEndpoint'>
  ): Promise<OAuthToken> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
    });

    if (config.clientSecret) {
      params.append('client_secret', config.clientSecret);
    }

    try {
      const response = await axios.post(config.tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const token: OAuthToken = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken,
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in,
        scope: response.data.scope,
      };

      // Calculate expiration timestamp
      if (token.expires_in) {
        token.expires_at = Date.now() + token.expires_in * 1000;
      }

      return token;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error_description ||
                       error.response?.data?.error ||
                       error.message;
        throw new Error(`Token refresh failed: ${message}`);
      }
      throw error;
    }
  }

  async authenticateManual(serverName: string): Promise<string> {
    console.log(`\n📋 Manual OAuth Flow for ${serverName}`);
    console.log('\n1. The MCP server will provide an OAuth URL');
    console.log('2. Open it in your browser and approve');
    console.log('3. Copy the full callback URL and paste it here\n');

    // This would be implemented with readline
    throw new Error('Manual flow not yet implemented - use browser flow');
  }
}

export { OAuthConfig };
