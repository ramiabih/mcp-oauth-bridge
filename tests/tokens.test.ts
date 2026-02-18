import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import { TokenManager } from '../src/tokens';
import { ConfigManager } from '../src/config';
import { OAuthToken, MCPServer } from '../src/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Attach isAxiosError so TokenManager's catch block works
mockedAxios.isAxiosError = jest.fn((err: unknown): err is import('axios').AxiosError => {
  return (err as { isAxiosError?: boolean }).isAxiosError === true;
}) as typeof axios.isAxiosError;

// --- Helpers ---

function makeToken(overrides: Partial<OAuthToken> = {}): OAuthToken {
  return {
    access_token: 'access-abc',
    refresh_token: 'refresh-xyz',
    token_type: 'Bearer',
    expires_in: 3600,
    ...overrides,
  };
}

function makeServer(overrides: Partial<MCPServer> = {}): MCPServer {
  return {
    name: 'test',
    url: 'https://example.com/mcp',
    oauth: {
      clientId: 'my-client',
      tokenUrl: 'https://example.com/oauth/token',
    },
    ...overrides,
  };
}

// --- Setup ---

let tmpDir: string;
let configManager: ConfigManager;
let tokenManager: TokenManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-bridge-test-'));
  configManager = new ConfigManager(tmpDir);
  await configManager.init();
  tokenManager = new TokenManager(configManager);
  jest.clearAllMocks();
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

// --- saveToken ---

describe('saveToken', () => {
  it('writes the token to disk', async () => {
    const token = makeToken();
    await tokenManager.saveToken('test', token);

    const saved = await fs.readJSON(configManager.getTokenPath('test'));
    expect(saved.access_token).toBe('access-abc');
  });

  it('stamps expires_at when expires_in is present and expires_at is not', async () => {
    const before = Date.now();
    const token = makeToken({ expires_in: 3600 });
    await tokenManager.saveToken('test', token);

    const saved = await fs.readJSON(configManager.getTokenPath('test')) as OAuthToken;
    expect(saved.expires_at).toBeGreaterThanOrEqual(before + 3600 * 1000 - 100);
    expect(saved.expires_at).toBeLessThanOrEqual(Date.now() + 3600 * 1000 + 100);
  });

  it('does not overwrite an existing expires_at', async () => {
    const fixedExpiry = 9999999999000;
    const token = makeToken({ expires_in: 3600, expires_at: fixedExpiry });
    await tokenManager.saveToken('test', token);

    const saved = await fs.readJSON(configManager.getTokenPath('test')) as OAuthToken;
    expect(saved.expires_at).toBe(fixedExpiry);
  });
});

// --- loadToken ---

describe('loadToken', () => {
  it('returns null when token file does not exist', async () => {
    const result = await tokenManager.loadToken('nonexistent');
    expect(result).toBeNull();
  });

  it('returns the saved token when it exists', async () => {
    const token = makeToken();
    await tokenManager.saveToken('test', token);

    const loaded = await tokenManager.loadToken('test');
    expect(loaded?.access_token).toBe('access-abc');
  });
});

// --- isExpired ---

describe('isExpired', () => {
  it('returns false when token has no expires_at (treated as non-expiring)', () => {
    const token = makeToken({ expires_at: undefined });
    expect(tokenManager.isExpired(token)).toBe(false);
  });

  it('returns true when token expires within the 5-minute buffer', () => {
    const token = makeToken({ expires_at: Date.now() + 2 * 60 * 1000 }); // expires in 2 min
    expect(tokenManager.isExpired(token)).toBe(true);
  });

  it('returns false when token has more than 5 minutes remaining', () => {
    const token = makeToken({ expires_at: Date.now() + 10 * 60 * 1000 }); // expires in 10 min
    expect(tokenManager.isExpired(token)).toBe(false);
  });

  it('returns true when token is already expired', () => {
    const token = makeToken({ expires_at: Date.now() - 1000 }); // expired 1 second ago
    expect(tokenManager.isExpired(token)).toBe(true);
  });
});

// --- refreshToken ---

describe('refreshToken', () => {
  it('throws if there is no existing token file', async () => {
    await expect(tokenManager.refreshToken('test', makeServer())).rejects.toThrow(
      /No refresh token available/
    );
  });

  it('throws if the existing token has no refresh_token', async () => {
    await tokenManager.saveToken('test', makeToken({ refresh_token: undefined }));
    await expect(tokenManager.refreshToken('test', makeServer())).rejects.toThrow(
      /No refresh token available/
    );
  });

  it('throws if server has no tokenUrl', async () => {
    await tokenManager.saveToken('test', makeToken());
    const server = makeServer({ oauth: { clientId: 'id' } });
    await expect(tokenManager.refreshToken('test', server)).rejects.toThrow(/no tokenUrl/);
  });

  it('sends correct form params to the token endpoint', async () => {
    await tokenManager.saveToken('test', makeToken());
    const newToken = makeToken({ access_token: 'new-access' });
    mockedAxios.post = jest.fn().mockResolvedValue({ data: newToken });

    await tokenManager.refreshToken('test', makeServer());

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://example.com/oauth/token',
      expect.stringContaining('grant_type=refresh_token'),
      expect.objectContaining({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    );
    const body = (mockedAxios.post as jest.Mock).mock.calls[0][1] as string;
    expect(body).toContain('refresh_token=refresh-xyz');
    expect(body).toContain('client_id=my-client');
  });

  it('includes client_secret when configured', async () => {
    await tokenManager.saveToken('test', makeToken());
    const newToken = makeToken({ access_token: 'new-access' });
    mockedAxios.post = jest.fn().mockResolvedValue({ data: newToken });

    const server = makeServer({ oauth: { clientId: 'id', tokenUrl: 'https://example.com/oauth/token', clientSecret: 'secret123' } });
    await tokenManager.refreshToken('test', server);

    const body = (mockedAxios.post as jest.Mock).mock.calls[0][1] as string;
    expect(body).toContain('client_secret=secret123');
  });

  it('preserves old refresh_token when server does not rotate it', async () => {
    await tokenManager.saveToken('test', makeToken({ refresh_token: 'old-refresh' }));
    // Server returns new access token but no refresh token
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: { access_token: 'new-access', token_type: 'Bearer' },
    });

    await tokenManager.refreshToken('test', makeServer());

    const saved = await tokenManager.loadToken('test');
    expect(saved?.refresh_token).toBe('old-refresh');
    expect(saved?.access_token).toBe('new-access');
  });

  it('saves the new refresh_token when server rotates it', async () => {
    await tokenManager.saveToken('test', makeToken({ refresh_token: 'old-refresh' }));
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: { access_token: 'new-access', refresh_token: 'rotated-refresh', token_type: 'Bearer' },
    });

    await tokenManager.refreshToken('test', makeServer());

    const saved = await tokenManager.loadToken('test');
    expect(saved?.refresh_token).toBe('rotated-refresh');
  });

  it('throws a descriptive error when the server returns an error response', async () => {
    await tokenManager.saveToken('test', makeToken());
    const axiosError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { status: 401, data: { error: 'invalid_grant' } },
    });
    mockedAxios.post = jest.fn().mockRejectedValue(axiosError);

    await expect(tokenManager.refreshToken('test', makeServer())).rejects.toThrow(/HTTP 401/);
  });
});

// --- getValidToken ---

describe('getValidToken', () => {
  it('throws when there is no token at all', async () => {
    await expect(tokenManager.getValidToken('test', makeServer())).rejects.toThrow(
      /No token for/
    );
  });

  it('returns the token directly when it is still valid', async () => {
    const token = makeToken({ expires_at: Date.now() + 60 * 60 * 1000 }); // 1 hour from now
    await tokenManager.saveToken('test', token);

    const result = await tokenManager.getValidToken('test', makeServer());
    expect(result.access_token).toBe('access-abc');
  });

  it('refreshes and returns a new token when the current one is expired', async () => {
    const expiredToken = makeToken({ expires_at: Date.now() - 1000 }); // already expired
    await tokenManager.saveToken('test', expiredToken);

    const freshToken = makeToken({ access_token: 'fresh-access', expires_at: Date.now() + 3600000 });
    mockedAxios.post = jest.fn().mockResolvedValue({ data: freshToken });

    const result = await tokenManager.getValidToken('test', makeServer());
    expect(result.access_token).toBe('fresh-access');
  });
});

// --- hasToken / deleteToken ---

describe('hasToken / deleteToken', () => {
  it('hasToken returns false when no token exists', async () => {
    expect(await tokenManager.hasToken('test')).toBe(false);
  });

  it('hasToken returns true after saving a token', async () => {
    await tokenManager.saveToken('test', makeToken());
    expect(await tokenManager.hasToken('test')).toBe(true);
  });

  it('deleteToken removes the token file', async () => {
    await tokenManager.saveToken('test', makeToken());
    await tokenManager.deleteToken('test');
    expect(await tokenManager.hasToken('test')).toBe(false);
  });

  it('deleteToken is a no-op when no file exists', async () => {
    await expect(tokenManager.deleteToken('nonexistent')).resolves.not.toThrow();
  });
});
