/**
 * Configuration manager
 */
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { BridgeConfig, MCPServer, OAuthConfig } from './types';

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.mcp-bridge');
const CONFIG_FILE = 'config.json';
const TOKENS_DIR = 'tokens';

export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private tokensDir: string;
  private config: BridgeConfig | null = null;

  constructor(configDir?: string) {
    this.configDir = configDir || DEFAULT_CONFIG_DIR;
    this.configPath = path.join(this.configDir, CONFIG_FILE);
    this.tokensDir = path.join(this.configDir, TOKENS_DIR);
  }

  async init(): Promise<void> {
    // Create directories
    await fs.ensureDir(this.configDir);
    await fs.ensureDir(this.tokensDir);

    // Create default config if doesn't exist
    if (!await fs.pathExists(this.configPath)) {
      const defaultConfig: BridgeConfig = {
        port: 3000,
        host: 'localhost',
        auth: {
          type: 'password',
          password: this.generatePassword()
        },
        servers: {},
        dataDir: this.configDir
      };
      await this.save(defaultConfig);
      console.log('✅ Config initialized at:', this.configPath);
      console.log('🔑 Generated password:', defaultConfig.auth.password);
      console.log('⚠️  Save this password - you\'ll need it to connect!');
    }
  }

  async load(): Promise<BridgeConfig> {
    if (this.config) return this.config;

    if (!await fs.pathExists(this.configPath)) {
      throw new Error('Config not found. Run: mcp-oauth-bridge init');
    }

    this.config = await fs.readJSON(this.configPath);
    return this.config!;
  }

  async save(config: BridgeConfig): Promise<void> {
    await fs.writeJSON(this.configPath, config, { spaces: 2 });
    this.config = config;
  }

  async addServer(
    name: string,
    url: string,
    oauthOptions?: {
      authorizationUrl?: string;
      tokenUrl?: string;
      clientId?: string;
      clientSecret?: string;
      scopes?: string[];
    }
  ): Promise<void> {
    const config = await this.load();

    if (config.servers[name]) {
      throw new Error(`Server '${name}' already exists`);
    }

    const oauth: OAuthConfig = {
      tokenPath: this.getTokenPath(name),
      ...oauthOptions
    };

    config.servers[name] = { name, url, oauth };

    await this.save(config);
    console.log(`✅ Added server: ${name}`);
  }

  async removeServer(name: string): Promise<void> {
    const config = await this.load();

    if (!config.servers[name]) {
      throw new Error(`Server '${name}' not found`);
    }

    delete config.servers[name];

    // Remove token file
    const tokenPath = this.getTokenPath(name);
    if (await fs.pathExists(tokenPath)) {
      await fs.remove(tokenPath);
    }

    await this.save(config);
    console.log(`✅ Removed server: ${name}`);
  }

  async listServers(): Promise<MCPServer[]> {
    const config = await this.load();
    return Object.values(config.servers);
  }

  async getServer(name: string): Promise<MCPServer> {
    const config = await this.load();
    const server = config.servers[name];

    if (!server) {
      throw new Error(`Server '${name}' not found`);
    }

    return server;
  }

  getTokensDir(): string {
    return this.tokensDir;
  }

  getTokenPath(serverName: string): string {
    return path.join(this.tokensDir, `${serverName}.json`);
  }

  private generatePassword(): string {
    return Math.random().toString(36).slice(2) +
           Math.random().toString(36).slice(2);
  }
}
