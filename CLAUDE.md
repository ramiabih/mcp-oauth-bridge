# MCP OAuth Bridge - Development Guide for Claude

This project is an OAuth bridge that allows OAuth-based MCP (Model Context Protocol) servers to work in headless environments. When working on this codebase, follow these guidelines.

## Project Architecture

### Core Components

1. **ConfigManager** (`src/config.ts`)
   - Manages bridge configuration in `~/.mcp-bridge/config.json`
   - Handles server registry (add/remove/list servers)
   - Generates and stores authentication password
   - File permissions: Config files should be 600 (owner read/write only)

2. **OAuthHandler** (`src/oauth.ts`)
   - Implements OAuth 2.1 with PKCE (Proof Key for Code Exchange)
   - Opens browser for user authentication
   - Runs temporary HTTP server on port 8080 for OAuth callback
   - Exchanges authorization code for access token
   - Refreshes expired tokens
   - Security: Uses SHA-256 for PKCE challenge, crypto.randomBytes for secure random generation

3. **TokenManager** (`src/tokens.ts`)
   - Persists OAuth tokens to `~/.mcp-bridge/tokens/{server}.json`
   - Automatically refreshes expired tokens (with 60s buffer)
   - File permissions: Token files MUST be 600 (owner read/write only)
   - Token expiration: Uses `expires_at` timestamp (milliseconds since epoch)

4. **MCPClient** (`src/mcp-client.ts`)
   - HTTP client for calling MCP servers
   - Implements JSON-RPC 2.0 protocol
   - Methods: `tools/list` and `tools/call`
   - Auto-injects Bearer token from TokenManager
   - Error handling: Maps HTTP errors to user-friendly messages

5. **BridgeServer** (`src/server.ts`)
   - Express HTTP server that proxies requests to MCP servers
   - Routes:
     - `GET /health` - Health check (no auth)
     - `GET /servers` - List configured servers (auth required)
     - `GET /mcp/:server/tools` - List tools from server (auth required)
     - `POST /mcp/:server/call` - Call tool on server (auth required)
   - Auth: Bearer token in Authorization header
   - Default: Binds to localhost:3000

6. **CLI** (`src/cli.ts`)
   - Commander.js-based CLI interface
   - Commands: init, add, remove, list, auth, tokens, start
   - Entry point: `npm run dev -- <command>` or `mcp-oauth-bridge <command>` after build

### Data Flow

```
User → CLI → ConfigManager/OAuthHandler/TokenManager
                ↓
User → CLI → BridgeServer → MCPClient → TokenManager
                                  ↓
                            External MCP Server (with Bearer token)
```

### File Structure

```
~/.mcp-bridge/
├── config.json          # Bridge configuration
└── tokens/
    ├── granola.json     # OAuth tokens per server
    └── clarify.json
```

## Development Guidelines

### Adding New Features

1. **New OAuth Providers**: Extend `OAuthHandler` to support provider-specific flows (e.g., Google, GitHub)
2. **New MCP Methods**: Add methods to `MCPClient` following JSON-RPC 2.0 pattern
3. **New API Routes**: Add to `BridgeServer.setupRoutes()` with auth middleware
4. **New CLI Commands**: Add to `cli.ts` using Commander pattern

### Error Handling Principles

- **User-facing errors**: Clear, actionable messages (e.g., "Token expired. Re-authenticate with: mcp-oauth-bridge auth <server>")
- **HTTP errors**: Map status codes to user-friendly messages
- **Network errors**: Handle ECONNREFUSED, ETIMEDOUT, ENOTFOUND gracefully
- **OAuth errors**: Parse `error_description` from OAuth responses

### Security Best Practices

1. **File Permissions**: All token files MUST be 600 (owner read/write only)
2. **Password Generation**: Use crypto.randomBytes(), not Math.random()
3. **PKCE**: Always use SHA-256 for code_challenge_method
4. **No Client Secrets in URLs**: Pass client_secret in POST body, not query params
5. **Token Storage**: Never log tokens or include in error messages
6. **Server Binding**: Default to localhost, not 0.0.0.0 (security by default)

### Testing Strategy

1. **Local Testing**: Use mock MCP server or test with real OAuth provider
2. **VPS Testing**: Deploy to headless VPS, test token refresh and auto-retry
3. **Integration Testing**: Test full flow: Mac auth → token deploy → VPS bridge → OpenClaw
4. **Error Scenarios**: Test token expiry, network failures, 401/403 responses

### Common Pitfalls

1. **Token Expiration**: Always check `expires_at` with buffer (60s recommended)
2. **Refresh Token Reuse**: Some providers issue new refresh_token on refresh - save it!
3. **Port Conflicts**: OAuth callback server uses port 8080 - make configurable if needed
4. **Race Conditions**: Token refresh may be called concurrently - add locking if needed
5. **State Validation**: OAuth state parameter prevents CSRF - validate on callback

### Code Style

- **TypeScript**: Strict mode, no implicit any
- **Async/await**: Prefer over Promise chains
- **Error handling**: Try-catch with specific error types
- **Logging**: Use chalk for colored output (green ✅ success, red ❌ error, yellow ⚠️ warning)
- **Comments**: Explain *why*, not *what* (code should be self-explanatory)

### Dependencies

- **express**: HTTP server framework
- **axios**: HTTP client for MCP calls
- **commander**: CLI framework
- **chalk**: Terminal colors
- **open**: Open browser for OAuth
- **fs-extra**: File system operations with promises

### Future Enhancements (Not Yet Implemented)

- [ ] Docker image for easy deployment
- [ ] Systemd service file for VPS
- [ ] Debug logging mode (--verbose flag)
- [ ] Input validation with Zod or similar
- [ ] Unit tests with Jest
- [ ] Token encryption at rest
- [ ] OAuth state validation
- [ ] Port conflict detection and auto-retry
- [ ] Token refresh locking for concurrent requests
- [ ] Graceful shutdown (drain connections)

## Common Commands

```bash
# Development
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev -- init  # Run CLI in dev mode

# Usage
mcp-oauth-bridge init                          # Initialize config
mcp-oauth-bridge add granola https://...       # Add server
mcp-oauth-bridge auth granola --client-id=...  # Authenticate
mcp-oauth-bridge tokens                        # List tokens
mcp-oauth-bridge start --port 3000             # Start bridge

# Testing
curl http://localhost:3000/health              # Health check
curl -H "Authorization: Bearer <password>" \
  http://localhost:3000/servers                # List servers
```

## Troubleshooting

### "Token expired" error
- Run: `mcp-oauth-bridge auth <server>`
- Check token expiry: `mcp-oauth-bridge tokens`

### "Cannot connect to MCP server"
- Verify server URL in config
- Check that MCP server is running
- Test with curl to verify network connectivity

### "Authentication failed"
- Verify OAuth client_id and client_secret
- Check that redirect_uri matches: `http://localhost:8080/callback`
- Inspect OAuth provider's error message in browser

### Port 8080 already in use
- Kill conflicting process or add --port flag to auth command (future enhancement)

## VPS Deployment

1. Build on Mac: `npm run build`
2. Copy to VPS: `scp -r dist package.json root@<ip>:~/mcp-oauth-bridge/`
3. Install deps: `ssh root@<ip> 'cd ~/mcp-oauth-bridge && npm install --production'`
4. Copy tokens: `scp -r ~/.mcp-bridge/tokens root@<ip>:~/.mcp-bridge/`
5. Start bridge: `ssh root@<ip> 'cd ~/mcp-oauth-bridge && node dist/cli.js start --host 127.0.0.1'`
6. SSH tunnel: `ssh -L 3000:127.0.0.1:3000 root@<ip>`

## OAuth Providers

### Granola MCP
- OAuth endpoints not publicly documented (early access)
- Requires Google OAuth for individual users
- No service account access
- Workaround: Inspect browser network traffic to extract endpoints

### Generic OAuth 2.1 Provider
- Required fields:
  - `authorization_endpoint`: Where users approve access
  - `token_endpoint`: Where to exchange code for token
  - `client_id`: Your OAuth application ID
  - `client_secret`: (optional) Your OAuth application secret
  - `scope`: (optional) Requested permissions

## MCP Protocol Notes

- Uses JSON-RPC 2.0 over HTTP
- All requests include `jsonrpc: "2.0"` and incrementing `id`
- Methods: `tools/list`, `tools/call`, `resources/list`, etc.
- Bearer token in `Authorization: Bearer <token>` header
- Response format: `{jsonrpc: "2.0", result: {...}, id: 1}` or `{jsonrpc: "2.0", error: {...}, id: 1}`

## When Making Changes

1. **Read before modifying**: Always read existing files to understand patterns
2. **Test locally first**: Use `npm run dev` to test before building
3. **Check types**: Run `npm run build` to catch TypeScript errors
4. **Update this guide**: Add new patterns, gotchas, or architecture changes
5. **Follow existing patterns**: Match coding style and error handling patterns
6. **Think about security**: Consider token exposure, file permissions, network access

---

**Last Updated**: 2026-02-18 (Initial MVP implementation)
