/**
 * Validation for DOCKHAND_API_TOKEN, read at startup and by the meta probes.
 *
 * Ground truth: Finsys/dockhand v1.0.54. A token is "dh_" + 32 bytes base64url
 * (src/lib/server/api-tokens.ts:38), and the hook only checks an Authorization header
 * that starts with "Bearer dh_" and is at most 207 characters long
 * (src/hooks.server.ts:327). Anything else is never looked at, so every request
 * fails with 401.
 *
 * The value is trimmed (a trailing newline from a secret file is harmless) but an
 * embedded whitespace or control character is rejected: fetch() refuses such a header
 * with an error that quotes the full header value, which would carry the token into
 * the log, the MCP error response and get_runtime_stats.
 */

/** "Bearer " (7) + token must fit Dockhand's 207-character header limit. */
export const MAX_API_TOKEN_LENGTH = 200;

const TOKEN_PATTERN = /^dh_[A-Za-z0-9_-]+$/;

export interface ParsedApiToken {
  /** The trimmed token, or undefined when unset, blank or invalid. */
  token: string | undefined;
  /** Why the value was rejected. Never contains the value itself. */
  error?: string;
}

export function parseApiToken(raw: string | undefined): ParsedApiToken {
  const value = raw?.trim();
  if (!value) return { token: undefined };
  if (!value.startsWith('dh_')) {
    return { token: undefined, error: 'DOCKHAND_API_TOKEN must start with "dh_" (create it on the Dockhand profile page under API tokens)' };
  }
  if (value.length > MAX_API_TOKEN_LENGTH) {
    return { token: undefined, error: `DOCKHAND_API_TOKEN is longer than ${MAX_API_TOKEN_LENGTH} characters` };
  }
  if (!TOKEN_PATTERN.test(value)) {
    return { token: undefined, error: 'DOCKHAND_API_TOKEN contains whitespace or characters outside base64url (check for a line break from copy/paste)' };
  }
  return { token: value };
}
