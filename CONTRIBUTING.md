# Contributing to MCP OAuth Bridge

Thanks for your interest! This project helps the MCP/OpenClaw community.

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/mcp-oauth-bridge
cd mcp-oauth-bridge
npm install
npm run dev
```

## Project Structure

```
mcp-oauth-bridge/
├── src/
│   ├── types.ts          # Core TypeScript types
│   ├── config.ts         # Configuration manager
│   ├── oauth.ts          # OAuth handler (TODO)
│   ├── tokens.ts         # Token manager (TODO)
│   ├── server.ts         # HTTP server (TODO)
│   ├── mcp-client.ts     # MCP client proxy (TODO)
│   └── cli.ts            # CLI interface (TODO)
├── README.md
├── ARCHITECTURE.md
└── package.json
```

## TODO List

### ✅ Done:
- [x] Project structure
- [x] README with vision
- [x] Architecture documentation
- [x] TypeScript config
- [x] Core types
- [x] Config manager

### 🚧 In Progress:
- [ ] OAuth handler
- [ ] Token manager with refresh
- [ ] HTTP server/proxy
- [ ] MCP client
- [ ] CLI interface
- [ ] Tests

### 📋 Next Steps:
1. Implement OAuth flow (browser + callback server)
2. Token storage and refresh logic
3. HTTP API server
4. MCP protocol client
5. CLI commands (init, add, auth, start)
6. Integration tests with real MCP servers
7. Docker support
8. Documentation

## Testing

```bash
npm test
```

## Code Style

- Use TypeScript strict mode
- ESLint for linting
- Meaningful variable names
- Comments for complex logic

## Pull Requests

1. Fork the repo
2. Create feature branch
3. Make changes
4. Add tests
5. Submit PR

## Questions?

Open an issue or discussion on GitHub.
