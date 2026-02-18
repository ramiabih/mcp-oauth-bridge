# Deployment Guide

## Quick Deploy to VPS

```bash
cd ~/Documents/github/mcp-oauth-bridge
./deploy-to-vps.sh 77.42.68.61 root
```

## Manual Deployment

### 1. Build and Copy Files

```bash
# Build locally
cd ~/Documents/github/mcp-oauth-bridge
npm run build

# Copy to VPS
scp -r dist package.json package-lock.json root@77.42.68.61:~/mcp-oauth-bridge/
scp -r ~/.mcp-bridge root@77.42.68.61:~/
```

### 2. Install on VPS

```bash
ssh root@77.42.68.61
cd ~/mcp-oauth-bridge
npm install --production
```

### 3. Test the Bridge

```bash
# Test CLI
node dist/cli.js list
node dist/cli.js tokens

# Start manually
node dist/cli.js start --host 127.0.0.1 --port 3000
```

## Run as Systemd Service (Recommended)

### 1. Copy Service File

```bash
# On your Mac
scp mcp-bridge.service root@77.42.68.61:/etc/systemd/system/

# On VPS
ssh root@77.42.68.61
sudo systemctl daemon-reload
sudo systemctl enable mcp-bridge
sudo systemctl start mcp-bridge
```

### 2. Check Service Status

```bash
sudo systemctl status mcp-bridge
sudo journalctl -u mcp-bridge -f  # View logs
```

### 3. Service Commands

```bash
sudo systemctl start mcp-bridge    # Start service
sudo systemctl stop mcp-bridge     # Stop service
sudo systemctl restart mcp-bridge  # Restart service
sudo systemctl status mcp-bridge   # Check status
```

## Alternative: Run with nohup (Simple)

```bash
ssh root@77.42.68.61
cd ~/mcp-oauth-bridge
nohup node dist/cli.js start --host 127.0.0.1 --port 3000 > bridge.log 2>&1 &

# Check if running
ps aux | grep "node dist/cli.js"

# View logs
tail -f ~/mcp-oauth-bridge/bridge.log

# Stop
pkill -f "node dist/cli.js"
```

## Configure OpenClaw on VPS

Once the bridge is running on your VPS, configure OpenClaw:

### Option 1: OpenClaw with HTTP MCP Support

Edit OpenClaw's config:

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

### Option 2: OpenClaw with curl Wrapper

If OpenClaw doesn't support HTTP MCP directly:

```json
{
  "mcpServers": {
    "granola": {
      "command": "bash",
      "args": [
        "-c",
        "curl -X POST -H 'Authorization: Bearer YOUR_BRIDGE_PASSWORD' -H 'Content-Type: application/json' http://127.0.0.1:3000/mcp/granola/call -d @-"
      ]
    }
  }
}
```

Replace `YOUR_BRIDGE_PASSWORD` with the password from `~/.mcp-bridge/config.json`.

## Keep Tokens Fresh (Optional)

Add a cron job to ping the bridge every 5 hours to keep tokens fresh:

```bash
# On VPS
crontab -e

# Add this line:
0 */5 * * * curl -s -H "Authorization: Bearer YOUR_BRIDGE_PASSWORD" http://127.0.0.1:3000/mcp/granola/tools > /dev/null 2>&1
```

## Testing the Bridge

```bash
# Health check (no auth required)
curl http://127.0.0.1:3000/health

# List servers (auth required)
curl -H "Authorization: Bearer YOUR_BRIDGE_PASSWORD" \
  http://127.0.0.1:3000/servers

# List Granola tools
curl -H "Authorization: Bearer YOUR_BRIDGE_PASSWORD" \
  http://127.0.0.1:3000/mcp/granola/tools

# Call a tool
curl -X POST \
  -H "Authorization: Bearer YOUR_BRIDGE_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"tool":"search_meetings","arguments":{"query":"roadmap"}}' \
  http://127.0.0.1:3000/mcp/granola/call
```

## Troubleshooting

### Bridge won't start

```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill existing process
pkill -f "node dist/cli.js"

# Try different port
node dist/cli.js start --port 3001
```

### Token expired

```bash
# Re-authenticate on Mac
cd ~/Documents/github/mcp-oauth-bridge
npm run dev -- auth granola \
  --auth-endpoint https://mcp-auth.granola.ai/oauth2/authorize \
  --token-endpoint https://mcp-auth.granola.ai/oauth2/token \
  --scope "openid email profile offline_access"

# Copy updated token to VPS
scp ~/.mcp-bridge/tokens/granola.json root@77.42.68.61:~/.mcp-bridge/tokens/

# Restart bridge on VPS
ssh root@77.42.68.61
sudo systemctl restart mcp-bridge
```

### Check logs

```bash
# If using systemd
sudo journalctl -u mcp-bridge -f

# If using nohup
tail -f ~/mcp-oauth-bridge/bridge.log
```

## Security Notes

1. **Firewall**: Bridge binds to `127.0.0.1` (localhost only) - not exposed to internet
2. **Tokens**: Stored with 600 permissions (owner read/write only)
3. **Password**: Keep your bridge password secure - it's in `~/.mcp-bridge/config.json`
4. **Updates**: Regularly update dependencies: `npm audit fix`

## Updating the Bridge

```bash
# On Mac: Pull latest changes
cd ~/Documents/github/mcp-oauth-bridge
git pull
npm install
npm run build

# Deploy to VPS
./deploy-to-vps.sh 77.42.68.61 root

# Restart service on VPS
ssh root@77.42.68.61 'sudo systemctl restart mcp-bridge'
```
