# GitHub Issues to Create

Once you push to GitHub, create these issues via:
1. `gh issue create` (after installing GitHub CLI: https://cli.github.com), OR
2. Paste each one at github.com/ramiabih/mcp-oauth-bridge/issues/new

---

## Label Setup (create these first)

Go to github.com/ramiabih/mcp-oauth-bridge/labels and create:
- `enhancement` (blue) — new features
- `polish` (light blue) — UX improvements
- `testing` (green) — test coverage
- `documentation` (purple) — docs
- `good first issue` (teal) — beginner-friendly

---

## Issues

### [enhancement] Add debug/verbose logging mode

**Labels:** `enhancement`, `polish`

Add a `--verbose` / `--debug` flag to the CLI and server that prints:
- Outgoing requests to MCP servers (method, URL, response status)
- Token load/refresh events
- Incoming bridge API requests

Suggested implementation: accept a `LOG_LEVEL` env var (`debug`, `info`, `warn`) and use a lightweight logger like `pino` or simple `console.log` guards.

---

### [enhancement] Token encryption at rest

**Labels:** `enhancement`

Currently OAuth tokens are stored as plaintext JSON in `~/.mcp-bridge/tokens/`. Add optional AES-256-GCM encryption using a key derived from the bridge password.

The file permissions are already set to `600`, but encryption adds a second layer of protection in case the filesystem is compromised.

API: `mcp-oauth-bridge init --encrypt` enables encryption for that config. Tokens are transparently decrypted on load.

---

### [enhancement] Docker image & docker-compose example

**Labels:** `enhancement`

Publish a Docker image to `ghcr.io/ramiabih/mcp-oauth-bridge` (or Docker Hub).

Provide a `docker-compose.yml` example showing:
- Mounting `~/.mcp-bridge` as a volume (so pre-authed tokens survive container restarts)
- Exposing port 3000
- Setting `HOST=0.0.0.0`

Tokens should be generated locally and copied into the volume before starting.

---

### [enhancement] Systemd service file

**Labels:** `enhancement`

Add a `mcp-oauth-bridge.service` systemd unit file and a `mcp-oauth-bridge install-service` CLI command that:
1. Copies the service file to `/etc/systemd/system/`
2. Runs `systemctl enable mcp-oauth-bridge`
3. Prints next steps

This makes running the bridge on a VPS as a persistent daemon trivial.

---

### [enhancement] Support stdio MCP servers (convert to HTTP)

**Labels:** `enhancement`

Some MCP servers only expose a stdio interface (spawned as a subprocess). Add a `--stdio` flag to `mcp-oauth-bridge add`:

```
mcp-oauth-bridge add myserver --stdio -- npx @myorg/mcp-server
```

The bridge spawns the subprocess and wraps its stdio JSON-RPC in the same HTTP API, making it accessible to remote clients without OAuth overhead.

---

### [enhancement] Rate limiting on bridge API

**Labels:** `enhancement`

Add optional rate limiting to the Express server to prevent abuse. Configurable via `config.json`:

```json
"rateLimit": { "windowMs": 60000, "max": 100 }
```

Use `express-rate-limit` (already a common Express ecosystem package). Apply it only to MCP call routes, not `/health`.

---

### [enhancement] Metrics endpoint

**Labels:** `enhancement`

Add a `GET /metrics` endpoint (Prometheus-compatible text format) exposing:
- `mcp_requests_total{server, method, status}` — request counters
- `mcp_token_refreshes_total{server}` — token refresh events
- `mcp_bridge_uptime_seconds` — process uptime

Protected by the same Bearer token as other routes.

---

### [enhancement] Integration tests with mock MCP server

**Labels:** `testing`

Add an integration test suite that:
1. Spins up a mock MCP server (Express) implementing `tools/list` and `tools/call`
2. Starts the bridge pointing at the mock server
3. Makes real HTTP requests to the bridge and validates responses
4. Tests auth rejection (missing/wrong token)
5. Tests 502 handling when upstream is down

Use `supertest` for in-process HTTP testing of the bridge Express app.

---

### [enhancement] Test the full OAuth PKCE flow

**Labels:** `testing`

Add an integration test for `runOAuthFlow` that:
1. Mocks `open` (browser opening)
2. Starts the callback server
3. Simulates the OAuth redirect by making an HTTP request to `localhost:<port>/callback?code=test&state=<state>`
4. Validates that token exchange is called with correct PKCE params
5. Validates the token is saved to disk

---

### [documentation] API documentation

**Labels:** `documentation`

Create `docs/API.md` with:
- Full OpenAPI-style spec for all endpoints
- Request/response examples with curl
- Authentication header format
- Error response codes and meanings
- Rate limit headers (when implemented)

---

### [documentation] Examples for common MCP servers

**Labels:** `documentation`

Create `docs/examples/` with a setup guide for each supported server:
- `granola.md` — OAuth endpoints, required scopes, client ID source
- `clarify.md` — same
- `linear.md` — same
- `notion.md` — same

Each guide shows the exact `mcp-oauth-bridge add` command to run.

---

### [documentation] Troubleshooting guide

**Labels:** `documentation`

Create `docs/TROUBLESHOOTING.md` covering:
- Port 8080 already in use → use `--callback-port`
- Browser doesn't open → use `--manual`
- Token expired error → run `auth` again
- 502 from bridge → check MCP server is up
- "Config not found" → run `init` first
- VPS: tokens not refreshing → check tokenUrl is correct

---

### [polish] Progress indicators during OAuth flow

**Labels:** `polish`, `good first issue`

The `auth` command currently prints plain text. Add:
- A spinner during "waiting for browser callback" (use `ora`)
- A spinner during token exchange
- Clear success/failure summary at the end

---

### [polish] Better error messages for misconfigured servers

**Labels:** `polish`, `good first issue`

When `--auth-url` or `--token-url` are missing or malformed during `auth`, show a helpful error pointing to the exact `add` command syntax, e.g.:

```
Error: Server 'granola' has no authorizationUrl.
Fix: mcp-oauth-bridge remove granola && mcp-oauth-bridge add granola <url> --auth-url <...>
```

---

### [polish] Input validation on `add` command

**Labels:** `polish`, `good first issue`

Validate inputs to `mcp-oauth-bridge add`:
- `<url>` must be a valid HTTP/HTTPS URL
- `--auth-url` and `--token-url` must be valid HTTPS URLs
- `--client-id` must be non-empty
- `--scopes` must not contain special characters

Show friendly error messages for each case.
