#!/usr/bin/env node

/**
 * Command-line interface for MCP OAuth Bridge
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from './config';
import { TokenManager } from './tokens';
import { OAuthHandler } from './oauth';
import { MCPClient } from './mcp-client';
import { BridgeServer } from './server';

const program = new Command();

program
  .name('mcp-oauth-bridge')
  .description('Bridge OAuth-based MCP servers to headless environments')
  .version('0.1.0');

/**
 * Initialize config directory
 */
program
  .command('init')
  .description('Initialize config directory')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      await configManager.init();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Add MCP server
 */
program
  .command('add <name> <url>')
  .description('Add MCP server')
  .option('--client-id <id>', 'OAuth client ID')
  .option('--client-secret <secret>', 'OAuth client secret')
  .option('--auth-endpoint <url>', 'OAuth authorization endpoint')
  .option('--token-endpoint <url>', 'OAuth token endpoint')
  .option('--scope <scope>', 'OAuth scope')
  .action(async (name: string, url: string, options: any) => {
    try {
      const configManager = new ConfigManager();
      await configManager.addServer(name, url);

      // Add OAuth config if provided
      if (options.clientId || options.authEndpoint || options.tokenEndpoint) {
        const config = await configManager.load();
        const server = config.servers[name];

        if (!server.oauth) {
          server.oauth = {};
        }

        if (options.clientId) server.oauth.clientId = options.clientId;
        if (options.clientSecret) server.oauth.clientSecret = options.clientSecret;

        await configManager.save(config);
        console.log(chalk.green('✅ OAuth config added'));
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Remove MCP server
 */
program
  .command('remove <name>')
  .description('Remove MCP server')
  .action(async (name: string) => {
    try {
      const configManager = new ConfigManager();
      await configManager.removeServer(name);
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * List configured servers
 */
program
  .command('list')
  .description('List configured servers')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const servers = await configManager.listServers();

      if (servers.length === 0) {
        console.log(chalk.yellow('No servers configured'));
        console.log('\nAdd a server with:');
        console.log('  mcp-oauth-bridge add <name> <url>');
        return;
      }

      console.log(chalk.bold('\n📋 Configured MCP Servers:\n'));
      for (const server of servers) {
        console.log(chalk.cyan(`  ${server.name}`));
        console.log(`    URL: ${server.url}`);
        if (server.oauth?.clientId) {
          console.log(`    OAuth: Configured (client_id: ${server.oauth.clientId})`);
        }
        console.log('');
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Authenticate with OAuth
 */
program
  .command('auth <name>')
  .description('Authenticate with OAuth')
  .option('--client-id <id>', 'OAuth client ID (if not in config)')
  .option('--client-secret <secret>', 'OAuth client secret (if not in config)')
  .option('--auth-endpoint <url>', 'OAuth authorization endpoint')
  .option('--token-endpoint <url>', 'OAuth token endpoint')
  .option('--scope <scope>', 'OAuth scope')
  .action(async (name: string, options: any) => {
    try {
      const configManager = new ConfigManager();
      const tokenManager = new TokenManager(configManager.getTokensDir());

      const server = await configManager.getServer(name);

      // Get OAuth config from options or server config
      const clientId = options.clientId || server.oauth?.clientId;
      const clientSecret = options.clientSecret || server.oauth?.clientSecret;
      const authEndpoint = options.authEndpoint;
      const tokenEndpoint = options.tokenEndpoint;
      const scope = options.scope;

      if (!clientId) {
        throw new Error(
          'Missing client ID. Provide --client-id or add to config with: ' +
          `mcp-oauth-bridge add ${name} ${server.url} --client-id <id>`
        );
      }

      if (!authEndpoint || !tokenEndpoint) {
        throw new Error(
          'Missing OAuth endpoints. Provide --auth-endpoint and --token-endpoint'
        );
      }

      const oauthHandler = new OAuthHandler();
      const token = await oauthHandler.authenticate(name, {
        clientId,
        clientSecret,
        authorizationEndpoint: authEndpoint,
        tokenEndpoint,
        scope,
      });

      await tokenManager.saveToken(name, token);
      console.log(chalk.green('\n✅ Authentication successful!'));
      console.log(`Token saved and will expire in ${token.expires_in ? Math.floor(token.expires_in / 60) : '?'} minutes`);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Authentication failed:'), error.message);
      process.exit(1);
    }
  });

/**
 * List tokens
 */
program
  .command('tokens')
  .description('List saved tokens')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const tokenManager = new TokenManager(configManager.getTokensDir());

      const tokens = await tokenManager.listTokens();

      if (tokens.length === 0) {
        console.log(chalk.yellow('No tokens saved'));
        console.log('\nAuthenticate with:');
        console.log('  mcp-oauth-bridge auth <server-name>');
        return;
      }

      console.log(chalk.bold('\n🔑 Saved Tokens:\n'));
      for (const serverName of tokens) {
        const token = await tokenManager.loadToken(serverName);
        if (token) {
          const expired = tokenManager.isExpired(token);
          const status = expired ? chalk.red('EXPIRED') : chalk.green('VALID');
          console.log(`  ${chalk.cyan(serverName)} - ${status}`);
          if (token.expires_at) {
            const expiresAt = new Date(token.expires_at);
            console.log(`    Expires: ${expiresAt.toLocaleString()}`);
          }
          console.log('');
        }
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Start bridge server
 */
program
  .command('start')
  .description('Start bridge server')
  .option('--port <port>', 'Server port', '3000')
  .option('--host <host>', 'Server host', 'localhost')
  .action(async (options: any) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      // Override with CLI options
      config.port = parseInt(options.port, 10);
      config.host = options.host;

      const tokenManager = new TokenManager(configManager.getTokensDir());
      const mcpClient = new MCPClient(configManager, tokenManager);
      const server = new BridgeServer(config, mcpClient);

      // Handle shutdown signals
      process.on('SIGINT', async () => {
        console.log('\n\nShutting down...');
        await server.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n\nShutting down...');
        await server.stop();
        process.exit(0);
      });

      await server.start();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command specified
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
