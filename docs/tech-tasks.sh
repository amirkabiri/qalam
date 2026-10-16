#!/usr/bin/env bash
# Seed the qalam kanban board with the technical-improvement tasks from
# TECH-PLAN.md (2026-10-16 pass). Idempotent: each task carries an
# --idempotency-key, so re-running never duplicates.
#
# Run from any unrestricted session (delegate children are fenced):
#   bash docs/tech-tasks.sh
set -euo pipefail

BOARD_ARGS=(--board qalam)
CREATED_BY=(--created-by tech-pass)
WORKSPACE=(--workspace dir:/root/projects/qalam)

create() { # create <key> <priority> <triage:0|1> <title> <body>
  local key="$1" pri="$2" tri="$3" title="$4" body="$5"
  local extra=()
  [ "$tri" = "1" ] && extra+=(--triage)
  hermes kanban "${BOARD_ARGS[@]}" create \
    --idempotency-key "tech-pass-$key" \
    --priority "$pri" "${CREATED_BY[@]}" "${WORKSPACE[@]}" "${extra[@]}" \
    --body "$body" "$title"
}

create ai-error-feedback 1 0 \
"AI send failures are silent — surface an error state in the chat" \
"Justification: AiPanel.performSend catches provider/agent errors with console.error only. When a stream dies before any text and no tool call ran, the assistant bubble is dropped entirely — the user's message hangs with zero feedback. No aiError-style i18n key exists (src/features/ai/AiPanel.tsx).

Acceptance criteria:
- A provider/stream failure renders a visible error state on the assistant bubble (new EN+FA dictionary keys), it is not silently dropped.
- The composer draft is recoverable after a failed send; retry does not duplicate the user message.
- Unit test covers the failure path (provider stream rejects mid-run).
- pnpm typecheck, lint, test green; no changes under src/features/editor."

create preview-aria-live 1 0 \
"Preview article aria-live floods screen readers on every debounce" \
"Justification: the preview <article> in src/features/preview/Preview.tsx is aria-live=\"polite\" AND its full innerHTML is re-injected on every 300 ms typing debounce — screen readers can re-announce huge document content on every pause.

Acceptance criteria:
- The article is no longer a live region.
- Load/error/too-large notes are announced via a small dedicated role=\"status\" element instead.
- Existing Preview tests + e2e/a11y.spec.ts stay green (axe scan included).
- No changes under src/features/editor."

create error-boundary 1 0 \
"Add a React error boundary around the app shell" \
"Justification: src/App.tsx has no error boundary — one render error unmounts the whole app with no recovery, even though document text lives in recoverable state.

Acceptance criteria:
- An ErrorBoundary wraps Shell with a minimal, i18n-ed fallback UI and a reset affordance (remount).
- Unit test with a throwing probe component proves the fallback renders and reset recovers.
- No changes under src/features/editor."

create byte-size-check 2 0 \
"Stop allocating full TextEncoder byte copies for the 10 MB size check" \
"Justification: useMarkdownPreview runs new TextEncoder().encode(debounced).length on EVERY debounced render and useDocuments does it on every URL/paste load — a full UTF-8 copy of up to 10 MB just for a size check (src/features/preview/useMarkdownPreview.ts, src/features/documents/useDocuments.ts).

Acceptance criteria:
- Shared helper (e.g. byteLengthOver(text, max) in src/lib) with a cheap text.length fast path; module-level encoder, no per-call allocation.
- Behavior identical at the boundary (unit tests for exactly-at-cap and multi-byte content).
- No changes under src/features/editor."

create dead-code-recent 2 0 \
"Remove dead recent-documents API and stale legacy/ comment references" \
"Justification: getRecent/addRecent/RecentItem/MAX_RECENT in src/lib/documents.ts have no production callers (only their own tests); ~12 module headers narrate a legacy/ twin tree that does not exist in the repo.

Acceptance criteria:
- Dead exports + their tests removed; grep finds no references.
- Stale 'Legacy twin: legacy/…' comment references swept (history lives in git, not comments).
- typecheck/lint/test green; no changes under src/features/editor."

create hljs-lazy 2 0 \
"Shrink the entry bundle: lazy-load highlight.js" \
"Justification: highlight.js/lib/common (the full common-language set), DOMPurify, marked, React and react-aria all ship in the 799 kB (257 kB gzip) entry chunk; mermaid is already code-split. Code highlighting is only needed once a code block renders.

Acceptance criteria:
- highlight.js loads via dynamic import on the render path (or via lib/core + a fixed language set), boot bundle measurably smaller — record before/after sizes in the task.
- Code blocks still highlight; mermaid extraction unaffected; unit + e2e green.
- No changes under src/features/editor."

create divider-keyboard-i18n 2 0 \
"Split divider: keyboard resizing + localized labels" \
"Justification: the Workspace split divider is role=\"separator\" but pointer-only — no Arrow-key resize, no aria-valuenow (WCAG 2.1.1 / APG separator pattern). Its title ('Drag to resize · double-click to reset') and the pane aria-labels ('Markdown editor', 'Preview') are hardcoded English in a bilingual app (src/app/Workspace.tsx).

Acceptance criteria:
- Arrow keys resize the split (RTL-aware), with visible focus and exposed value; double-click reset still works.
- All three strings come from the i18n dictionaries (EN + FA).
- Unit test for keyboard resize; e2e suite green.
- No changes under src/features/editor."

create selfhost-font-csp 2 0 \
"Self-host Vazirmatn, drop cdn.jsdelivr.net from the CSP" \
"Justification: style-src/font-src allow https://cdn.jsdelivr.net solely for the Vazirmatn font (index.html); the CDN is contacted on every boot (privacy, offline, third-party dependency).

Acceptance criteria:
- Font files served from public/fonts (woff2), CSS self-hosted; jsdelivr origins removed from the CSP meta.
- Persian UI renders with Vazirmatn (e2e boot spec still asserts no console errors); offline boot works.
- No changes under src/features/editor."

create vitest-coverage 3 0 \
"Add vitest coverage reporting" \
"Justification: the 598-test suite has no coverage tooling — blind spots are unmeasurable (package.json, vitest.config.ts).

Acceptance criteria:
- @vitest/coverage-v8 added; pnpm test:coverage runs both projects and reports a baseline per directory.
- Thresholds recorded but NOT gating in CI yet (a follow-up once gaps close).
- No production code changes."

create aipanel-decompose 3 1 \
"Decompose AiPanel (827 lines) into a testable chat controller" \
"Justification: src/features/ai/AiPanel.tsx mixes the send pipeline (~150-line performSend), provider resolution, diff resolution and all rendering in one component — the riskiest file to extend (abort, retry, history) safely.

Acceptance criteria:
- Chat run-state (messages, busy, loading label, resolution feed) extracted into a hook/controller unit-testable without the RAC modal.
- Frozen contract preserved: props stay exactly { editor, t, lang }; behavior-identical per the existing AiPanel tests.
- Sequenced LAST — after t_d18b34b2 (selection toolbar) closes to keep concurrent churn away from the chat surface."

echo "Done. Verify with: hermes kanban --board qalam list"
