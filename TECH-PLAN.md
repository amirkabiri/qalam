# Qalam — Technical-Improvement Plan

Pass date: 2026-10-16 · Baseline: commit `fa5cce9`, typecheck ✓ lint ✓ 598 unit ✓ build ✓

Scope of the review: full `src/` tree (~17.9k LOC incl. tests), `e2e/`, build &
tooling configs (Vite, Vitest, Playwright, ESLint, tsconfig, CI), bundle
output, CSP, and error/observability paths. `src/features/editor/**` was
reviewed read-only but is FROZEN for this pass (kanban `t_d18b34b2`, selection
toolbar toggle, is in flight there).

---

## 1. Findings (each maps to a board task)

### P0 — correctness / user-facing gaps

**F1. AI send failures are silent** (`src/features/ai/AiPanel.tsx`)
`performSend` catches provider/agent errors with `console.error` only. When a
stream dies before any text and no tool call ran, the assistant bubble is
dropped entirely (`final === '' && tools.length === 0` → filter): the user's
message just hangs with zero feedback. No `aiError`-style i18n key exists.
*Fix:* surface an inline error state on the assistant bubble (+ i18n EN/FA),
keep the draft recoverable, unit-test the failure path.

**F2. `aria-live="polite"` on the whole preview article** (`src/features/preview/Preview.tsx`)
The article re-injects its full innerHTML on every 300 ms debounce while
typing; as a live region it can re-announce huge document content to screen
readers on every pause. *Fix:* drop the live region from the article (announce
load/error notes via a small dedicated `role="status"` element instead).

**F3. No error boundary — any render error unmounts the app** (`src/App.tsx`)
One thrown render error blank the whole workspace with no recovery path even
though the document text lives in recoverable state. *Fix:* a small
ErrorBoundary around `Shell` with a reset affordance; test with a throwing
probe component.

### P1 — performance, a11y, security hardening

**F4. Entry bundle 799 kB min / 257 kB gzip** (`src/lib/markdown.ts`, measured build output)
`highlight.js/lib/common` (~all common languages), DOMPurify, marked, React
and react-aria all ship in the entry chunk; mermaid is already split (good).
*Fix:* dynamic-import highlight.js (and/or register only the languages the app
targets) so the parser set loads with the first code block, not at boot.
Measure before/after in the task.

**F5. Split divider is pointer-only + hardcoded English** (`src/app/Workspace.tsx`)
`role="separator"` has no keyboard resize (WCAG 2.1.1 / APG separator
pattern), no `aria-valuenow`, and its `title` plus the pane `aria-label`s
("Markdown editor", "Preview") bypass i18n in a bilingual app. *Fix:* Arrow-key
resize with visible focus, exposed value, localized strings.

**F6. CSP is wider than it needs to be because of the CDN font** (`index.html`)
`style-src … https://cdn.jsdelivr.net` + `font-src https://cdn.jsdelivr.net`
exist only for Vazirmatn; the CDN also sees every boot (privacy + offline).
*Fix:* self-host the font under `public/fonts`, drop the jsdelivr origins
from the CSP, keep `crossorigin` semantics right.

**F7. Dead code + misleading archaeology comments** (`src/lib/documents.ts` + ~12 files)
`getRecent`/`addRecent`/`RecentItem`/`MAX_RECENT` have no production callers
(only their own tests); a dozen module headers narrate a `legacy/` twin tree
that does not exist in the repo. *Fix:* remove the dead API, sweep the stale
`legacy/…` comment references.

**F8. Full-document byte copies just to check the 10 MB cap**
(`src/features/preview/useMarkdownPreview.ts`, `src/features/documents/useDocuments.ts` ×2)
`new TextEncoder().encode(text).length` allocates a full UTF-8 copy of up to
10 MB on every debounced preview render and every load. *Fix:* module-level
encoder + cheap `text.length` pre-check (ASCII fast path) before encoding.

### P2 — maintainability / tooling

**F9. No coverage tooling** (`package.json`, `vitest.config.ts`)
No `@vitest/coverage-v8`, no `coverage` script — the 598-test suite's blind
spots are unmeasurable. *Fix:* add the provider + `test:coverage` script,
record current baselines, wire an optional threshold (not gating at first).

**F10. AiPanel.tsx is an 827-line component** (`src/features/ai/AiPanel.tsx`)
The send pipeline (`performSend` ~150 lines), provider resolution, and diff
resolution live inline; hard to extend (e.g. abort/retry) safely. *Fix:*
extract a `useAiChat`-style controller (pure-ish, unit-testable) keeping the
frozen `props = { editor, t, lang }` contract; behavior-identical.

### Explicitly checked, no action

- **XSS**: render pipeline is DOMPurify-sanitized before enhancement; AI
  bubbles are text-only; mermaid runs `securityLevel: 'strict'`; error notes
  HTML-escape. CSP `script-src 'self'` in production, verified by e2e boot.
- **Secrets**: provider API keys live in `mv:ai` localStorage — client-only
  app, never leaves the browser except to the user's own configured endpoint;
  `http.ts` redacts `sk-…` tokens from error bodies.
- **Persistence**: IndexedDB → memory fallback chain, pagehide flush +
  sync draft snapshot, Web Locks + BroadcastChannel with degraded adapters.
  Well covered by tests.
- **CI**: typecheck + lint + unit + build + e2e (3 browsers) on push/PR. Good.
- **t_d18b34b2 (editor toggle bug)** already tracked on the board — not
  duplicated here; all editor findings are deferred behind it (Phase 3).

## 2. Phases

**Phase 1 — user-facing fixes (no `src/features/editor`)**: F1, F2, F3, F8, F7
**Phase 2 — perf & hardening (no `src/features/editor`)**: F4, F5, F6, F9
**Phase 3 — blocked until `t_d18b34b2` completes**: F10 + any editor findings.
F10 itself only touches `src/features/ai` but is sequenced last as the largest
refactor; editor tasks must not start before the board task closes.

Every task: `pnpm typecheck && pnpm lint && pnpm test` green before commit;
e2e after each UI-touching phase; small commits, direct pushes to main
(never force-push).

## 3. Board tasks

Seeded via `docs/tech-tasks.sh` (idempotent: `--idempotency-key` per task).
One task per finding, priority 1 (P0) / 2 (P1) / 3 (P2), P2 tasks parked with
`--triage`. NOTE: the pass that wrote this plan ran as a delegate child, whose
kanban mutations are fenced — the parent (or any unrestricted session) runs
the script once to create the tasks; the implementing worker claims them with
`hermes kanban claim <id>`.
