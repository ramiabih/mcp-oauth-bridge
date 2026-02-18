/**
 * OAuth 2.0 PKCE Authorization Code flow handler.
 *
 * Designed for local-machine use: opens a browser, starts a one-shot callback
 * server, exchanges the code for tokens, and saves them via TokenManager.
 * A --manual fallback allows pasting the redirect URL when a browser is not available.
 */
import * as http from 'http';
import * as crypto from 'crypto';
import * as readline from 'readline';
import open from 'open';
import axios from 'axios';
import chalk from 'chalk';
import { OAuthToken, MCPServer, PKCEParams, OAuthCallbackResult } from './types';
import { TokenManager } from './tokens';

const DEFAULT_CALLBACK_PORT = 8080;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// --- PKCE helpers ---

function generatePKCE(): PKCEParams {
  // code_verifier: 43-128 URL-safe chars (RFC 7636)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');

  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}

function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

// --- Authorization URL ---

function buildAuthorizationUrl(
  server: MCPServer,
  pkce: PKCEParams,
  state: string,
  callbackPort: number
): string {
  const oauth = server.oauth!;
  const redirectUri = `http://localhost:${callbackPort}/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: oauth.clientId!,
    redirect_uri: redirectUri,
    state,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: pkce.codeChallengeMethod,
  });

  if (oauth.scopes && oauth.scopes.length > 0) {
    params.set('scope', oauth.scopes.join(' '));
  }

  return `${oauth.authorizationUrl}?${params.toString()}`;
}

// --- Callback server ---

/**
 * Starts a one-shot HTTP server that waits for the OAuth redirect callback.
 * Resolves with { code, state } once received, then shuts itself down.
 * Rejects after timeoutMs.
 */
function waitForCallback(
  callbackPort: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<OAuthCallbackResult> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://localhost:${callbackPort}`);

      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = reqUrl.searchParams.get('code');
      const state = reqUrl.searchParams.get('state');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authentication failed</h1><p>${reqUrl.searchParams.get('error_description') ?? error}</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Missing code or state</h1>');
        server.close();
        reject(new Error('OAuth callback missing code or state parameter'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body style="font-family:sans-serif;text-align:center;padding:50px">' +
        '<h1>Authentication successful!</h1>' +
        '<p>You can close this tab and return to the terminal.</p>' +
        '</body></html>'
      );

      server.close();
      resolve({ code, state });
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error(`OAuth callback timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${callbackPort} is already in use. Use --callback-port to choose a different port.`
        ));
      } else {
        reject(err);
      }
    });

    server.listen(callbackPort, 'localhost', () => {
      // Server is ready
    });

    server.on('close', () => clearTimeout(timeout));
  });
}

// --- Manual fallback ---

/**
 * Prompts the user to paste the full redirect URL from their browser.
 * Used when --manual is passed or when open() fails.
 */
async function manualCallback(): Promise<OAuthCallbackResult> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve, reject) => {
    rl.question(
      chalk.cyan('\nPaste the full redirect URL from your browser:\n> '),
      (answer) => {
        rl.close();
        try {
          const parsed = new URL(answer.trim());
          const code = parsed.searchParams.get('code');
          const state = parsed.searchParams.get('state');

          if (!code || !state) {
            reject(new Error('Could not parse code or state from the pasted URL'));
            return;
          }

          resolve({ code, state });
        } catch {
          reject(new Error('Invalid URL pasted'));
        }
      }
    );
  });
}

// --- Token exchange ---

async function exchangeCodeForToken(
  server: MCPServer,
  code: string,
  pkce: PKCEParams,
  callbackPort: number
): Promise<OAuthToken> {
  const oauth = server.oauth!;
  const redirectUri = `http://localhost:${callbackPort}/callback`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: oauth.clientId!,
    code_verifier: pkce.codeVerifier,
  });

  if (oauth.clientSecret) {
    params.append('client_secret', oauth.clientSecret);
  }

  try {
    const response = await axios.post<OAuthToken>(
      oauth.tokenUrl!,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const body = JSON.stringify(err.response?.data ?? {});
      throw new Error(`Token exchange failed (HTTP ${status}): ${body}`);
    }
    throw err;
  }
}

// --- Main entry point ---

export interface OAuthFlowOptions {
  callbackPort?: number;
  manual?: boolean;
}

/**
 * Runs a full PKCE OAuth 2.0 Authorization Code flow and saves the resulting token.
 *
 * Flow:
 *   1. Validate server has required OAuth config
 *   2. Generate PKCE params + state
 *   3. Build authorization URL
 *   4. Start callback server (or use manual flow)
 *   5. Open browser (falls back to printing URL)
 *   6. Wait for callback
 *   7. Verify state (CSRF protection)
 *   8. Exchange code for token
 *   9. Save token via TokenManager
 */
export async function runOAuthFlow(
  serverName: string,
  server: MCPServer,
  tokenManager: TokenManager,
  options: OAuthFlowOptions = {}
): Promise<OAuthToken> {
  const { callbackPort = DEFAULT_CALLBACK_PORT, manual = false } = options;

  // Validate required OAuth config
  if (!server.oauth?.authorizationUrl) {
    throw new Error(`Server '${serverName}' has no authorizationUrl. Run: mcp-oauth-bridge add with --auth-url`);
  }
  if (!server.oauth?.tokenUrl) {
    throw new Error(`Server '${serverName}' has no tokenUrl. Run: mcp-oauth-bridge add with --token-url`);
  }
  if (!server.oauth?.clientId) {
    throw new Error(`Server '${serverName}' has no clientId. Run: mcp-oauth-bridge add with --client-id`);
  }

  const pkce = generatePKCE();
  const state = generateState();
  const authUrl = buildAuthorizationUrl(server, pkce, state, callbackPort);

  let callbackResult: OAuthCallbackResult;

  if (manual) {
    console.log(chalk.bold('\nOpen this URL in your browser to authenticate:'));
    console.log(chalk.cyan(authUrl));
    callbackResult = await manualCallback();
  } else {
    // Start callback server first, then open browser
    const callbackPromise = waitForCallback(callbackPort);

    console.log(chalk.bold(`\nOpening browser for authentication...`));
    console.log(chalk.dim(`Callback listening on http://localhost:${callbackPort}/callback`));
    console.log(chalk.dim('\nIf the browser did not open, visit this URL manually:'));
    console.log(chalk.cyan(authUrl));

    try {
      await open(authUrl);
    } catch {
      // Browser open failed — user will use the printed URL
    }

    callbackResult = await callbackPromise;
  }

  // CSRF check
  if (callbackResult.state !== state) {
    throw new Error('OAuth state mismatch — possible CSRF attack. Please try again.');
  }

  console.log(chalk.dim('\nExchanging authorization code for token...'));
  const token = await exchangeCodeForToken(server, callbackResult.code, pkce, callbackPort);

  await tokenManager.saveToken(serverName, token);

  console.log(chalk.green(`\n✅ Authentication successful for '${serverName}'!`));
  if (token.expires_in) {
    const expiresIn = Math.round(token.expires_in / 60);
    console.log(chalk.dim(`   Token expires in ${expiresIn} minutes (auto-refresh enabled)`));
  }

  return token;
}
