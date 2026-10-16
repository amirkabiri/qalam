// Unit tests for src/lib/documents.ts — the pure document-loading helpers.
// Legacy covered none of these (they were fused to the DOM app); the
// github blob→raw conversion, pretty naming, the timed fetch contract,
// share-hash detection are pinned here. Network
// is faked with real Response objects per TESTING.md; storage with the
// in-memory Storage fake.

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  fetchText,
  hasShareHash,
  normalizeGitHubUrl,
  prettyName,
} from './documents';

const PAGE = 'https://example.github.io/markdown-viewer/';

afterEach(() => vi.unstubAllGlobals());

/* ---------------- normalizeGitHubUrl ---------------- */

describe('normalizeGitHubUrl', () => {
  it('converts a github blob link to a raw.githubusercontent link', () => {
    expect(normalizeGitHubUrl('https://github.com/u/repo/blob/main/notes.md', PAGE))
      .toBe('https://raw.githubusercontent.com/u/repo/main/notes.md');
  });

  it('converts a github raw link to the same raw host (idempotent target)', () => {
    expect(normalizeGitHubUrl('https://github.com/u/repo/raw/dev/a/b.md', PAGE))
      .toBe('https://raw.githubusercontent.com/u/repo/dev/a/b.md');
  });

  it('converts www.github.com links too', () => {
    expect(normalizeGitHubUrl('https://www.github.com/u/repo/blob/v1/readme.markdown', PAGE))
      .toBe('https://raw.githubusercontent.com/u/repo/v1/readme.markdown');
  });

  it('leaves non-github URLs alone (href-normalized)', () => {
    expect(normalizeGitHubUrl('https://example.com/blob/x.md', PAGE))
      .toBe('https://example.com/blob/x.md');
  });

  it('leaves github URLs without a blob/raw path alone', () => {
    expect(normalizeGitHubUrl('https://github.com/u/repo', PAGE))
      .toBe('https://github.com/u/repo');
    expect(normalizeGitHubUrl('https://gist.github.com/u/abc123', PAGE))
      .toBe('https://gist.github.com/u/abc123');
  });

  it('preserves directory nesting and encoded segments', () => {
    expect(normalizeGitHubUrl('https://github.com/u/repo/blob/main/docs/a%20b%20c.md', PAGE))
      .toBe('https://raw.githubusercontent.com/u/repo/main/docs/a%20b%20c.md');
  });

  it('resolves a relative path against the page base without converting', () => {
    expect(normalizeGitHubUrl('docs/a.md', PAGE)).toBe(`${PAGE}docs/a.md`);
  });

  it('returns input unchanged when there is no base to resolve against', () => {
    // No page context (like the node test env): the catch falls back verbatim.
    expect(normalizeGitHubUrl('::not a url::')).toBe('::not a url::');
  });
});

/* ---------------- prettyName ---------------- */

describe('prettyName', () => {
  it('uses the last path segment and strips markdown/text extensions', () => {
    expect(prettyName('https://x.com/docs/notes.md', PAGE)).toBe('notes');
    expect(prettyName('https://x.com/REPORT.MD', PAGE)).toBe('REPORT');
    expect(prettyName('https://x.com/a.b.slide.mdx', PAGE)).toBe('a.b.slide');
    expect(prettyName('https://x.com/old.txt', PAGE)).toBe('old');
    expect(prettyName('https://x.com/other.markdown', PAGE)).toBe('other');
  });

  it('keeps names without a markdown extension', () => {
    expect(prettyName('https://x.com/standup-notes', PAGE)).toBe('standup-notes');
  });

  it('decodes percent-encoded (Persian) names', () => {
    expect(prettyName('https://x.com/%D9%85%D8%AA%D9%86.md', PAGE)).toBe('متن');
  });

  it('falls back to "document" when the URL has no usable name', () => {
    expect(prettyName('', 'https://x.com/')).toBe('document');
    expect(prettyName('::bad::')).toBe('document');
  });
});

/* ---------------- hasShareHash ---------------- */

describe('hasShareHash', () => {
  it('is true only for #d= fragments', () => {
    expect(hasShareHash('#d=R.aGVsbG8')).toBe(true);
    expect(hasShareHash('')).toBe(false);
    expect(hasShareHash('#heading')).toBe(false);
    expect(hasShareHash('#D=x')).toBe(false); // case-sensitive, like legacy
  });
});

/* ---------------- fetchText ---------------- */

describe('fetchText', () => {
  it('returns the body text of an OK response', async () => {
    const fetchImpl = vi.fn(async () => new Response('# Hello', { status: 200 }));
    await expect(fetchText('https://x.com/doc.md', { fetchImpl })).resolves.toBe('# Hello');
  });

  it('throws "HTTP <status>" for non-OK responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(fetchText('https://x.com/missing.md', { fetchImpl })).rejects.toThrow('HTTP 404');
  });

  it('aborts a stalled download when the timeout elapses', async () => {
    vi.useFakeTimers();
    try {
      let captured: RequestInit | undefined;
      const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        captured = init;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        });
      });
      const rejection = expect(fetchText('https://x.com/slow.md', { fetchImpl, timeoutMs: 5000 }))
        .rejects.toThrow('Aborted');
      await vi.advanceTimersByTimeAsync(5000);
      expect(captured?.signal?.aborted).toBe(true);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not abort before the timeout elapses', async () => {
    vi.useFakeTimers();
    try {
      let captured: RequestInit | undefined;
      const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        captured = init;
        return Promise.resolve(new Response('quick'));
      });
      await fetchText('https://x.com/fast.md', { fetchImpl, timeoutMs: 5000 });
      await vi.advanceTimersByTimeAsync(4999);
      expect(captured?.signal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

