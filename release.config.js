// semantic-release config — chosen over release-please because Qalam's
// commits already follow Conventional Commits (`feat:`/`fix:`/`chore:`) with
// no release PR to review: semantic-release derives semver bumps directly
// from commit types, publishes the GitHub Release + `v*` tag, maintains
// CHANGELOG.md and syncs package.json — fully automatic on every push to
// main. release-please fits better when a human release PR is wanted; here
// the board flow assumes hands-off releases.
/** @type {import('semantic-release').GlobalConfig} */
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    // Keep CHANGELOG.md in-repo; the git plugin below commits it (message
    // carries [skip ci] by default, so the release commit never re-triggers
    // CI/release workflows).
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    // npmPublish stays false — Qalam is not published to the registry; this
    // only keeps package.json's `version` in sync with the tag.
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/github',
      { successComment: false, failComment: false, failTitle: false },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): v${nextRelease.version} [skip ci]',
      },
    ],
  ],
};
