// Module: features/editor/markdownActions — the PURE formatting engine behind
// the editor's selection toolbar. (text, selStart, selEnd, action) →
// (text, selStart, selEnd), no DOM access, so the whole toggle matrix is
// unit-testable in node and the controller can write the result back through
// its undo-preserving write primitive (one native undo step per action).
//
// Semantics per docs/selection-toolbar-research.md §3.3 (references: GitHub's
// @github/markdown-toolbar-element, EasyMDE's _toggleBlock, CommonMark
// emphasis rules):
//   1. unwrap-in-place   — markers immediately around the selection → remove;
//   2. strip-from-selection — selection fully wrapped in markers → strip;
//   3. wrap              — otherwise insert marker+core+marker, edge
//                          whitespace trimmed out of the wrap; empty
//                          selection inserts an empty pair, caret inside.
// Prefix actions (headings, lists, blockquote) are per-line on the whole-line
// expansion of the selection, and toggle: off when EVERY non-empty selected
// line already carries the prefix, on otherwise.
//
// Toggle state inspection (t_d18b34b2): the toolbar reads the selection's
// CURRENT formatting through getSelectionFormatting, and the wrap actions
// honor it — a selection strictly INSIDE an existing emphasis span (e.g. one
// word of an already-bold sentence) toggles that span OFF instead of stacking
// a second marker pair, and a PARTIALLY bold selection unifies (the bold
// extends over the whole selection). Detection scans the enclosing paragraph
// for matched marker-character runs (`**`, `*`/`_`, `~~`, backticks), so
// `***both***` reads as bold+italic and unwraps one layer per action.

/** The toolbar's action ids (the RAC Menu keys). */
export type FormatAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock';

/** New document text plus where the selection should land afterwards. */
export interface FormatResult {
  text: string;
  selStart: number;
  selEnd: number;
}

const INLINE_MARKERS: Partial<Record<FormatAction, string>> = {
  bold: '**',
  italic: '*',
  strikethrough: '~~',
  inlineCode: '`',
};

/** ATX heading marker of `level` ('## '), list markers, etc. */
const HEADING_RE = /^(\s*)(#{1,6})[ \t]+(.*)$/;
const BULLET_RE = /^(\s*)- /;
const NUMBERED_RE = /^(\s*)\d+[.)] /;
const TASK_RE = /^(\s*)- \[[ xX]\] /;
const QUOTE_RE = /^(\s*)> ?/;
const INDENT_RE = /^\s*/;
const URL_RE = /^https?:\/\//i;

/** Leading indentation of a line ('' when none). */
function indentOf(line: string): string {
  const m = line.match(INDENT_RE);
  return m ? m[0] : '';
}

/** Whole-line expansion bounds of [lo, hi): the first line's start and the
 *  end of the line containing the last covered character. */
function lineBounds(text: string, lo: number, hi: number): [number, number] {
  const start = lo === 0 ? 0 : text.lastIndexOf('\n', lo - 1) + 1;
  const lastCovered = Math.max(hi - 1, lo);
  const nl = text.indexOf('\n', lastCovered);
  const end = nl === -1 ? text.length : nl;
  return [start, end];
}

/**
 * Emphasis-run machinery (t_d18b34b2): emphasis in a markdown source is a
 * matched pair of runs of the SAME marker character around a non-blank
 * inner span, inside one paragraph (emphasis cannot cross a blank line).
 * A maximal run of length L for `*`/`_` renders bold when L >= 2 and italic
 * when L is odd — so `***x***` is both, `**x**` bold only, `*x*` italic
 * only. All positions are offsets into `text`.
 */
interface MarkerRun {
  start: number;
  end: number;
}

/** A matched opener/closer run pair — the emphasis span [openEnd, closeStart). */
interface MarkerPair {
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
}

/** Word character (the CommonMark intraword rule for `_` emphasis). */
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

/** A run of length `len` can serve a `need`-wide marker when long enough
 *  and — for the ITALIC marker (`*`/`_`) — of odd length (an even run is a
 *  bold `**`/`__` marker and renders no italics). */
function usableRun(ch: string, need: number, len: number): boolean {
  if (len < need) return false;
  if (need === 1 && (ch === '*' || ch === '_') && len % 2 === 0) return false;
  return true;
}

/** `_` runs must sit on word boundaries (intraword `_foo_` is literal). */
function boundaryOk(text: string, ch: string, outside: number): boolean {
  return ch !== '_' || !WORD_CHAR_RE.test(text[outside] ?? '');
}

/** Enclosing paragraph bounds [start, end): emphasis cannot cross a blank
 *  line, so the marker scan never needs to leave it. */
function paraBounds(text: string, lo: number, hi: number): [number, number] {
  const start = text.lastIndexOf('\n\n', Math.max(0, lo - 1));
  const end = text.indexOf('\n\n', Math.max(0, hi - 1));
  return [start === -1 ? 0 : start + 2, end === -1 ? text.length : end];
}

/** Every usable marker-character run in [p0, p1), left to right. */
function usableRuns(text: string, p0: number, p1: number, ch: string, need: number): MarkerRun[] {
  const runs: MarkerRun[] = [];
  let i = p0;
  while (i < p1) {
    if (text[i] === ch) {
      let e = i;
      while (e + 1 < p1 && text[e + 1] === ch) e += 1;
      if (
        usableRun(ch, need, e + 1 - i)
        && boundaryOk(text, ch, i - 1)
        && boundaryOk(text, ch, e + 1)
      ) {
        runs.push({ start: i, end: e + 1 });
      }
      i = e + 1;
      continue;
    }
    i += 1;
  }
  return runs;
}

/** Sequential (opener/closer) pairing of the usable runs. */
function markerPairs(runs: MarkerRun[]): MarkerPair[] {
  const pairs: MarkerPair[] = [];
  for (let k = 0; k + 1 < runs.length; k += 2) {
    pairs.push({
      openStart: runs[k].start,
      openEnd: runs[k].end,
      closeStart: runs[k + 1].start,
      closeEnd: runs[k + 1].end,
    });
  }
  return pairs;
}

function pairsInParagraph(
  text: string,
  lo: number,
  hi: number,
  ch: string,
  need: number,
): MarkerPair[] {
  const [p0, p1] = paraBounds(text, lo, hi);
  const pairs = markerPairs(usableRuns(text, p0, p1, ch, need));
  // A pair with a blank inner span is not emphasis (two adjacent `*a* *b*`
  // runs must not read as a pair around the space between them).
  return pairs.filter((p) => text.slice(p.openEnd, p.closeStart).trim() !== '');
}

/** The innermost matched emphasis pair whose span CONTAINS the whole
 *  selection — null when the selection is not entirely inside one. */
function findEnclosingPair(
  text: string,
  lo: number,
  hi: number,
  ch: string,
  need: number,
): MarkerPair | null {
  if (lo === hi) return null;
  let best: MarkerPair | null = null;
  for (const pair of pairsInParagraph(text, lo, hi, ch, need)) {
    if (pair.openEnd <= lo && pair.closeStart >= hi) {
      if (!best || pair.closeStart - pair.openEnd < best.closeStart - best.openEnd) {
        best = pair;
      }
    }
  }
  return best;
}

/** Matched emphasis pairs OVERLAPPING the selection (for partial-bold
 *  unification), ordered by position. */
function overlappingPairs(
  text: string,
  lo: number,
  hi: number,
  ch: string,
  need: number,
): MarkerPair[] {
  if (lo === hi) return [];
  return pairsInParagraph(text, lo, hi, ch, need)
    .filter((p) => p.openStart < hi && p.closeEnd > lo)
    .sort((a, b) => a.openStart - b.openStart);
}

/** Remove a pair's markers: `need` chars off each run's INNER edge (a `***`
 *  run loses only two stars — the italic layer stays). */
function unwrapPair(text: string, lo: number, hi: number, pair: MarkerPair, need: number): FormatResult {
  const cut = (s: string, from: number, to: number) => s.slice(0, from) + s.slice(to);
  const withoutClose = cut(text, pair.closeStart, pair.closeStart + need);
  const withoutOpen = cut(withoutClose, pair.openEnd - need, pair.openEnd);
  return { text: withoutOpen, selStart: lo - need, selEnd: hi - need };
}

/** Classic wrap (research §3.3 algorithm 3): insert marker+core+marker with
 *  edge whitespace trimmed out of the wrap; an empty selection inserts an
 *  empty pair with the caret inside. */
function wrapRange(text: string, lo: number, hi: number, marker: string): FormatResult {
  const n = marker.length;
  if (lo === hi) {
    return {
      text: text.slice(0, lo) + marker + marker + text.slice(hi),
      selStart: lo + n,
      selEnd: lo + n,
    };
  }
  const selected = text.slice(lo, hi);
  const lead = indentOf(selected);
  const trail = selected.slice(lead.length).match(/\s*$/)?.[0] ?? '';
  const core = selected.slice(lead.length, selected.length - trail.length);
  const inserted = lead + marker + core + marker + trail;
  return {
    text: text.slice(0, lo) + inserted + text.slice(hi),
    selStart: lo + lead.length + n,
    selEnd: lo + lead.length + n + core.length,
  };
}

/**
 * The toggle wrap (research §3.3, extended by t_d18b34b2):
 *   1. ENCLOSED — the selection sits entirely inside an existing emphasis
 *      span (markers immediately hugging it is the adjacent case) → unwrap;
 *   2. strip-from-selection — the selection itself is fully wrapped → strip;
 *   3. UNIFY — the selection overlaps spans without being enclosed (it is
 *      PARTIALLY bold) → strip those spans and wrap the union;
 *   4. wrap — otherwise insert a fresh marker pair.
 */
function toggleWrap(text: string, lo: number, hi: number, marker: string): FormatResult {
  const n = marker.length;
  if (lo === hi) return wrapRange(text, lo, hi, marker);
  const ch = marker[0];
  // 1. Enclosed → unwrap (the whole span toggles off, selection follows).
  const enclosing = findEnclosingPair(text, lo, hi, ch, n);
  if (enclosing) return unwrapPair(text, lo, hi, enclosing, n);
  const selected = text.slice(lo, hi);
  // 2. Strip-from-selection: the selection itself is fully wrapped.
  if (selected.length >= 2 * n && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(n, selected.length - n);
    return {
      text: text.slice(0, lo) + inner + text.slice(hi),
      selStart: lo,
      selEnd: lo + inner.length,
    };
  }
  // 3. Partial overlap → unify: strip every overlapping span's markers, then
  //    wrap the union extent (e.g. `**bo**ld` + bold → `**bold**`).
  const overlap = overlappingPairs(text, lo, hi, ch, n);
  if (overlap.length > 0) {
    let unionLo = lo;
    let unionHi = hi;
    for (const p of overlap) {
      unionLo = Math.min(unionLo, p.openStart);
      unionHi = Math.max(unionHi, p.closeEnd);
    }
    const cuts: [number, number][] = [];
    for (const p of overlap) {
      cuts.push([p.openEnd - n, p.openEnd], [p.closeStart - n, p.closeEnd]);
    }
    cuts.sort((a, b) => b[0] - a[0]);
    let next = text;
    for (const [from, to] of cuts) next = next.slice(0, from) + next.slice(to);
    // Removed characters left of a position shift it by their total length.
    const shift = (pos: number) => cuts.reduce(
      (acc, [from, to]) => (to <= pos ? acc + (to - from) : acc),
      0,
    );
    return wrapRange(next, unionLo - shift(unionLo), unionHi - shift(unionHi), marker);
  }
  // 4. Plain wrap.
  return wrapRange(text, lo, hi, marker);
}

/** The `[label](url)` span around the selection, if the selection sits
 *  inside one (the whole link counts too) — research §3.3. */
function findLinkSpan(
  text: string,
  lo: number,
  hi: number,
): { open: number; close: number; urlEnd: number } | null {
  const open = text.lastIndexOf('[', lo);
  if (open < 0) return null;
  const close = text.indexOf(']', open);
  if (close <= open) return null;
  if (text.slice(close, close + 2) !== '](') return null;
  const urlEnd = text.indexOf(')', close);
  if (urlEnd < 0) return null;
  // The selection must sit inside the link (the whole link counts too).
  if (lo < open || hi > urlEnd + 1) return null;
  return { open, close, urlEnd };
}

/** Remove one `[label](url)` layer around the selection, selecting the label. */
function unwrapLink(text: string, lo: number, hi: number): FormatResult | null {
  const span = findLinkSpan(text, lo, hi);
  if (!span) return null;
  const label = text.slice(span.open + 1, span.close);
  return {
    text: text.slice(0, span.open) + label + text.slice(span.urlEnd + 1),
    selStart: span.open,
    selEnd: span.open + label.length,
  };
}

/** Link is not a toggle: label-first, URL-in-selection, or the empty case. */
function applyLink(text: string, lo: number, hi: number): FormatResult {
  const unwrapped = unwrapLink(text, lo, hi);
  if (unwrapped) return unwrapped;
  const selected = text.slice(lo, hi);
  if (URL_RE.test(selected.trim())) {
    // URL-in-selection → label-first: [](selected-url), cursor on the label.
    return {
      text: `${text.slice(0, lo)}[](${selected})${text.slice(hi)}`,
      selStart: lo + 1,
      selEnd: lo + 1,
    };
  }
  if (selected === '') {
    // Empty selection → [](url) with the placeholder selected.
    return {
      text: `${text.slice(0, lo)}[](url)${text.slice(hi)}`,
      selStart: lo + 2,
      selEnd: lo + 5,
    };
  }
  return {
    text: `${text.slice(0, lo)}[${selected}](url)${text.slice(hi)}`,
    selStart: lo + selected.length + 3,
    selEnd: lo + selected.length + 6,
  };
}

/** Per-line transform shared by every prefix action: `lines` are the whole-
 *  line expansion of the selection, and the result selects the whole range. */
function transformLines(
  text: string,
  lo: number,
  hi: number,
  perLine: (line: string, index: number) => string,
): FormatResult {
  const [start, end] = lineBounds(text, lo, hi);
  const lines = text.slice(start, end).split('\n');
  const next = lines.map(perLine);
  const inserted = next.join('\n');
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    selStart: start,
    selEnd: start + inserted.length,
  };
}

/** Line is visually empty (blank or whitespace-only) — prefix actions skip it. */
function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** Exact ATX marker of `level` (the toggle-off test shared by applyHeading
 *  and getSelectionFormatting). */
function exactHeadingRe(level: 2 | 3): RegExp {
  return new RegExp(`^(\\s*)${'#'.repeat(level)}[ \\t]+`);
}

function applyHeading(
  text: string,
  lo: number,
  hi: number,
  level: 2 | 3,
): FormatResult {
  const marker = `${'#'.repeat(level)} `;
  const exact = exactHeadingRe(level);
  const [start, end] = lineBounds(text, lo, hi);
  const lines = text.slice(start, end).split('\n');
  const body = lines.filter((line) => !isBlank(line));
  // Toggle off only when EVERY non-empty line carries exactly this level;
  // otherwise every line settles on the target level (replace or add).
  const allExact = body.length > 0 && body.every((line) => exact.test(line));
  return transformLines(text, lo, hi, (line) => {
    if (isBlank(line)) return line;
    if (allExact) return line.replace(exact, '$1');
    const atx = line.match(HEADING_RE);
    const indent = indentOf(line);
    if (atx) return `${indent}${marker}${atx[3]}`;
    return `${indent}${marker}${line.slice(indent.length)}`;
  });
}

/** Shared per-line list/prefix toggle: off when every non-empty line matches
 *  `mark` (one level stripped), otherwise `add` prefixes each non-empty line
 *  (`ordinal` = 0-based index among the non-empty lines, for renumbering). */
function togglePrefix(
  text: string,
  lo: number,
  hi: number,
  mark: RegExp,
  add: (line: string, ordinal: number) => string,
): FormatResult {
  const [start, end] = lineBounds(text, lo, hi);
  const lines = text.slice(start, end).split('\n');
  const body = lines.filter((line) => !isBlank(line));
  const allMarked = body.length > 0 && body.every((line) => mark.test(line));
  let ordinal = 0;
  return transformLines(text, lo, hi, (line) => {
    if (isBlank(line)) return line;
    if (allMarked) return line.replace(mark, '$1');
    const next = ordinal;
    ordinal += 1;
    return add(line, next);
  });
}

/** Code block / multi-line inline code: fence the whole-line expansion with
 *  blank-line padding (GitHub's surroundWithNewlines); a selected fenced
 *  block toggles the fences back off (padding is left as-is). */
function toggleCodeBlock(text: string, lo: number, hi: number): FormatResult {
  const [start, end] = lineBounds(text, lo, hi);
  const content = text.slice(start, end);
  if (content.startsWith('```\n') && content.endsWith('\n```')) {
    const inner = content.slice(4, content.length - 4);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selStart: start,
      selEnd: start + inner.length,
    };
  }
  // Ensure exactly one blank line before/after (already-blank edges stay).
  let pre = '';
  if (start > 0) {
    if (text[start - 1] !== '\n') pre = '\n\n';
    else if (start >= 2 && text[start - 2] !== '\n') pre = '\n';
  }
  let post = '';
  if (end < text.length) {
    if (text[end] !== '\n') post = '\n\n';
    else if (end + 1 < text.length && text[end + 1] !== '\n') post = '\n';
  }
  const inserted = `${pre}\`\`\`\n${content}\n\`\`\`${post}`;
  // Select the whole block (fences included) so a second press toggles off.
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    selStart: start + pre.length,
    selEnd: start + inserted.length,
  };
}

/**
 * Apply a formatting action to `text` over the selection [selStart, selEnd)
 * and return the new text plus where the selection should land (so repeated
 * actions toggle, and typing continues naturally).
 */
export function applyAction(
  text: string,
  selStart: number,
  selEnd: number,
  action: FormatAction,
): FormatResult {
  const lo = Math.min(selStart, selEnd);
  const hi = Math.max(selStart, selEnd);

  const inlineMarker = INLINE_MARKERS[action];
  if (inlineMarker) {
    // Inline code on a multi-line selection becomes a fenced block instead.
    if (action === 'inlineCode' && text.slice(lo, hi).includes('\n')) {
      return toggleCodeBlock(text, lo, hi);
    }
    return toggleWrap(text, lo, hi, inlineMarker);
  }
  switch (action) {
    case 'link':
      return applyLink(text, lo, hi);
    case 'heading2':
      return applyHeading(text, lo, hi, 2);
    case 'heading3':
      return applyHeading(text, lo, hi, 3);
    case 'bulletList':
      return togglePrefix(text, lo, hi, BULLET_RE, (line) => `${indentOf(line)}- ${line.slice(indentOf(line).length)}`);
    case 'numberedList':
      return togglePrefix(text, lo, hi, NUMBERED_RE, (line, index) => `${indentOf(line)}${index + 1}. ${line.slice(indentOf(line).length)}`);
    case 'taskList':
      // An existing bullet becomes the task marker instead of stacking.
      return togglePrefix(text, lo, hi, TASK_RE, (line) => {
        const bullet = line.replace(BULLET_RE, '$1');
        const indent = indentOf(bullet);
        return `${indent}- [ ] ${bullet.slice(indent.length)}`;
      });
    case 'blockquote':
      return togglePrefix(text, lo, hi, QUOTE_RE, (line) => `${indentOf(line)}> ${line.slice(indentOf(line).length)}`);
    case 'codeBlock':
      return toggleCodeBlock(text, lo, hi);
    default:
      return { text, selStart: lo, selEnd: hi };
  }
}

/** Per-action ACTIVE state for the toolbar's buttons: true when the action
 *  would toggle OFF — the selection is entirely inside that formatting
 *  (or, for prefixes, every selected line carries it). */
export interface SelectionFormatState {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  inlineCode: boolean;
  link: boolean;
  heading2: boolean;
  heading3: boolean;
  bulletList: boolean;
  numberedList: boolean;
  taskList: boolean;
  blockquote: boolean;
  codeBlock: boolean;
}

/** The selection itself carries a full `marker…marker` wrapper (markers
 *  included in the selection strip to the same text as an unwrap). */
function selectionWrapped(selected: string, marker: string): boolean {
  const n = marker.length;
  return selected.length >= 2 * n && selected.startsWith(marker) && selected.endsWith(marker);
}

/** Inspect the markdown source around the pinned selection and report which
 *  toolbar actions are currently ACTIVE on it (SelectionToolbar renders
 *  aria-pressed from this). A caret selection is active for nothing. */
export function getSelectionFormatting(
  text: string,
  selStart: number,
  selEnd: number,
): SelectionFormatState {
  const state: SelectionFormatState = {
    bold: false,
    italic: false,
    strikethrough: false,
    inlineCode: false,
    link: false,
    heading2: false,
    heading3: false,
    bulletList: false,
    numberedList: false,
    taskList: false,
    blockquote: false,
    codeBlock: false,
  };
  const lo = Math.min(selStart, selEnd);
  const hi = Math.max(selStart, selEnd);
  if (lo === hi) return state;
  const selected = text.slice(lo, hi);
  const inside = (ch: string, need: number) => findEnclosingPair(text, lo, hi, ch, need) !== null;
  const fenced = (content: string) => content.startsWith('```\n') && content.endsWith('\n```');

  state.bold = inside('*', 2) || selectionWrapped(selected, '**');
  state.italic = inside('*', 1) || inside('_', 1) || selectionWrapped(selected, '*');
  state.strikethrough = inside('~', 2) || selectionWrapped(selected, '~~');
  const [start, end] = lineBounds(text, lo, hi);
  const content = text.slice(start, end);
  // Multi-line selections render as fenced blocks (applyAction does too).
  state.inlineCode = inside('`', 1) || (selected.includes('\n') && fenced(content));
  state.codeBlock = fenced(content);
  state.link = findLinkSpan(text, lo, hi) !== null;

  const body = content.split('\n').filter((line) => !isBlank(line));
  const every = (re: RegExp) => body.length > 0 && body.every((line) => re.test(line));
  state.heading2 = every(exactHeadingRe(2));
  state.heading3 = every(exactHeadingRe(3));
  state.bulletList = every(BULLET_RE);
  state.numberedList = every(NUMBERED_RE);
  state.taskList = every(TASK_RE);
  state.blockquote = every(QUOTE_RE);
  return state;
}
