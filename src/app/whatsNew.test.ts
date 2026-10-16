// Unit tests for app/whatsNew — the GitHub API data layer behind the What's
// New dialog: releases mapping (markdown flattened to plain bullets), the
// commits fallback when no release exists, failure on HTTP errors, and the
// localized date formatting.
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';

import {
  fetchWhatsNew, formatWhatsNewDate, releaseItems,
} from './whatsNew';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const RELEASE = {
  name: 'v1.2.0 — RTL polish',
  tag_name: 'v1.2.0',
  published_at: '2026-10-16T12:00:00Z',
  html_url: 'https://github.com/amirkabiri/qalam/releases/v1.2.0',
  body: [
    '## What\u2019s Changed',
    '* **ui:** add the What\u2019s New dialog',
    '* [linked](https://example.com) fix',
    '* **ui:** add the What\u2019s New dialog', // duplicate — deduped
    'not a bullet',
  ].join('\n'),
};

const COMMIT = {
  sha: 'abc1234def5678',
  html_url: 'https://github.com/amirkabiri/qalam/commit/abc1234',
  commit: {
    message: 'feat(ui): something\n\nlong body',
    author: { date: '2026-10-15T08:30:00Z' },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('releaseItems', () => {
  it('flattens release-note markdown to plain-text bullets', () => {
    expect(releaseItems(RELEASE.body)).toEqual([
      'ui: add the What\u2019s New dialog',
      'linked fix',
    ]);
  });

  it('returns nothing for a bodyless release', () => {
    expect(releaseItems(null)).toEqual([]);
    expect(releaseItems('plain paragraph only')).toEqual([]);
  });
});

describe('fetchWhatsNew', () => {
  it('maps GitHub releases to entries, newest first as returned', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([RELEASE])));

    const entries = await fetchWhatsNew();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      id: 'v1.2.0',
      kind: 'release',
      title: 'v1.2.0 — RTL polish',
      version: 'v1.2.0',
      date: '2026-10-16T12:00:00Z',
      url: 'https://github.com/amirkabiri/qalam/releases/v1.2.0',
      items: ['ui: add the What\u2019s New dialog', 'linked fix'],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/amirkabiri/qalam/releases?per_page=20',
      { headers: { Accept: 'application/vnd.github+json' } },
    );
  });

  it('falls back to recent commits when no release exists', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => (
      String(url).includes('/releases') ? jsonResponse([]) : jsonResponse([COMMIT])
    ));
    vi.stubGlobal('fetch', fetchMock);

    const entries = await fetchWhatsNew();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      id: 'abc1234def5678',
      kind: 'commit',
      title: 'feat(ui): something', // subject only — the body is dropped
      version: null,
      date: '2026-10-15T08:30:00Z',
      url: 'https://github.com/amirkabiri/qalam/commit/abc1234',
      items: [],
    });
  });

  it('throws on HTTP failures (rate limits, network errors)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'API rate limit' }, 403)));

    await expect(fetchWhatsNew()).rejects.toThrow('403');
  });
});

describe('formatWhatsNewDate', () => {
  it('formats per the UI language locale', () => {
    expect(formatWhatsNewDate('2026-10-16T12:00:00Z', 'en')).toMatch(/2026/);
    expect(formatWhatsNewDate('2026-10-16T12:00:00Z', 'fa')).toMatch(/[۰-۹]/); // Persian digits
  });

  it('returns the empty string for missing/invalid dates', () => {
    expect(formatWhatsNewDate('', 'en')).toBe('');
    expect(formatWhatsNewDate('not-a-date', 'en')).toBe('');
  });
});
