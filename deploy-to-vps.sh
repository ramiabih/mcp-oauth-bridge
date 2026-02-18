#!/bin/bash
set -e

VPS_IP="${1:-77.42.68.61}"
VPS_USER="${2:-root}"

echo "🚀 Deploying MCP OAuth Bridge to ${VPS_USER}@${VPS_IP}"
echo ""

# 1. Build locally
echo "📦 Building bridge..."
npm run build

# 2. Copy code to VPS
echo "📤 Copying code to VPS..."
ssh ${VPS_USER}@${VPS_IP} "mkdir -p ~/mcp-oauth-bridge"
scp -r dist ${VPS_USER}@${VPS_IP}:~/mcp-oauth-bridge/
scp package.json package-lock.json ${VPS_USER}@${VPS_IP}:~/mcp-oauth-bridge/

# 3. Copy tokens and config
echo "🔑 Copying tokens and config..."
scp -r ~/.mcp-bridge ${VPS_USER}@${VPS_IP}:~/

# 4. Install dependencies on VPS
echo "📥 Installing dependencies on VPS..."
ssh ${VPS_USER}@${VPS_IP} "cd ~/mcp-oauth-bridge && npm install --production"

# 5. Test the bridge
echo "✅ Testing bridge on VPS..."
ssh ${VPS_USER}@${VPS_IP} "cd ~/mcp-oauth-bridge && node dist/cli.js list"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "To start the bridge on VPS:"
echo "  ssh ${VPS_USER}@${VPS_IP}"
echo "  cd ~/mcp-oauth-bridge"
echo "  node dist/cli.js start --host 127.0.0.1 --port 3000"
echo ""
echo "Or run in background with nohup:"
echo "  nohup node dist/cli.js start --host 127.0.0.1 --port 3000 > bridge.log 2>&1 &"
echo ""
echo "Bridge password: $(cat ~/.mcp-bridge/config.json | grep -o '\"password\":\"[^\"]*\"' | cut -d'\"' -f4)"
