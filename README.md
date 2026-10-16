<p align="center"><img src="public/logo.svg" width="96" height="96" alt="Qalam logo — a minimal reed-pen nib"></p>

# Qalam

<p align="center"><strong>قلم</strong> — "pen" · collaborative Markdown where humans and AI write together — on-device or with your own keys, Persian/RTL-first.</p>

[![CI](https://github.com/amirkabiri/qalam/actions/workflows/ci.yml/badge.svg)](https://github.com/amirkabiri/qalam/actions/workflows/ci.yml) · **[Try it live →](https://amirkabiri.github.io/qalam/)**

## Why Qalam

- **AI co-author with real write access** — not a chatbot bolted to the side: the agent edits the document itself through tool calls; select a section, type an instruction, and that exact range is rewritten.
- **On-device or BYO keys** — runs fully in your browser (Gemini Nano, free & offline-capable) or against your own OpenAI-/Anthropic-compatible endpoint; tokens never leave your browser except to the endpoint you set.
- **RTL-first, zero backend** — built for Persian and RTL from the ground up; static files only, no server, no accounts, no telemetry.

## Features

- **Split-pane live preview** — write on one side, read on the other, with scroll sync, syntax highlighting, Mermaid diagrams, auto TOC and word counts.
- **Agent-based AI editing** — the assistant reads the document and edits it via tools (insert, rewrite selection, append, replace-all with confirmation); direct-edit off = read-only suggestions, on = edits that preserve your native undo.
- **Three AI providers** — built-in Gemini Nano (Prompt API), OpenAI-compatible, or Anthropic-compatible: your base URL, your model, your optional token.
- **Autosaved multi-document workspace** — every change persisted to IndexedDB; create, rename, reorder documents; multi-tab safe with session locks and live sync.
- **Persian & RTL done right** — Vazirmatn font, per-paragraph direction auto-detection, mirrored bilingual UI (EN ⇄ FA), Persian digits, LTR-isolated inline code.
- **Self-contained share links** — the whole document rides in the `#d=` URL fragment (deflate + base64url), which browsers never send to any server.
- **Hardened, fully client-side** — DOMPurify-sanitized rendering, strict CSP with `script-src 'self'`, no CDN code at runtime.
- **Tested in CI** — ~400 Vitest unit tests + 60 Playwright e2e runs across Chromium, Firefox and WebKit with axe-core accessibility scans, gating every push.

## Quick Start

```bash
git clone https://github.com/amirkabiri/qalam && cd qalam
pnpm install        # Node ≥ 22.13 · pnpm 11 (corepack enable)
pnpm dev
```

Press <kbd>?</kbd> in the app for the keyboard-shortcut cheat sheet — or browse [docs/SHORTCUTS.md](docs/SHORTCUTS.md).

## Links

- **Docs** — [keyboard shortcuts](docs/SHORTCUTS.md)
- **Contributing** — [tasks.md](tasks.md) is the task board; run `pnpm typecheck`, `pnpm lint` and `pnpm test` before pushing
- **Deploy** — pushes to `main` build and deploy to GitHub Pages via Actions
- **License** — [MIT](LICENSE) © Amir Kabiri
