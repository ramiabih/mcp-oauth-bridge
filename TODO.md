# TODO - MCP OAuth Bridge

## Priority 1: Core Functionality

- [ ] **OAuth Handler** (`src/oauth.ts`)
  - [ ] Start local callback server
  - [ ] Generate OAuth authorization URL
  - [ ] Handle callback and extract tokens
  - [ ] Support manual flow (paste URL)

- [ ] **Token Manager** (`src/tokens.ts`)
  - [ ] Save/load tokens securely
  - [ ] Check expiry
  - [ ] Auto-refresh tokens
  - [ ] Handle refresh token rotation

- [ ] **MCP Client** (`src/mcp-client.ts`)
  - [ ] Connect to MCP server (HTTP/SSE)
  - [ ] List tools endpoint
  - [ ] Call tool endpoint
  - [ ] Add OAuth bearer token to requests

- [ ] **HTTP Server** (`src/server.ts`)
  - [ ] Express server with auth middleware
  - [ ] GET /servers - list configured servers
  - [ ] GET /mcp/:server/tools - list tools
  - [ ] POST /mcp/:server/call - call tool
  - [ ] Health check endpoint

- [ ] **CLI** (`src/cli.ts`)
  - [ ] `init` - initialize config
  - [ ] `add <name> <url>` - add server
  - [ ] `remove <name>` - remove server
  - [ ] `list` - list servers
  - [ ] `auth <name>` - authenticate
  - [ ] `start` - start bridge server
  - [ ] `--help` for all commands

## Priority 2: Polish

- [ ] Error handling
- [ ] Logging (debug mode)
- [ ] Input validation
- [ ] Better error messages
- [ ] Progress indicators

## Priority 3: Testing

- [ ] Unit tests for config manager
- [ ] Unit tests for token manager
- [ ] Integration test with mock MCP server
- [ ] Test OAuth flow
- [ ] Test token refresh

## Priority 4: Documentation

- [ ] API documentation
- [ ] Examples for common MCP servers
- [ ] Troubleshooting guide
- [ ] Video walkthrough

## Priority 5: Features

- [ ] Docker image
- [ ] Systemd service file
- [ ] Token encryption at rest
- [ ] Rate limiting
- [ ] Request/response logging
- [ ] Metrics endpoint
- [ ] Support stdio MCP servers (convert to HTTP)

## Known Issues

- [ ] OAuth callback server port conflicts
- [ ] Token refresh race conditions
- [ ] Handle MCP server errors gracefully

## Community Requests

(Add issues from GitHub here)
