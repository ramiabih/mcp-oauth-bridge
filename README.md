# MCP OAuth Bridge 🌉

**Bridge OAuth-based MCP servers to headless environments**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Problem

Many MCP servers (Model Context Protocol) use OAuth 2.0 browser-based authentication, which doesn't work on:
- Headless VPS servers
- Docker containers
- CI/CD pipelines
- Remote development environments

This means you can't use MCP servers like Granola, Clarify, Linear, or Notion with tools like OpenClaw running on a remote server.

## Solution

MCP OAuth Bridge runs on your local machine (where browser OAuth works) and provides a simple HTTP API for headless clients to access OAuth-based MCP servers.

```
Remote Server → MCP OAuth Bridge (local) → OAuth MCP Servers
                        ↓
                Browser OAuth works here!
```

## Features

- ✅ **Universal**: Works with ANY OAuth-based MCP server
- ✅ **Simple HTTP API**: Easy integration with any MCP client
- ✅ **Token caching**: OAuth tokens cached securely
- ✅ **Multi-server**: Support multiple MCP servers simultaneously
- ✅ **Secure**: Password/token authentication for API access
- ✅ **Docker support**: Run in container if needed
- ✅ **Open source**: MIT licensed

## Quick Start

### 1. Install

\`\`\`bash
npm install -g mcp-oauth-bridge
\`\`\`

### 2. Configure

\`\`\`bash
mcp-oauth-bridge init
# Creates ~/.mcp-bridge/config.json
\`\`\`

### 3. Add MCP Servers

\`\`\`bash
mcp-oauth-bridge add granola https://mcp.granola.ai/mcp
mcp-oauth-bridge add clarify https://api.clarify.ai/mcp
\`\`\`

### 4. Authenticate

\`\`\`bash
mcp-oauth-bridge auth granola
# Opens browser for OAuth
\`\`\`

### 5. Start Bridge

\`\`\`bash
mcp-oauth-bridge start --port 3000 --password your-secure-password
# Bridge running at http://localhost:3000
\`\`\`

### 6. Use from Remote Server

\`\`\`bash
# From OpenClaw or any MCP client:
curl -H "Authorization: Bearer your-secure-password" \
  http://your-mac-ip:3000/mcp/granola/tools
\`\`\`

## Configuration

\`~/.mcp-bridge/config.json\`:

\`\`\`json
{
  "port": 3000,
  "auth": {
    "type": "password",
    "password": "your-secure-password"
  },
  "servers": {
    "granola": {
      "url": "https://mcp.granola.ai/mcp",
      "oauth": {
        "tokenPath": "~/.mcp-bridge/tokens/granola.json"
      }
    },
    "clarify": {
      "url": "https://api.clarify.ai/mcp",
      "oauth": {
        "tokenPath": "~/.mcp-bridge/tokens/clarify.json"
      }
    }
  }
}
\`\`\`

## API Endpoints

### List Servers
\`GET /servers\`

### List Tools for a Server
\`GET /mcp/:server/tools\`

### Call a Tool
\`POST /mcp/:server/call\`
\`\`\`json
{
  "tool": "search_meetings",
  "args": {
    "query": "product roadmap"
  }
}
\`\`\`

## Use Cases

- **OpenClaw on VPS**: Access Granola meeting notes from remote agent
- **CI/CD**: Use MCP tools in GitHub Actions
- **Docker**: Run MCP clients in containers
- **Remote Dev**: Access OAuth MCPs from remote workspaces

## Supported MCP Servers

Tested with:
- ✅ Granola (meeting notes)
- ✅ Clarify (CRM)
- ✅ Linear (project management)
- ✅ Notion (notes/docs)
- ✅ Any OAuth 2.0 MCP server

## Architecture

\`\`\`
┌─────────────────┐
│  MCP Client     │
│  (OpenClaw/etc) │
└────────┬────────┘
         │ HTTP + Auth
         ▼
┌─────────────────┐
│  MCP OAuth      │
│  Bridge         │
│  • Auth Handler │
│  • Token Cache  │
│  • Proxy        │
└────────┬────────┘
         │ OAuth + JWT
         ▼
┌─────────────────┐
│  MCP Servers    │
│  • Granola      │
│  • Clarify      │
│  • etc.         │
└─────────────────┘
\`\`\`

## Development

\`\`\`bash
git clone https://github.com/YOUR_USERNAME/mcp-oauth-bridge
cd mcp-oauth-bridge
npm install
npm run dev
\`\`\`

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT © 2026

## Related Projects

- [OpenClaw](https://github.com/openclaw/openclaw) - Personal AI assistant
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [mcporter](https://github.com/modelcontextprotocol/mcporter) - MCP CLI

## Credits

Built to solve the OAuth headless problem for OpenClaw users.

---

**Star ⭐ this repo if you find it useful!**
