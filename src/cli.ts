#!/usr/bin/env node
/**
 * MCP OAuth Bridge CLI
 *
 * Commands:
 *   init              Initialize configuration
 *   add <name> <url>  Add an MCP server
 *   remove <name>     Remove an MCP server
 *   list              List configured servers with auth status
 *   auth <name>       Authenticate via OAuth
 *   start             Start the HTTP bridge server
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from './config';
import { TokenManager } from './tokens';
import { runOAuthFlow } from './oauth';
import { startServer } from './server';

const program = new Command();

program
  .name('mcp-oauth-bridge')
  .description('Bridge OAuth-based MCP servers to headless environments')
  .version('0.1.0');

// --- init ---

program
  .command('init')
  .description('Initialize configuration in ~/.mcp-bridge')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      await configManager.init();
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// --- add ---

program
  .command('add <name> <url>')
  .description('Add an MCP server')
  .requiredOption('--auth-url <url>', 'OAuth authorization endpoint')
  .requiredOption('--token-url <url>', 'OAuth token endpoint')
  .requiredOption('--client-id <id>', 'OAuth client ID')
  .option('--client-secret <secret>', 'OAuth client secret (omit for public/PKCE clients)')
  .option('--scopes <scopes>', 'Space-separated OAuth scopes (e.g. "read write")', 'openid')
  .action(async (name: string, url: string, options) => {
    try {
      const configManager = new ConfigManager();
      await configManager.addServer(name, url, {
        authorizationUrl: options.authUrl,
        tokenUrl: options.tokenUrl,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        scopes: (options.scopes as string).split(' ').filter(Boolean),
      });
      console.log(chalk.dim(`\nNext step: mcp-oauth-bridge auth ${name}`));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// --- remove ---

program
  .command('remove <name>')
  .description('Remove an MCP server and delete its stored token')
  .action(async (name: string) => {
    try {
      const configManager = new ConfigManager();
      await configManager.removeServer(name);
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// --- list ---

program
  .command('list')
  .description('List configured servers with authentication status')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const tokenManager = new TokenManager(configManager);
      const servers = await configManager.listServers();

      if (servers.length === 0) {
        console.log(chalk.yellow('No servers configured. Run: mcp-oauth-bridge add <name> <url> ...'));
        return;
      }

      console.log(chalk.bold('\nConfigured servers:\n'));

      for (const server of servers) {
        const token = await tokenManager.loadToken(server.name);
        let status: string;

        if (!token) {
          status = chalk.red(`[no token — run: mcp-oauth-bridge auth ${server.name}]`);
        } else if (tokenManager.isExpired(token)) {
          status = chalk.yellow(`[token expired — run: mcp-oauth-bridge auth ${server.name}]`);
        } else {
          status = chalk.green('[authenticated]');
        }

        const paddedName = server.name.padEnd(12);
        const paddedUrl = server.url.padEnd(40);
        console.log(`  ${chalk.bold(paddedName)} ${chalk.dim(paddedUrl)} ${status}`);
      }

      console.log('');
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// --- auth ---

program
  .command('auth <name>')
  .description('Authenticate with an MCP server via OAuth (run this on your local machine)')
  .option('--callback-port <port>', 'Port for the local OAuth callback server', '8080')
  .option('--manual', 'Manual flow: paste the redirect URL instead of opening a browser')
  .action(async (name: string, options) => {
    try {
      const configManager = new ConfigManager();
      const tokenManager = new TokenManager(configManager);
      const server = await configManager.getServer(name);

      await runOAuthFlow(name, server, tokenManager, {
        callbackPort: parseInt(options.callbackPort, 10),
        manual: Boolean(options.manual),
      });

      console.log(chalk.dim('\nTo deploy to a VPS, copy your tokens:'));
      console.log(chalk.dim(`  scp -r ~/.mcp-bridge/tokens/ user@your-vps:~/.mcp-bridge/`));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// --- start ---

program
  .command('start')
  .description('Start the bridge HTTP server')
  .option('--port <port>', 'HTTP server port (overrides config)')
  .option('--host <host>', 'Bind address (overrides config)')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      await startServer(configManager, {
        port: options.port ? parseInt(options.port, 10) : undefined,
        host: options.host,
      });
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse(process.argv);
