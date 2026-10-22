/**
 * Local semantic-release plugin: appends a "Contributors" section to the release notes.
 *
 * The conventionalcommits writer renders type, scope, subject, hash and issue links per
 * commit, never the author, so an outside contributor's work showed up in CHANGELOG.md and
 * the GitHub release without their name. semantic-release concatenates the output of every
 * generateNotes plugin (lib/definitions/plugins.js), so listing this plugin after
 * @semantic-release/release-notes-generator adds the section to both.
 *
 * Contributors come from the commits of the release:
 *   - the author address, when it is a GitHub noreply address
 *     (`login@users.noreply.github.com` or `12345+login@users.noreply.github.com`)
 *   - `Co-authored-by:` trailers carrying such an address
 *   - explicit `Thanks: @login [@login ...]` trailers, for contributors whose commits
 *     use a private address that cannot be mapped to a GitHub login
 *
 * Bots (`name[bot]`) and the logins in `exclude` (the maintainer) are skipped.
 *
 * Configuration in .releaserc.json:
 *   ["./scripts/release/contributor-notes.mjs", { "exclude": ["strausmann"] }]
 */

const NOREPLY = /^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i;
const CO_AUTHOR = /^co-authored-by:[^<\n]*<([^>\n]+)>/gim;
const THANKS = /^thanks:(.*)$/gim;
const HANDLE = /@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/g;

function loginFromEmail(email) {
  const match = NOREPLY.exec(email?.trim() ?? '');
  return match ? match[1] : null;
}

/**
 * @param {Array<{ message?: string, author?: { email?: string } }>} commits
 * @param {string[]} [exclude]
 * @returns {string[]} logins, sorted case-insensitively, without duplicates
 */
export function collectContributors(commits, exclude = []) {
  const skip = new Set(exclude.map((login) => login.toLowerCase()));
  const found = new Map();
  const add = (login) => {
    if (!login) return;
    const key = login.toLowerCase();
    if (skip.has(key) || found.has(key)) return;
    found.set(key, login);
  };

  for (const commit of commits ?? []) {
    add(loginFromEmail(commit.author?.email));
    const message = commit.message ?? '';
    for (const [, email] of message.matchAll(CO_AUTHOR)) add(loginFromEmail(email));
    for (const [, rest] of message.matchAll(THANKS)) {
      for (const [, handle] of rest.matchAll(HANDLE)) add(handle);
    }
  }

  return [...found.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function joinHandles(logins) {
  const handles = logins.map((login) => `@${login}`);
  return handles.length <= 1 ? handles.join('') : `${handles.slice(0, -1).join(', ')} and ${handles.at(-1)}`;
}

/** semantic-release generateNotes step. Returns '' when there is nobody to thank. */
export async function generateNotes(pluginConfig, context) {
  const logins = collectContributors(context.commits, pluginConfig?.exclude ?? []);
  if (logins.length === 0) return '';
  return `### Contributors\n\nThanks to ${joinHandles(logins)} for contributing to this release.`;
}
