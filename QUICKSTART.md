# MCP OAuth Bridge - Quick Start with Granola

## What This Does

Allows OpenClaw running on a headless VPS to access OAuth-based MCP servers like Granola that require browser authentication.

## Architecture

```
Your Mac (One-Time Auth) → VPS (Bridge 24/7) → Granola MCP
                              ↑
                          OpenClaw
```

## Setup (5 Minutes)

### 1. Authenticate with Granola (On Mac)

```bash
cd ~/Documents/github/mcp-oauth-bridge

# Install dependencies
npm install

# Initialize bridge
npm run dev -- init

# Add Granola server
npm run dev -- add granola https://mcp.granola.ai/mcp \
  --client-id client_01KHQ3SR2BPS0MH5CY3ADRJMHG

# Authenticate (opens browser)
npm run dev -- auth granola \
  --auth-endpoint https://mcp-auth.granola.ai/oauth2/authorize \
  --token-endpoint https://mcp-auth.granola.ai/oauth2/token \
  --scope "openid email profile offline_access"

# Verify token saved
npm run dev -- tokens
```

### 2. Deploy to VPS

```bash
# One-command deployment
./deploy-to-vps.sh 77.42.68.61 root
```

### 3. Start Bridge on VPS

**Option A: Systemd Service (Recommended)**

```bash
ssh root@77.42.68.61

# Copy service file
cp ~/mcp-oauth-bridge/mcp-bridge.service /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable mcp-bridge
sudo systemctl start mcp-bridge

# Check status
sudo systemctl status mcp-bridge
```

**Option B: Background Process (Simple)**

```bash
ssh root@77.42.68.61
cd ~/mcp-oauth-bridge
nohup node dist/cli.js start --host 127.0.0.1 --port 3000 > bridge.log 2>&1 &
```

### 4. Configure OpenClaw

Get your bridge password:

```bash
cat ~/.mcp-bridge/config.json | grep password
```

Add to OpenClaw config on VPS:

```json
{
  "mcpServers": {
    "granola": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Authorization: Bearer YOUR_BRIDGE_PASSWORD",
        "-H", "Content-Type: application/json",
        "http://127.0.0.1:3000/mcp/granola/call",
        "-d", "@-"
      ]
    }
  }
}
```

## Testing

```bash
# On VPS
curl http://127.0.0.1:3000/health

curl -H "Authorization: Bearer YOUR_PASSWORD" \
  http://127.0.0.1:3000/mcp/granola/tools
```

## Token Auto-Refresh

✅ **Automatic** - The bridge auto-refreshes tokens every 6 hours when used

Optional: Add a cron job to keep tokens fresh during inactivity:

```bash
# On VPS
crontab -e

# Add:
0 */5 * * * curl -s -H "Authorization: Bearer YOUR_PASSWORD" http://127.0.0.1:3000/mcp/granola/tools > /dev/null 2>&1
```

## That's It!

- ✅ OpenClaw can now use Granola MCP
- ✅ Tokens refresh automatically
- ✅ Works 24/7 on VPS
- ✅ Your laptop can be offline

## Adding More MCP Servers

```bash
# On Mac
npm run dev -- add clarify https://mcp.clarify.ai \
  --client-id YOUR_CLIENT_ID

npm run dev -- auth clarify \
  --auth-endpoint https://auth.clarify.ai/authorize \
  --token-endpoint https://auth.clarify.ai/token

# Deploy updated tokens
scp ~/.mcp-bridge/tokens/clarify.json root@77.42.68.61:~/.mcp-bridge/tokens/

# Restart bridge
ssh root@77.42.68.61 'sudo systemctl restart mcp-bridge'
```

## Troubleshooting

See [DEPLOY.md](DEPLOY.md) for detailed troubleshooting.

Quick fixes:

```bash
# Bridge not responding
ssh root@77.42.68.61 'sudo systemctl restart mcp-bridge'

# Check logs
ssh root@77.42.68.61 'sudo journalctl -u mcp-bridge -f'

# Token expired (re-auth on Mac)
npm run dev -- auth granola --auth-endpoint ... --token-endpoint ...
scp ~/.mcp-bridge/tokens/granola.json root@77.42.68.61:~/.mcp-bridge/tokens/
```

## Support

- Issues: https://github.com/YOUR_USERNAME/mcp-oauth-bridge/issues
- Full docs: [README.md](README.md)
- Deployment guide: [DEPLOY.md](DEPLOY.md)
