# MCP OAuth Bridge - Architecture

## Design Philosophy

**Problem:** OAuth requires browser interaction, but MCP clients often run headless (VPS, Docker, CI/CD).

**Solution:** Separate auth (one-time, local) from runtime (continuous, anywhere).

---

## Architecture v2: Hybrid Approach

### Phase 1: Setup & Authentication (Local Machine)

```
┌─────────────────────────────────────────────────┐
│  Local Machine (Mac/Windows/Linux)             │
│                                                 │
│  1. mcp-oauth-bridge init                      │
│  2. mcp-oauth-bridge add granola <url>         │
│  3. mcp-oauth-bridge auth granola              │
│      └─▶ Opens browser                         │
│      └─▶ User completes OAuth                  │
│      └─▶ Token saved to ~/.mcp-bridge/tokens/  │
│                                                 │
└─────────────────────────────────────────────────┘
              │
              │ Copy tokens to VPS
              ▼
┌─────────────────────────────────────────────────┐
│  VPS / Remote Server                            │
│                                                 │
│  ~/.mcp-bridge/                                 │
│    ├── config.json                              │
│    └── tokens/                                  │
│         ├── granola.json (OAuth token)          │
│         └── clarify.json                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Phase 2: Runtime (VPS/Remote)

```
┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  OpenClaw        │────▶│  MCP Bridge      │────▶│  Granola MCP    │
│  (local VPS)     │HTTP │  (same VPS)      │OAuth│                 │
│                  │     │                  │     │  Clarify MCP    │
│  • Calls tools   │     │  • Proxies calls │     │                 │
│  • Gets responses│     │  • Refreshes     │     │  Any OAuth MCP  │
│                  │     │    tokens auto   │     │                 │
└──────────────────┘     │  • Caches        │     └─────────────────┘
                         └──────────────────┘
                                  │
                                  │ (uses cached tokens)
                                  │ (auto-refreshes)
                                  ▼
                         ~/.mcp-bridge/tokens/
```

---

## Token Management

### Initial Authentication
1. User runs `mcp-oauth-bridge auth <server>` on local machine
2. Opens browser for OAuth
3. Token saved locally with refresh token

### Token Deployment
```bash
# Copy tokens to VPS
scp -r ~/.mcp-bridge/tokens/ user@vps:~/.mcp-bridge/
```

### Auto-Refresh
- Bridge automatically refreshes OAuth tokens before expiry
- No manual intervention needed
- Tokens stay valid indefinitely

---

## Alternative: Manual OAuth (No Local Machine Needed)

For users without local machines:

```bash
mcp-oauth-bridge auth granola --manual
```

Output:
```
🔗 Visit this URL in ANY browser:
https://mcp.granola.ai/oauth/authorize?client_id=...&redirect_uri=...

After approving, you'll be redirected to:
http://localhost:8080/callback?code=...

📋 Paste the FULL URL here:
```

User pastes → Bridge extracts token → Saves

---

## Deployment Options

### Option 1: VPS Only (Recommended)
```bash
# One-time setup on Mac:
mcp-oauth-bridge auth granola
mcp-oauth-bridge auth clarify

# Deploy to VPS:
scp -r ~/.mcp-bridge root@vps:~/
ssh root@vps "mcp-oauth-bridge start"
```

### Option 2: Local Bridge (Original Plan)
```bash
# Bridge runs on Mac
# OpenClaw on VPS connects to Mac bridge
mcp-oauth-bridge start --host 0.0.0.0
```

### Option 3: Docker
```bash
docker run -v ~/.mcp-bridge:/root/.mcp-bridge \
  mcp-oauth-bridge:latest
```

---

## Security

1. **Token Storage**: Encrypted at rest
2. **API Auth**: Bearer token or password
3. **Network**: Can bind to localhost only
4. **Token Rotation**: Automatic refresh
5. **Audit Log**: All calls logged

---

## Comparison

| Approach | Setup | Runtime | Pros | Cons |
|----------|-------|---------|------|------|
| **Hybrid (Recommended)** | Local Mac | VPS | Simple, no Mac dependency after setup | One-time manual step |
| **Local Bridge** | Local Mac | Local Mac | No VPS config | Mac must stay on |
| **Manual OAuth** | VPS | VPS | 100% remote | Copy-paste for each MCP |

---

**Recommendation: Use Hybrid approach** - best balance of simplicity and functionality.
