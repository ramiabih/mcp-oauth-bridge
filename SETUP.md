# Quick Setup Guide

## 1. Create GitHub Repo

1. Go to: https://github.com/new
2. Repository name: `mcp-oauth-bridge`
3. Description: `Bridge OAuth-based MCP servers to headless environments`
4. Public repo
5. Don't initialize with README (we have one)
6. Click "Create repository"

## 2. Push Code

```bash
cd ~/mcp-oauth-bridge
git remote add origin https://github.com/YOUR_USERNAME/mcp-oauth-bridge.git
git branch -M main
git push -u origin main
```

## 3. Open in Cursor

```bash
cd ~/mcp-oauth-bridge
cursor .
```

Or: File → Open Folder → select `mcp-oauth-bridge`

## 4. Install Dependencies

```bash
npm install
```

## 5. What's Already Done

✅ Project structure
✅ TypeScript config
✅ Core types
✅ Config manager (save/load config, add/remove servers)
✅ Documentation (README, ARCHITECTURE, TODO, CONTRIBUTING)

## 6. What's Next (Pick up in Cursor)

Priority order:

1. **OAuth Handler** (`src/oauth.ts`)
   - Start callback server
   - Open browser for auth
   - Handle callback, extract token

2. **Token Manager** (`src/tokens.ts`)
   - Save/load tokens
   - Auto-refresh before expiry

3. **MCP Client** (`src/mcp-client.ts`)
   - HTTP client to call MCP servers
   - Add OAuth bearer token

4. **HTTP Server** (`src/server.ts`)
   - Express API
   - Auth middleware
   - Proxy to MCP servers

5. **CLI** (`src/cli.ts`)
   - Wire up all commands
   - Add Commander.js

## 7. Testing

Once you have OAuth + Token manager working:

```bash
# On Mac (for initial auth):
npm run dev -- auth granola

# Tokens saved to ~/.mcp-bridge/tokens/

# Copy to VPS:
scp -r ~/.mcp-bridge root@77.42.68.61:~/

# Start bridge on VPS:
npm start
```

## 8. Resources

- MCP Spec: https://modelcontextprotocol.io/
- OAuth 2.0: https://oauth.net/2/
- OpenClaw: https://github.com/openclaw/openclaw

## Questions?

Open an issue on GitHub or ask in Cursor!

---

Good luck! 🚀
