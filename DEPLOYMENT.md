# Deployment Guide - MCP OAuth Bridge to VPS

This guide shows how to deploy the MCP OAuth Bridge to a headless VPS for use with OpenClaw.

## Prerequisites

- ✅ OAuth authentication completed on Mac (`mcp-oauth-bridge auth granola`)
- ✅ Tokens saved to `~/.mcp-bridge/tokens/`
- ✅ Project built (`npm run build`)
- ✅ SSH access to VPS

## Quick Deploy

```bash
# 1. Build project
cd ~/Documents/github/mcp-oauth-bridge
npm run build

# 2. Copy files to VPS
scp -r dist package.json package-lock.json root@77.42.68.61:~/mcp-oauth-bridge/
scp -r ~/.mcp-bridge root@77.42.68.61:~/

# 3. SSH to VPS and install
ssh root@77.42.68.61
cd ~/mcp-oauth-bridge
npm install --production

# 4. Test the bridge
node dist/cli.js list
node dist/cli.js tokens

# 5. Start the bridge (foreground test)
node dist/cli.js start --host 127.0.0.1 --port 3000
```

## Production Setup (systemd)

### 1. Create systemd service

SSH to VPS and create `/etc/systemd/system/mcp-bridge.service`:

```ini
[Unit]
Description=MCP OAuth Bridge
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/mcp-oauth-bridge
ExecStart=/usr/bin/node /root/mcp-oauth-bridge/dist/cli.js start --host 127.0.0.1 --port 3000
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 2. Enable and start service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable mcp-bridge

# Start service
sudo systemctl start mcp-bridge

# Check status
sudo systemctl status mcp-bridge

# View logs
sudo journalctl -u mcp-bridge -f
```

### 3. Test the bridge

```bash
# Health check
curl http://127.0.0.1:3000/health

# List servers (use password from config)
BRIDGE_PASSWORD=$(cat ~/.mcp-bridge/config.json | grep password | cut -d'"' -f4)
curl -H "Authorization: Bearer $BRIDGE_PASSWORD" http://127.0.0.1:3000/servers

# Test Granola tools
curl -H "Authorization: Bearer $BRIDGE_PASSWORD" http://127.0.0.1:3000/mcp/granola/tools
```

## Configure OpenClaw

### Option 1: HTTP MCP Server (if supported)

Edit OpenClaw config on VPS:

```json
{
  "mcpServers": {
    "granola": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp/granola",
      "headers": {
        "Authorization": "Bearer YOUR_BRIDGE_PASSWORD"
      }
    }
  }
}
```

### Option 2: Proxy via curl

```json
{
  "mcpServers": {
    "granola": {
      "command": "/usr/bin/curl",
      "args": [
        "-X", "POST",
        "-H", "Authorization: Bearer YOUR_BRIDGE_PASSWORD",
        "-H", "Content-Type: application/json",
        "-d", "@-",
        "http://127.0.0.1:3000/mcp/granola/call"
      ]
    }
  }
}
```

## Token Refresh

The bridge **automatically refreshes tokens** when they expire:

1. TokenManager checks expiration before each request (60s buffer)
2. If expired, automatically calls Granola's token refresh endpoint
3. Saves new access_token and refresh_token
4. Retries original request

**No manual intervention needed!** As long as:
- ✅ Bridge is running on VPS
- ✅ Refresh token is valid
- ✅ Bridge has network access

Your tokens will stay fresh indefinitely.

## Troubleshooting

### Bridge won't start

```bash
# Check if port 3000 is available
sudo lsof -i :3000

# Check logs
sudo journalctl -u mcp-bridge -n 50

# Test manually
cd ~/mcp-oauth-bridge
node dist/cli.js start --host 127.0.0.1 --port 3000
```

### Token expired error

```bash
# Check token status on VPS
cd ~/mcp-oauth-bridge
node dist/cli.js tokens

# If refresh token expired, re-authenticate on Mac and redeploy
# (On Mac)
mcp-oauth-bridge auth granola --auth-endpoint https://mcp-auth.granola.ai/oauth2/authorize --token-endpoint https://mcp-auth.granola.ai/oauth2/token --scope "openid email profile offline_access"

# (Then copy to VPS)
scp -r ~/.mcp-bridge/tokens root@77.42.68.61:~/.mcp-bridge/
```

### OpenClaw can't connect

```bash
# Verify bridge is running
curl http://127.0.0.1:3000/health

# Test authentication
BRIDGE_PASSWORD=$(cat ~/.mcp-bridge/config.json | grep password | cut -d'"' -f4)
echo "Password: $BRIDGE_PASSWORD"

# Test tool listing
curl -H "Authorization: Bearer $BRIDGE_PASSWORD" http://127.0.0.1:3000/mcp/granola/tools
```

## Security Notes

1. **Bind to localhost**: Bridge binds to `127.0.0.1` (not `0.0.0.0`) for security
2. **Token storage**: Tokens stored in `~/.mcp-bridge/tokens/` with 600 permissions
3. **API auth**: All endpoints (except `/health`) require Bearer token
4. **No public access**: Bridge not exposed to internet

## Updates

To update the bridge after code changes:

```bash
# On Mac
cd ~/Documents/github/mcp-oauth-bridge
npm run build
scp -r dist root@77.42.68.61:~/mcp-oauth-bridge/

# On VPS
sudo systemctl restart mcp-bridge
sudo journalctl -u mcp-bridge -f
```

## Backup

Important files to backup:

```bash
# On VPS
tar -czf mcp-bridge-backup.tar.gz \
  ~/.mcp-bridge/ \
  ~/mcp-oauth-bridge/dist/ \
  /etc/systemd/system/mcp-bridge.service

# Download to Mac
scp root@77.42.68.61:~/mcp-bridge-backup.tar.gz ~/Downloads/
```

## Monitoring

### Check service status

```bash
sudo systemctl status mcp-bridge
```

### View logs

```bash
# Real-time logs
sudo journalctl -u mcp-bridge -f

# Last 100 lines
sudo journalctl -u mcp-bridge -n 100

# Since boot
sudo journalctl -u mcp-bridge -b
```

### Test endpoints

```bash
# Health check (should return 200 OK)
curl -i http://127.0.0.1:3000/health

# List servers
curl -H "Authorization: Bearer $BRIDGE_PASSWORD" http://127.0.0.1:3000/servers

# Test Granola connection
curl -H "Authorization: Bearer $BRIDGE_PASSWORD" http://127.0.0.1:3000/mcp/granola/tools
```

---

**Need help?** Open an issue at https://github.com/YOUR_USERNAME/mcp-oauth-bridge/issues
