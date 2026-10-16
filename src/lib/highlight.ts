// Module: lib/highlight — lazy access to highlight.js. The full common
// language set is a large chunk (~200 kB min) that only matters once a code
// block actually renders, so it must not sit in the entry bundle. The module
// is loaded once on demand (dynamic import); until it lands, renderMarkdown
// leaves code blocks plain — the preview re-renders on the load resolving
// (see useMarkdownPreview). Tests inject the module explicitly instead.

type Highlighter = typeof import('highlight.js/lib/common')['default'];

let loaded: Highlighter | null = null;
let loading: Promise<Highlighter | null> | null = null;

/**
 * Kicks off the one-time dynamic import and resolves with the module
 * (null when the import fails — highlighting is an enhancement, never a
 * requirement). Idempotent; safe to call on every render.
 */
export function loadHighlighter(): Promise<Highlighter | null> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import('highlight.js/lib/common')
    .then((m) => {
      loaded = m.default;
      return loaded;
    })
    .catch(() => null);
  return loading;
}

/**
 * The loaded module, or null before the dynamic import resolved. Pure sync
 * access for the render pipeline (no highlighting when not yet loaded).
 */
export function highlighter(): Highlighter | null {
  return loaded;
}

/** Test seam: inject/eject the module without a dynamic import. */
export function setHighlighter(hljs: Highlighter | null): void {
  loaded = hljs;
}
