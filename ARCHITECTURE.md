# Architecture

## Core Idea

OAuth requires a browser for the initial authorization step. Headless servers don't have one. The bridge solves this by splitting auth from runtime:

- **Auth** happens once on a local machine (where a browser works)
- **Runtime** happens on the VPS with the saved tokens, auto-refreshed forever

## Flow

### Step 1 — Authenticate locally

```
mcp-oauth-bridge auth <server>
        │
        ├─ generates PKCE code_verifier + code_challenge (SHA-256)
        ├─ starts callback server on localhost:8080
        ├─ opens browser → user completes OAuth
        ├─ callback server receives authorization code
        ├─ exchanges code + code_verifier for access + refresh tokens
        └─ saves token to ~/.mcp-bridge/tokens/<server>.json (mode 600)
```

### Step 2 — Deploy

```bash
scp -r ~/.mcp-bridge/tokens/ user@vps:~/.mcp-bridge/
```

### Step 3 — Runtime on VPS

```
MCP client  →  GET /mcp/granola/tools  →  bridge
                                              │
                                  load token from disk
                                  if expired → POST tokenUrl (refresh)
                                  save new token
                                              │
                                     POST granola.url (JSON-RPC)
                                     Authorization: Bearer <access_token>
                                              │
                                        return tools list
```

## Components

| File | Responsibility |
|------|---------------|
| `config.ts` | Reads/writes `~/.mcp-bridge/config.json`. Manages server registry. |
| `tokens.ts` | Loads/saves tokens. Checks expiry (5-min buffer). Handles refresh token rotation. |
| `oauth.ts` | PKCE flow: generates params, runs callback server, exchanges code for token. |
| `mcp-client.ts` | Sends JSON-RPC 2.0 requests to upstream MCP servers with valid Bearer token. |
| `server.ts` | Express API. Auth middleware validates the bridge's own password. |
| `cli.ts` | Commander CLI wiring all the above together. |

## Token Refresh

Tokens are refreshed proactively (5 minutes before expiry) inside `TokenManager.getValidToken()`, which is called by `MCPClient` before every upstream request. Refresh token rotation is handled — if the server returns a new `refresh_token`, it replaces the old one on disk.

**Known limitation:** `getValidToken` is not concurrency-safe. For single-process sequential use this is fine; a production hardening would use a per-server mutex.

## Security

- Token files are written with mode `600` (user read/write only)
- Bridge API requires a Bearer token on every request (except `/health`)
- PKCE is used for the OAuth flow — no client secret needed for public clients
- Tokens are stored as plaintext JSON (encryption at rest is on the [roadmap](TODO.md))

## Deployment Options

**Option A: Auth local, run on VPS** (recommended)
```bash
# Local machine:
mcp-oauth-bridge auth granola
scp -r ~/.mcp-bridge/ user@vps:~/

# VPS:
mcp-oauth-bridge start --host 0.0.0.0
```

**Option B: Run the bridge locally, access remotely**
```bash
mcp-oauth-bridge start --host 0.0.0.0
# Clients on other machines connect to your local IP
```

**Option C: Docker** (not yet shipped — see [TODO](TODO.md))
```bash
docker run -v ~/.mcp-bridge:/root/.mcp-bridge mcp-oauth-bridge
```
