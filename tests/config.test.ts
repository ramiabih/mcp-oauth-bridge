import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { ConfigManager } from '../src/config';

// --- Setup ---

let tmpDir: string;
let configManager: ConfigManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-config-test-'));
  configManager = new ConfigManager(tmpDir);
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

// --- init ---

describe('init', () => {
  it('creates config.json in the config directory', async () => {
    await configManager.init();
    const configPath = path.join(tmpDir, 'config.json');
    expect(await fs.pathExists(configPath)).toBe(true);
  });

  it('creates the tokens directory', async () => {
    await configManager.init();
    const tokensDir = path.join(tmpDir, 'tokens');
    expect(await fs.pathExists(tokensDir)).toBe(true);
  });

  it('generates a non-empty password', async () => {
    await configManager.init();
    const config = await configManager.load();
    expect(config.auth.password).toBeTruthy();
    expect(config.auth.password!.length).toBeGreaterThan(8);
  });

  it('does not overwrite an existing config', async () => {
    await configManager.init();
    const config1 = await configManager.load();
    const password1 = config1.auth.password;

    // Reset cache and reinit — should not overwrite
    const configManager2 = new ConfigManager(tmpDir);
    await configManager2.init();
    const config2 = await configManager2.load();

    expect(config2.auth.password).toBe(password1);
  });
});

// --- addServer ---

describe('addServer', () => {
  beforeEach(() => configManager.init());

  it('adds a server to config with correct fields', async () => {
    await configManager.addServer('myserver', 'https://example.com/mcp', {
      authorizationUrl: 'https://example.com/oauth/authorize',
      tokenUrl: 'https://example.com/oauth/token',
      clientId: 'client-123',
    });

    const server = await configManager.getServer('myserver');
    expect(server.name).toBe('myserver');
    expect(server.url).toBe('https://example.com/mcp');
    expect(server.oauth?.authorizationUrl).toBe('https://example.com/oauth/authorize');
    expect(server.oauth?.tokenUrl).toBe('https://example.com/oauth/token');
    expect(server.oauth?.clientId).toBe('client-123');
  });

  it('derives tokenPath automatically from the server name', async () => {
    await configManager.addServer('myserver', 'https://example.com/mcp');

    const server = await configManager.getServer('myserver');
    const expectedPath = path.join(tmpDir, 'tokens', 'myserver.json');
    expect(server.oauth?.tokenPath).toBe(expectedPath);
  });

  it('stores optional clientSecret and scopes', async () => {
    await configManager.addServer('myserver', 'https://example.com/mcp', {
      clientId: 'id',
      clientSecret: 'secret',
      scopes: ['read', 'write'],
    });

    const server = await configManager.getServer('myserver');
    expect(server.oauth?.clientSecret).toBe('secret');
    expect(server.oauth?.scopes).toEqual(['read', 'write']);
  });

  it('throws when adding a server with a duplicate name', async () => {
    await configManager.addServer('myserver', 'https://example.com/mcp');
    await expect(
      configManager.addServer('myserver', 'https://other.com/mcp')
    ).rejects.toThrow(/already exists/);
  });
});

// --- removeServer ---

describe('removeServer', () => {
  beforeEach(async () => {
    await configManager.init();
    await configManager.addServer('myserver', 'https://example.com/mcp');
  });

  it('removes the server from config', async () => {
    await configManager.removeServer('myserver');
    await expect(configManager.getServer('myserver')).rejects.toThrow(/not found/);
  });

  it('deletes the token file if it exists', async () => {
    const tokenPath = configManager.getTokenPath('myserver');
    await fs.writeJSON(tokenPath, { access_token: 'test' });

    await configManager.removeServer('myserver');
    expect(await fs.pathExists(tokenPath)).toBe(false);
  });

  it('does not throw when token file does not exist', async () => {
    await expect(configManager.removeServer('myserver')).resolves.not.toThrow();
  });

  it('throws when removing a server that does not exist', async () => {
    await expect(configManager.removeServer('nonexistent')).rejects.toThrow(/not found/);
  });
});

// --- listServers ---

describe('listServers', () => {
  beforeEach(() => configManager.init());

  it('returns empty array when no servers are configured', async () => {
    const servers = await configManager.listServers();
    expect(servers).toEqual([]);
  });

  it('returns all configured servers', async () => {
    await configManager.addServer('server-a', 'https://a.example.com/mcp');
    await configManager.addServer('server-b', 'https://b.example.com/mcp');

    const servers = await configManager.listServers();
    const names = servers.map((s) => s.name);
    expect(names).toContain('server-a');
    expect(names).toContain('server-b');
  });
});

// --- getServer ---

describe('getServer', () => {
  beforeEach(async () => {
    await configManager.init();
    await configManager.addServer('myserver', 'https://example.com/mcp');
  });

  it('returns the server when it exists', async () => {
    const server = await configManager.getServer('myserver');
    expect(server.url).toBe('https://example.com/mcp');
  });

  it('throws when the server does not exist', async () => {
    await expect(configManager.getServer('nonexistent')).rejects.toThrow(/not found/);
  });
});

// --- getTokenPath ---

describe('getTokenPath', () => {
  it('returns the correct path for a server name', () => {
    const tokenPath = configManager.getTokenPath('granola');
    expect(tokenPath).toBe(path.join(tmpDir, 'tokens', 'granola.json'));
  });
});
