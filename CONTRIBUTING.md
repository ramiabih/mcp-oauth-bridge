# Contributing

## Dev Setup

```bash
git clone https://github.com/ramiabih/mcp-oauth-bridge
cd mcp-oauth-bridge
npm install
npm run build   # compile TypeScript
npm test        # run unit tests
```

## Project Structure

```
src/
├── types.ts        # Core interfaces (OAuthToken, MCPServer, BridgeConfig, …)
├── config.ts       # ConfigManager — reads/writes ~/.mcp-bridge/config.json
├── tokens.ts       # TokenManager — save/load/refresh OAuth tokens
├── oauth.ts        # PKCE Authorization Code flow, callback server
├── mcp-client.ts   # JSON-RPC 2.0 HTTP client for upstream MCP servers
├── server.ts       # Express bridge API with auth middleware
├── cli.ts          # Commander CLI (init, add, remove, list, auth, start)
└── index.ts        # Entry point

tests/
├── config.test.ts
└── tokens.test.ts
```

## Making Changes

- TypeScript strict mode — no `any`
- Add tests for new stateful logic
- Keep error messages actionable (tell the user what command to run next)

## Pull Requests

Fork → branch → change → `npm test` passes → PR.
