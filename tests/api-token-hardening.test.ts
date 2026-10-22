/**
 * Hardening of DOCKHAND_API_TOKEN mode on top of #270.
 *
 * Ground truth: Finsys/dockhand v1.0.54.
 *   src/lib/server/api-tokens.ts:38   token = "dh_" + 32 bytes base64url (43 chars)
 *   src/hooks.server.ts:327           only `Bearer dh_…` headers of <= 207 chars are checked
 *   src/hooks.server.ts:220-258       15 failed bearer checks per IP and minute put that IP
 *                                     into a 5-minute 429 cooldown
 *   src/routes/api/auth/tokens/+server.ts:66-68
 *                                     GET answers 400 "Authentication is not enabled" when
 *                                     Dockhand runs without auth (every request works then)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseApiToken, MAX_API_TOKEN_LENGTH } from '../src/auth/api-token.js';
import { SessionManager } from '../src/auth/session.js';
import { DockhandClient } from '../src/client/dockhand-client.js';
import { attemptRawLogin } from '../src/tools/meta.js';
import { TOOL_DESCRIPTION_SUFFIXES } from '../src/openapi/description-suffixes.js';
import { TOOL_ENDPOINT_MAP } from '../src/openapi/tool-endpoint-map.js';

const TOKEN = 'dh_' + 'A'.repeat(43);

function response(status: number, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    text: vi.fn().mockResolvedValue(body),
    json: vi.fn().mockResolvedValue(body ? JSON.parse(body) : {}),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    body: null,
    headers: {
      getSetCookie: () => [],
      get: (name: string) => (name.toLowerCase() === 'content-type' && body ? 'application/json' : null),
    },
  };
}

describe('parseApiToken', () => {
  it('treats unset and blank values as "no token"', () => {
    expect(parseApiToken(undefined)).toEqual({ token: undefined });
    expect(parseApiToken('')).toEqual({ token: undefined });
    expect(parseApiToken('   ')).toEqual({ token: undefined });
  });

  it('trims surrounding whitespace, e.g. a trailing newline from a secret file', () => {
    expect(parseApiToken(`  ${TOKEN}\n`)).toEqual({ token: TOKEN });
  });

  it('rejects a value without the dh_ prefix (Dockhand would never check it)', () => {
    const result = parseApiToken('abc123');
    expect(result.token).toBeUndefined();
    expect(result.error).toMatch(/dh_/);
  });

  it('rejects embedded whitespace or control characters, e.g. a wrapped paste', () => {
    for (const bad of [`dh_AAA\nBBB`, 'dh_AAA BBB', 'dh_AAA\tBBB', 'dh_AAA\u0000BBB']) {
      expect(parseApiToken(bad).error).toBeDefined();
    }
  });

  it(`rejects tokens longer than ${MAX_API_TOKEN_LENGTH} characters (Dockhand ignores the header then)`, () => {
    expect(parseApiToken('dh_' + 'A'.repeat(MAX_API_TOKEN_LENGTH)).error).toBeDefined();
    expect(parseApiToken('dh_' + 'A'.repeat(MAX_API_TOKEN_LENGTH - 3)).token).toBeDefined();
  });

  it('never echoes the value in its error message', () => {
    const secret = 'dh_SECRET\nVALUE';
    const { error } = parseApiToken(secret);
    expect(error).toBeDefined();
    expect(error).not.toContain('SECRET');
    expect(error).not.toContain('VALUE');
  });
});

describe('SessionManager.canRefresh', () => {
  it('is true in session mode and false in token mode', () => {
    expect(new SessionManager({ url: 'https://d', username: 'u', password: 'p' }).canRefresh()).toBe(true);
    expect(new SessionManager({ url: 'https://d', apiToken: TOKEN }).canRefresh()).toBe(false);
  });
});

describe('DockhandClient — no 401 retry in token mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // A retry would resend the very token that was just rejected. Every rejected
  // tool call would then count twice towards Dockhand's 15-failures-per-minute
  // limit, which locks out the whole IP (every client behind the same NAT/proxy).
  it('request(): one fetch, an error naming DOCKHAND_API_TOKEN, never the value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401, '{"error":"Authentication required"}'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new DockhandClient({ url: 'https://dockhand.example.com', apiToken: TOKEN });

    const err = await client.get('/api/containers').catch((e: Error) => e);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/401/);
    expect((err as Error).message).toMatch(/DOCKHAND_API_TOKEN/);
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('requestRaw() (getRaw): one fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401));
    vi.stubGlobal('fetch', fetchMock);
    const client = new DockhandClient({ url: 'https://dockhand.example.com', apiToken: TOKEN });

    await expect(client.getRaw('/api/images/x/export')).rejects.toThrow(/DOCKHAND_API_TOKEN/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('postSSE(): one fetch, a failed result naming DOCKHAND_API_TOKEN', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401));
    vi.stubGlobal('fetch', fetchMock);
    const client = new DockhandClient({ url: 'https://dockhand.example.com', apiToken: TOKEN });

    const result = await client.postSSE('/api/stacks/web/start', {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/DOCKHAND_API_TOKEN/);
  });

  it('putSSE(): one fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401));
    vi.stubGlobal('fetch', fetchMock);
    const client = new DockhandClient({ url: 'https://dockhand.example.com', apiToken: TOKEN });

    const result = await client.putSSE('/api/stacks/web/compose', {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });

  it('session mode still re-logs in and retries once on a 401', async () => {
    const fetchMock = vi
      .fn()
      // initial login
      .mockResolvedValueOnce({ ...response(200, '{}'), headers: { getSetCookie: () => ['dockhand_session=a; Path=/'], get: () => null } })
      // request -> 401
      .mockResolvedValueOnce(response(401))
      // re-login
      .mockResolvedValueOnce({ ...response(200, '{}'), headers: { getSetCookie: () => ['dockhand_session=b; Path=/'], get: () => null } })
      // retry -> 200
      .mockResolvedValueOnce(response(200, '{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new DockhandClient({ url: 'https://dockhand.example.com', username: 'u', password: 'p' });

    await expect(client.get('/api/health')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('attemptRawLogin — token mode against an auth-disabled Dockhand', () => {
  beforeEach(() => {
    process.env.DOCKHAND_API_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.DOCKHAND_API_TOKEN;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('treats 400 "Authentication is not enabled" as usable: every request works without credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(400, '{"error":"Authentication is not enabled"}')));
    await expect(attemptRawLogin('https://dockhand.example.com')).resolves.toEqual({ statusCode: 400, completedAuth: true });
  });

  it('still reports any other 400 as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(400, '{"error":"Bad request"}')));
    await expect(attemptRawLogin('https://dockhand.example.com')).resolves.toEqual({ statusCode: 400, completedAuth: false });
  });

  it('sends the trimmed token, not the raw env value', async () => {
    process.env.DOCKHAND_API_TOKEN = `${TOKEN}\n`;
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchMock);
    await attemptRawLogin('https://dockhand.example.com');
    expect(fetchMock.mock.calls[0][1].headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });
});

describe('session-cookie-only tools say so in their description', () => {
  // Every one of these handlers calls validateSession(cookies) or rejects
  // authMethod === 'bearer' (Finsys/dockhand v1.0.54).
  const tools = [
    'get_auth_session', 'get_profile', 'update_profile', 'get_profile_preferences',
    'update_profile_preferences', 'add_user_role', 'remove_user_role', 'clear_user_roles',
    'enable_user_mfa', 'disable_user_mfa', 'test_oidc_provider', 'create_auth_token',
    'revoke_auth_token',
  ];

  it.each(tools)('%s is a registered tool and carries the DOCKHAND_API_TOKEN note', (tool) => {
    expect(TOOL_ENDPOINT_MAP[tool]).toBeDefined();
    expect(TOOL_DESCRIPTION_SUFFIXES[tool]).toMatch(/DOCKHAND_API_TOKEN/);
  });
});

describe('navigation settings: only the per-user scope needs a session', () => {
  // PUT /api/settings/navigation defaults to scope=global and uses the bearer-aware
  // authorize(); only scope=user calls validateSession(cookies) (v1.0.54).
  it.each(['get_navigation_settings', 'update_navigation_settings'])('%s says the global scope works with a token', (tool) => {
    const suffix = TOOL_DESCRIPTION_SUFFIXES[tool];
    expect(suffix).toMatch(/DOCKHAND_API_TOKEN/);
    expect(suffix).toMatch(/global scope .*works/);
    expect(suffix).not.toMatch(/fails \(401\/403\) or answers as if no user/);
  });
});
