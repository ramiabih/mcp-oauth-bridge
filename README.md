# MCP OAuth Bridge

Bridge OAuth-based MCP (Model Context Protocol) servers to headless environments. This tool allows you to authenticate MCP servers that require browser-based OAuth on your local machine, then use those tokens on a headless VPS.

## Problem Solved

When running OpenClaw or other MCP clients on a headless VPS, OAuth-based MCP servers like Granola and Clarify cannot authenticate because they require a browser. This bridge:

1. **Authenticates on your Mac** - Opens browser for OAuth flow
2. **Saves tokens securely** - Stores access and refresh tokens locally
3. **Runs on VPS** - Proxies MCP requests with Bearer tokens
4. **Auto-refreshes tokens** - Handles token expiration transparently

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────────┐
│             │  OAuth  │              │  Bearer │                 │
│  Mac/Local  ├────────▶│ OAuth Bridge ├────────▶│   MCP Server    │
│   Machine   │         │  (on VPS)    │  Token  │  (Granola etc)  │
│             │         │              │         │                 │
└─────────────┘         └──────────────┘         └─────────────────┘
                               │
                               │ JSON-RPC
                               ▼
                        ┌──────────────┐
                        │   OpenClaw   │
                        └──────────────┘
```

## Features

- ✅ **OAuth 2.1 with PKCE** - Secure authentication flow
- ✅ **Token Management** - Automatic refresh and expiration handling
- ✅ **HTTP Bridge Server** - RESTful API for MCP access
- ✅ **CLI Interface** - Easy configuration and management
- ✅ **Multiple Servers** - Support for multiple MCP servers
- ✅ **Secure Storage** - Token files with 600 permissions
- ✅ **Error Handling** - Clear, actionable error messages

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm

### Install

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/mcp-oauth-bridge.git
cd mcp-oauth-bridge

# Install dependencies
npm install

# Build the project
npm run build

# Optional: Link globally for system-wide access
npm link
```

## Quick Start

### 1. Initialize Configuration

```bash
mcp-oauth-bridge init
```

This creates `~/.mcp-bridge/` with:
- `config.json` - Bridge configuration
- `tokens/` - OAuth token storage
- A random password for API authentication

**Save the generated password** - you'll need it to connect!

### 2. Add MCP Server

```bash
mcp-oauth-bridge add granola https://mcp.granola.so \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET
```

### 3. Authenticate (on Mac)

```bash
mcp-oauth-bridge auth granola \
  --auth-endpoint https://auth.granola.so/authorize \
  --token-endpoint https://auth.granola.so/token \
  --scope "read:notes write:notes"
```

This will:
1. Open your browser for OAuth approval
2. Capture the authorization code
3. Exchange code for access token
4. Save token to `~/.mcp-bridge/tokens/granola.json`

### 4. Deploy to VPS

```bash
# Copy tokens to VPS
scp -r ~/.mcp-bridge root@YOUR_VPS_IP:~/

# Copy built code to VPS
npm run build
scp -r dist package.json package-lock.json root@YOUR_VPS_IP:~/mcp-oauth-bridge/

# SSH to VPS and install dependencies
ssh root@YOUR_VPS_IP
cd ~/mcp-oauth-bridge
npm install --production
```

### 5. Start Bridge on VPS

```bash
# On VPS (bind to localhost for security)
node dist/cli.js start --host 127.0.0.1 --port 3000
```

### 6. Configure OpenClaw

In OpenClaw's configuration on the VPS, point to the bridge:

```json
{
  "mcpServers": {
    "granola": {
      "url": "http://127.0.0.1:3000/mcp/granola",
      "transport": "http"
    }
  }
}
```

## CLI Commands

### Server Management

```bash
# List configured servers
mcp-oauth-bridge list

# Add server
mcp-oauth-bridge add <name> <url> [options]
  --client-id <id>           OAuth client ID
  --client-secret <secret>   OAuth client secret
  --auth-endpoint <url>      OAuth authorization endpoint
  --token-endpoint <url>     OAuth token endpoint
  --scope <scope>            OAuth scope

# Remove server
mcp-oauth-bridge remove <name>
```

### Authentication

```bash
# Authenticate with OAuth
mcp-oauth-bridge auth <name> \
  --auth-endpoint <url> \
  --token-endpoint <url> \
  --scope <scope>

# List saved tokens
mcp-oauth-bridge tokens
```

### Bridge Server

```bash
# Start bridge server
mcp-oauth-bridge start [options]
  --port <port>   Server port (default: 3000)
  --host <host>   Server host (default: localhost)
```

## API Endpoints

All endpoints except `/health` require Bearer token authentication.

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-18T00:00:00.000Z",
  "version": "0.1.0"
}
```

### List Servers

```bash
GET /servers
Authorization: Bearer YOUR_PASSWORD
```

Response:
```json
{
  "servers": ["granola", "clarify"]
}
```

### List Tools

```bash
GET /mcp/:server/tools
Authorization: Bearer YOUR_PASSWORD
```

Response:
```json
{
  "tools": [
    {
      "name": "search_notes",
      "description": "Search through your notes",
      "inputSchema": { ... }
    }
  ]
}
```

### Call Tool

```bash
POST /mcp/:server/call
Authorization: Bearer YOUR_PASSWORD
Content-Type: application/json

{
  "tool": "search_notes",
  "arguments": {
    "query": "meeting notes"
  }
}
```

Response:
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 3 notes..."
      }
    ]
  }
}
```

## Configuration

### Config File (`~/.mcp-bridge/config.json`)

```json
{
  "port": 3000,
  "host": "localhost",
  "auth": {
    "type": "password",
    "password": "YOUR_GENERATED_PASSWORD"
  },
  "servers": {
    "granola": {
      "name": "granola",
      "url": "https://mcp.granola.so",
      "oauth": {
        "clientId": "YOUR_CLIENT_ID",
        "clientSecret": "YOUR_CLIENT_SECRET",
        "tokenPath": "/Users/you/.mcp-bridge/tokens/granola.json"
      }
    }
  },
  "dataDir": "/Users/you/.mcp-bridge"
}
```

### Token File (`~/.mcp-bridge/tokens/granola.json`)

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "expires_at": 1708214400000,
  "scope": "read:notes write:notes"
}
```

**Security Note**: Token files are automatically created with 600 permissions (owner read/write only).

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- <command>

# Build TypeScript
npm run build

# Run tests (when implemented)
npm test

# Lint code (when configured)
npm run lint
```

## Troubleshooting

### Token Expired Error

```bash
# Re-authenticate
mcp-oauth-bridge auth <server-name>

# Check token status
mcp-oauth-bridge tokens
```

### Cannot Connect to MCP Server

1. Verify server URL: `mcp-oauth-bridge list`
2. Test connectivity: `curl https://mcp.example.com/health`
3. Check server logs for errors

### Port Already in Use

```bash
# Use different port
mcp-oauth-bridge start --port 3001
```

### OAuth Callback Timeout

- Check that port 8080 is not blocked by firewall
- Try opening the OAuth URL manually
- Verify OAuth endpoints are correct

## Security Considerations

1. **Token Storage**: Tokens are stored in `~/.mcp-bridge/tokens/` with 600 permissions
2. **API Authentication**: Bridge API requires Bearer token authentication
3. **Network Binding**: Default binds to `localhost` - not exposed to public internet
4. **PKCE**: Uses SHA-256 PKCE for OAuth flows
5. **No Logging**: Tokens are never logged or included in error messages

## Production Deployment

### Using systemd (VPS)

Create `/etc/systemd/system/mcp-bridge.service`:

```ini
[Unit]
Description=MCP OAuth Bridge
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/mcp-oauth-bridge
ExecStart=/usr/bin/node /root/mcp-oauth-bridge/dist/cli.js start --host 127.0.0.1
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mcp-bridge
sudo systemctl start mcp-bridge
sudo systemctl status mcp-bridge
```

### Using Docker (Future)

```bash
# Build image (not yet implemented)
docker build -t mcp-oauth-bridge .

# Run container
docker run -d \
  -p 3000:3000 \
  -v ~/.mcp-bridge:/root/.mcp-bridge \
  mcp-oauth-bridge
```

## Roadmap

- [ ] Docker image
- [ ] Token encryption at rest
- [ ] OAuth state validation
- [ ] Unit tests
- [ ] Integration tests
- [ ] Debug logging mode
- [ ] Input validation with Zod
- [ ] Rate limiting
- [ ] Prometheus metrics
- [ ] Health check for token validity

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests (when test framework is set up)
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: https://github.com/YOUR_USERNAME/mcp-oauth-bridge/issues
- **Discussions**: https://github.com/YOUR_USERNAME/mcp-oauth-bridge/discussions
- **Discord**: [OpenClaw Community](https://discord.gg/openclaw)

## Acknowledgments

- Built for the [OpenClaw](https://openclaw.ai) community
- Implements [Model Context Protocol](https://modelcontextprotocol.io) specification
- Inspired by the need for headless MCP server authentication

## Related Projects

- [OpenClaw](https://github.com/openclaw/openclaw) - AI agent platform
- [MCP Servers](https://github.com/modelcontextprotocol/servers) - Official MCP servers
- [Granola](https://granola.so) - Meeting notes MCP server
- [Clarify](https://clarify.ai) - Customer insights MCP server
