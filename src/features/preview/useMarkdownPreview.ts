// Module: features/preview/useMarkdownPreview — the React half of the legacy
// render pipeline (legacy/src/markdown.ts scheduleRender/renderPreview): the
// pure renderMarkdown output (html + toc + mermaid sources) over a 300 ms
// debounced text mirror, plus the legacy too-large guard. Rendering into the
// DOM is <Preview />'s job.
import { useEffect, useMemo, useState } from 'react';

import { MAX_INPUT_BYTES, byteLengthOver } from '../../lib/store';
import { loadHighlighter } from '../../lib/highlight';
import { RENDER_DEBOUNCE_MS, renderMarkdown } from '../../lib/markdown';
import type { MarkdownTocEntry } from '../../lib/markdown';

export interface MarkdownPreviewState {
  /** Sanitized, enhanced HTML ready for injection. */
  html: string;
  /** The EXACT source text `html` was rendered from (the debounce mirror) —
   *  the key the selection→source anchoring maps against. */
  source: string;
  /** h2–h4 table-of-contents entries in document order. */
  toc: MarkdownTocEntry[];
  /** Set when marked failed to parse (an error-note is rendered instead). */
  error: string | null;
  /** Set when the document exceeds the 10 MB cap (tooLarge note instead). */
  tooLarge: boolean;
}

/** Legacy debounce cadence (300 ms) for preview re-renders while typing. */
export { RENDER_DEBOUNCE_MS };

const EMPTY: MarkdownPreviewState = {
  html: '', source: '', toc: [], error: null, tooLarge: false,
};

export interface MarkdownPreviewOptions {
  /** Base URL for resolving relative links/images (legacy: doc.baseUrl). */
  baseUrl?: string;
  /**
   * Changes when a new document loads: the debounce is skipped so the new
   * document renders immediately (legacy setDoc rendered synchronously).
   */
  immediateKey?: string;
}

export function useMarkdownPreview(
  text: string,
  { baseUrl, immediateKey }: MarkdownPreviewOptions = {},
): MarkdownPreviewState {
  const [debounced, setDebounced] = useState(text);
  const [prevKey, setPrevKey] = useState(immediateKey);
  /* highlight.js is lazy (entry-bundle diet): bump once when it lands so
     code blocks rendered plain in the meantime re-render highlighted. */
  const [highlightTick, setHighlightTick] = useState(0);
  useEffect(() => {
    let live = true;
    loadHighlighter().then((hljs) => {
      if (hljs && live) setHighlightTick((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  // Document switch: render immediately, like legacy setDoc (adjusting state
  // during render — the React-endorsed derived-reset pattern). Typing goes
  // through the debounce effect below.
  if (immediateKey !== prevKey) {
    setPrevKey(immediateKey);
    setDebounced(text);
  }

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), RENDER_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);

  return useMemo<MarkdownPreviewState>(() => {
    if (byteLengthOver(debounced, MAX_INPUT_BYTES)) {
      return { ...EMPTY, tooLarge: true };
    }
    const result = renderMarkdown(debounced, { baseUrl });
    return {
      html: result.html,
      source: debounced,
      toc: result.toc,
      error: result.error ?? null,
      tooLarge: false,
    };
  // highlightTick is a re-render trigger, not memo input: when the lazy
  // highlighter lands, already-rendered plain code blocks must re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, baseUrl, highlightTick]);
}
