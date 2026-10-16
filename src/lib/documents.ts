// Module: lib/documents — the PURE halves of the document-loading flow.
// Owner of normalizeGitHubUrl (github blob/raw → raw.githubusercontent),
// prettyName, fetchText (20 s abort timeout, HTTP-status errors, injectable
// fetcher) and the #d= share-hash check. (The legacy mv:recent list is gone:
// documents are repository records now — see src/lib/persistence.) i18n keys
// (loadError/tooLarge/welcome/pastedDoc/unnamedDoc) live in
// src/i18n/dictionaries.ts.

/** Abort a stalled download after this long (identical to legacy). */
export const FETCH_TIMEOUT_MS = 20000;

export interface FetchTextOptions {
  /** Abort a stalled download after this long. */
  timeoutMs?: number;
  /** Injectable fetcher — tests pass a fake; production uses global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Downloads a document: `fetch` with a hard abort timeout, then `HTTP <status>`
 * errors for non-OK responses and the body text for OK ones. Identical to the
 * legacy fetchText, plus the injectable fetcher/timeout for tests.
 */
export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convert github.com blob/raw links to raw.githubusercontent.com. Relative
 * URLs resolve against `base` (default: the current page, like legacy).
 * Anything unparseable comes back unchanged — never throws.
 */
export function normalizeGitHubUrl(u: string, base?: string): string {
  try {
    const url = new URL(u, base ?? window.location.href);
    if (/(^|\.)github\.com$/i.test(url.hostname)) {
      const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/);
      if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
    }
    return url.href;
  } catch {
    return u;
  }
}

/**
 * The human-facing document name for a URL: the last decoded path segment,
 * minus the markdown/text extension, or 'document' when nothing survives.
 * Relative URLs resolve against `base` (default: the current page, like
 * legacy). Never throws.
 */
export function prettyName(u: string, base?: string): string {
  try {
    const last = decodeURIComponent(new URL(u, base ?? window.location.href).pathname.split('/').filter(Boolean).pop() || '');
    return last.replace(/\.(md|markdown|mdx|txt)$/i, '') || 'document';
  } catch {
    return 'document';
  }
}

/**
 * True when a location hash carries a self-contained share payload (`#d=…`).
 * Callers pass `window.location.hash` — the pure module never reads globals.
 */
export function hasShareHash(hash: string): boolean {
  return hash.startsWith('#d=');
}
