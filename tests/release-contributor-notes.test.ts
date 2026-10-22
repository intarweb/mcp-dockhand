/**
 * scripts/release/contributor-notes.mjs — local semantic-release plugin that appends a
 * "Contributors" section to the release notes. semantic-release concatenates the output of
 * every generateNotes plugin (node_modules/semantic-release/lib/definitions/plugins.js), so
 * the section lands in CHANGELOG.md (@semantic-release/changelog) and in the GitHub release.
 */
import { describe, it, expect } from 'vitest';
import { generateNotes, collectContributors } from '../scripts/release/contributor-notes.mjs';

type Commit = { message: string; author?: { name?: string; email?: string } };

const commit = (message: string, email = 'owner@example.com'): Commit => ({ message, author: { name: 'x', email } });

describe('collectContributors', () => {
  it('derives the login from a GitHub noreply author address (with and without numeric id)', () => {
    expect(collectContributors([
      commit('feat(tools): a', 'terafin@users.noreply.github.com'),
      commit('fix(tools): b', '12345+cbrostrom@users.noreply.github.com'),
    ])).toEqual(['cbrostrom', 'terafin']);
  });

  it('reads Co-authored-by trailers with noreply addresses, case-insensitively', () => {
    expect(collectContributors([
      commit('fix(tools): c\n\nCo-Authored-By: terafin <terafin@users.noreply.github.com>'),
    ])).toEqual(['terafin']);
  });

  it('reads explicit Thanks: trailers, several handles per line', () => {
    expect(collectContributors([
      commit('fix(auth): d\n\nThanks: @terafin, @cbrostrom'),
    ])).toEqual(['cbrostrom', 'terafin']);
  });

  it('ignores plain e-mail addresses and @-words that are not a Thanks trailer', () => {
    expect(collectContributors([
      commit('chore(deps): bump @vitest/coverage-v8\n\nCo-Authored-By: Justin Wood <jwood@me.com>\nCo-Authored-By: Claude <noreply@anthropic.com>', 'jwood@me.com'),
    ])).toEqual([]);
  });

  it('skips bots and excluded logins (case-insensitive), and de-duplicates', () => {
    expect(collectContributors([
      commit('chore(deps): x', '49699333+dependabot[bot]@users.noreply.github.com'),
      commit('chore(deps): y', '29139614+renovate[bot]@users.noreply.github.com'),
      commit('feat(tools): z', 'strausmann@users.noreply.github.com'),
      commit('feat(tools): z2\n\nThanks: @Terafin @StrausMann', 'terafin@users.noreply.github.com'),
    ], ['strausmann'])).toEqual(['terafin']);
  });
});

describe('collectContributors — Thanks: trailer only accepts complete handles (review #314)', () => {
  it('rejects bot handles instead of truncating them to a different account', () => {
    expect(collectContributors([commit('chore: x\n\nThanks: @dependabot[bot], @renovate[bot]')])).toEqual([]);
  });

  it('ignores @-substrings inside other tokens, e.g. an e-mail address', () => {
    expect(collectContributors([commit('fix: y\n\nThanks: contributor <foo@bar.com>')])).toEqual([]);
  });

  it('accepts trailing punctuation and mixed separators', () => {
    expect(collectContributors([commit('fix: z\n\nThanks: @terafin, @cbrostrom; @someone.')])).toEqual(['cbrostrom', 'someone', 'terafin']);
  });

  it('rejects handles GitHub would not allow (leading hyphen, too long)', () => {
    expect(collectContributors([commit('fix: w\n\nThanks: @-bad @' + 'a'.repeat(40))])).toEqual([]);
  });
});

describe('generateNotes', () => {
  it('returns a Contributors section naming every contributor', async () => {
    const notes = await generateNotes({ exclude: ['strausmann'] }, {
      commits: [commit('feat(tools): a', 'terafin@users.noreply.github.com'), commit('fix(auth): b\n\nThanks: @cbrostrom')],
    });
    expect(notes).toBe('### Contributors\n\nThanks to @cbrostrom and @terafin for contributing to this release.');
  });

  it('lists three or more with commas', async () => {
    const notes = await generateNotes({}, { commits: [commit('x\n\nThanks: @a @b @c')] });
    expect(notes).toContain('Thanks to @a, @b and @c for contributing');
  });

  it('returns an empty string when there is nobody to thank (semantic-release then drops it)', async () => {
    await expect(generateNotes({ exclude: ['strausmann'] }, { commits: [commit('chore(deps): x', 'strausmann@users.noreply.github.com')] })).resolves.toBe('');
  });
});
