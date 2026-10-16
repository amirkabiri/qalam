// Module: features/ai/useChatSession — the chat RUN-STATE controller extracted
// from AiPanel: the transcript (messages array), the busy flag, the first-send
// loading label, the spec §5.4 resolution feed, and the end-to-end performSend
// pipeline (provider resolution → prompt build → agent loop → finalize), plus
// the Apply/Discard handlers that update the resolution feed. Rendering stays
// in AiPanel; nothing here imports a component tree.
//
// The core is a plain ChatSession class — no React, no DOM: the transcript,
// busy flag, loading label, resolution record, id counter and the tracked
// external provider live in plain fields, and every visible change is
// mirrored to the host callbacks — so the whole pipeline can be instantiated
// and unit-tested without mounting the RAC modal (or any component).
// useChatSession is the thin React wrapper: three useState mirrors bound to
// the host plus one ref carrying the per-call environment (settings, tt,
// builtin provider, editor access) so handlers always see the current render's
// closures.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ToolExecutor } from '../../lib/ai/agent';
import { createAgent } from '../../lib/ai/agent';
import type { EditorApi } from '../editor/api';
import type { ChatProvider, ProviderSettings } from '../../lib/ai/types';
import { statusForOutcome } from './ToolActivity';
import type { ToolCallStatus } from './ToolActivity';
import { buildChatMessages } from './chat';
import { applyPendingDiff } from './executor';
import { planApplyDiff, planDiscardDiff } from './diffResolution';
import type { DiffResolutionRecord } from './diffResolution';
import { lineRangeOfOffset } from '../../lib/ai/tool-results';
import type { PendingDiffView } from './pendingDiff';
import type { PreviewExcerptPayload } from './previewExcerpt';
import { loadingLabelFor, planProvider } from './providerResolution';
import type { BuiltinAvailability } from './useBuiltinAi';
import { aiToast } from './toast-queue';
import {
  appendSendPair,
  applyAgentText,
  applyAgentToolResult,
  applyAgentToolStart,
  finalizeRun,
  settleDiff,
} from './chatTranscript';
import type { ChatEntry } from './chatTranscript';

/** A send captured before any await (the prompt + pinned edit target). */
export interface PendingSend {
  question: string;
  docText: string;
  pinnedRange: [number, number] | null;
  /** Preview-selection context attached at send time (consumed on send). */
  excerpt: PreviewExcerptPayload | null;
}

/** Everything the pipeline needs from the panel at call time (impure side). */
export interface ChatSessionEnv {
  /** The active translator (for loading labels + toasts). */
  tt: (key: string) => string;
  /** The live provider settings (read at send time, never captured). */
  getSettings: () => ProviderSettings;
  /** The builtin provider (its `supported` flag + `ensureSession`). */
  builtin: ChatProvider & { supported: boolean; ensureSession(): Promise<unknown> };
  /** Re-checks builtin availability (the failed ensureSession path). */
  refreshBuiltin: () => Promise<BuiltinAvailability>;
  /** Builds the configured external provider (openai/anthropic). */
  createExternal: (settings: ProviderSettings) => ChatProvider;
  /** Builds the agent's hands for one run (direct-edit gating inside). */
  makeExecutor: (directEditOn: boolean) => ToolExecutor;
  /** The frozen editor contract (document reads + diff applies). */
  editor: EditorApi;
  /** The overlay-released write bridge (the RAC modal inert trap). */
  withEditorAccess: <T>(write: () => T) => T;
  /** Clears the composer draft once the send is committed. */
  clearDraft: () => void;
  /** Clears the excerpt chip once the context is part of the message. */
  clearExcerpt: () => void;
}

/** The observable run state the panel renders (mirrored into useState). */
export interface ChatSessionState {
  messages: ChatEntry[];
  busy: boolean;
  loadingLabel: string | null;
}

/** Where visible state changes land (the React mirrors in the hook). */
export interface ChatSessionHost {
  setMessages: (messages: ChatEntry[]) => void;
  setBusy: (busy: boolean) => void;
  setLoadingLabel: (label: string | null) => void;
}

/** Keeps a background promise from surfacing as an unhandled rejection. */
function trap(promise: Promise<unknown>): void {
  promise.catch((err) => console.error('[ai] background task failed', err));
}

/**
 * The framework-free chat session: owns the run state and the send pipeline.
 * One instance per panel lifetime; destroy() frees the tracked external
 * provider (legacy pagehide parity).
 */
export class ChatSession {
  private host: ChatSessionHost;

  private messages: ChatEntry[] = [];

  private busy = false;

  private loadingLabel: string | null = null;

  /** How the previous turn's proposed edit was resolved — fed to the next
   *  prompt so the model never re-proposes a discarded edit (spec §5.4). */
  private resolution: DiffResolutionRecord | null = null;

  private lastExternal: ChatProvider | null = null;

  private nextIdCounter = 1;

  constructor(host: ChatSessionHost) {
    this.host = host;
  }

  /** A synchronous snapshot (tests; the busy guard for event handlers). */
  get state(): ChatSessionState {
    return { messages: this.messages, busy: this.busy, loadingLabel: this.loadingLabel };
  }

  /** Whether a run is in flight (the send-side busy guard). */
  get isBusy(): boolean {
    return this.busy;
  }

  /** Frees the tracked external provider (panel unmount — legacy pagehide). */
  destroy(): void {
    const { lastExternal } = this;
    if (lastExternal?.destroy) trap(Promise.resolve(lastExternal.destroy()));
    this.lastExternal = null;
  }

  private nextId(): number {
    const id = this.nextIdCounter;
    this.nextIdCounter += 1;
    return id;
  }

  /** Applies one transcript patch and mirrors the result to the host. */
  private updateMessages(
    patch: (prev: ChatEntry[]) => ChatEntry[],
  ): void {
    this.messages = patch(this.messages);
    this.host.setMessages(this.messages);
  }

  /** Gate + construct the ACTIVE provider; explains why when refused. */
  private async resolveProvider(env: ChatSessionEnv): Promise<ChatProvider | null> {
    const currentSettings = env.getSettings();
    const plan = planProvider(currentSettings, { supported: env.builtin.supported });
    if (plan.action === 'refuse') {
      aiToast(env.tt(plan.toastKey), 'error');
      return null;
    }
    if (plan.action === 'builtin') {
      // The possibly-long LanguageModel.create() runs under the loading label.
      const session = await env.builtin.ensureSession();
      if (!session) {
        aiToast(env.tt('aiUnavailableExplainer'), 'error');
        trap(env.refreshBuiltin());
        return null;
      }
      return env.builtin;
    }
    const provider = env.createExternal(currentSettings);
    this.lastExternal = provider;
    return provider;
  }

  /** Applies one pending diff (card Apply). Content-anchored diffs re-anchor
   *  on the live document; line-anchored ones refuse when it moved. */
  applyDiff(assistantId: number, diff: PendingDiffView, env: ChatSessionEnv): void {
    const result = applyPendingDiff(env.editor, diff, env.withEditorAccess);
    const outcome = planApplyDiff(diff, result);
    if (outcome.resolution) this.resolution = outcome.resolution;
    aiToast(env.tt(outcome.toastKey), outcome.toastKind);
    this.updateMessages((prev) => settleDiff(
      prev,
      assistantId,
      diff.stepId,
      diff.id,
      outcome.settleStatus,
    ));
  }

  /** Discards one pending diff — reported back on the next send so the model
   *  never re-proposes blindly (spec §5.4). */
  discardDiff(assistantId: number, diff: PendingDiffView, env: ChatSessionEnv): void {
    const outcome = planDiscardDiff(diff);
    this.resolution = outcome.resolution;
    aiToast(env.tt(outcome.toastKey), outcome.toastKind);
    this.updateMessages((prev) => settleDiff(
      prev,
      assistantId,
      diff.stepId,
      diff.id,
      outcome.settleStatus,
    ));
  }

  /** Runs one send end-to-end against the agent loop. A send while a run is
   *  in flight is refused (the abort guard — the panel's handleSend checks
   *  this too via isBusy, so the panel path is unchanged). */
  performSend = async (req: PendingSend, env: ChatSessionEnv): Promise<void> => {
    if (this.busy) return;
    const currentSettings = env.getSettings();
    const readOnly = currentSettings.directEdit !== true;
    this.busy = true;
    this.host.setBusy(true);
    // Visible, labeled loading from NOW until the first streamed event.
    this.loadingLabel = loadingLabelFor(currentSettings, env.tt);
    this.host.setLoadingLabel(this.loadingLabel);
    try {
      const provider = await this.resolveProvider(env);
      if (!provider) return; // reason surfaced; the draft stays in the composer

      env.clearDraft();
      const hasSelection = req.pinnedRange !== null;
      const selected = hasSelection && req.pinnedRange
        ? req.docText.slice(req.pinnedRange[0], req.pinnedRange[1])
        : '';
      const selectionLines = hasSelection && req.pinnedRange
        ? lineRangeOfOffset(req.docText, req.pinnedRange[0], req.pinnedRange[1])
        : null;
      const { resolution } = this;
      this.resolution = null; // it describes exactly the previous turn
      const prompt = buildChatMessages({
        question: req.question,
        hasSelection,
        selected,
        docText: req.docText,
        readOnly,
        excerpt: req.excerpt ?? undefined,
        selectionLines,
        resolution,
      });
      if (req.excerpt) env.clearExcerpt(); // context is now part of the message
      const userId = this.nextId();
      const assistantId = this.nextId();
      this.updateMessages((prev) => appendSendPair(prev, userId, assistantId, req.question));

      const agent = createAgent({
        provider,
        executor: env.makeExecutor(!readOnly),
      });

      let final = '';
      let streamFailed = false;
      try {
        for await (const ev of agent.run(prompt)) {
          if (ev.type === 'text') {
            this.loadingLabel = null; // first event → loading phase over
            this.host.setLoadingLabel(null);
            this.updateMessages((prev) => applyAgentText(prev, assistantId, ev.text));
          } else if (ev.type === 'tool') {
            this.loadingLabel = null;
            this.host.setLoadingLabel(null);
            this.updateMessages((prev) => applyAgentToolStart(prev, assistantId, {
              id: this.nextId(),
              tool: ev.tool,
              status: 'running',
            }));
          } else if (ev.type === 'tool-result') {
            this.loadingLabel = null;
            this.host.setLoadingLabel(null);
            const { outcome } = ev;
            const stepStatus: ToolCallStatus = statusForOutcome(outcome);
            const diff = outcome.status === 'pending'
              ? {
                id: this.nextId(),
                stepId: -1, // settled against the matching running step
                data: outcome.diff,
                docAtProposal: env.editor.getText(),
              }
              : null;
            this.updateMessages((prev) => applyAgentToolResult(prev, {
              assistantId,
              status: stepStatus,
              tool: ev.tool,
              diff,
            }));
          } else {
            final = ev.text;
          }
        }
      } catch (err) {
        // agent.run rethrows only when the stream died before producing
        // anything — the turn must be VISIBLE as a failure, never dropped.
        streamFailed = true;
        console.error('[ai] request failed', err);
      }

      // Finalize; drop an empty tool-free bubble (legacy "Working…" cleanup)
      // — but a failed run always stays, with the error note rendered.
      this.updateMessages((prev) => finalizeRun(prev, assistantId, final, streamFailed));
    } finally {
      this.busy = false;
      this.host.setBusy(false);
      this.loadingLabel = null;
      this.host.setLoadingLabel(null);
    }
  };
}

/** The panel-facing handle: render mirrors + delegated send/diff handling. */
export interface ChatSessionHandle extends ChatSessionState {
  /** Live busy flag for event handlers (never stale across awaits). */
  isBusy: () => boolean;
  performSend: (req: PendingSend) => Promise<void>;
  applyDiff: (assistantId: number, diff: PendingDiffView) => void;
  discardDiff: (assistantId: number, diff: PendingDiffView) => void;
}

/**
 * The thin React wrapper around one ChatSession: three useState mirrors for
 * the render, one ref so every delegated call sees the CURRENT render's
 * environment (settings/tt/builtin/editor closures change every render), and
 * the unmount cleanup that frees the tracked external provider.
 */
export function useChatSession(env: ChatSessionEnv): ChatSessionHandle {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);

  // One session for the hook's lifetime (useState initializer, not a lazily
  // touched ref — refs must not be read during render).
  const [session] = useState(() => new ChatSession({
    setMessages,
    setBusy,
    setLoadingLabel,
  }));

  // The environment closures change every render — keep the ref fresh so
  // delegated calls (performSend/applyDiff/discardDiff) never act on a stale
  // settings object or translator. (Synced in an effect, never during
  // render; React flushes effects before an event handler can run.)
  const envRef = useRef(env);
  useEffect(() => {
    envRef.current = env;
  });

  // Free the in-flight external provider when the panel goes away (legacy
  // pagehide); the builtin session is destroyed by useBuiltinAi's cleanup.
  useEffect(() => () => session.destroy(), [session]);

  return useMemo(() => ({
    messages,
    busy,
    loadingLabel,
    isBusy: () => session.isBusy,
    performSend: (req: PendingSend) => session.performSend(req, envRef.current),
    applyDiff: (assistantId: number, diff: PendingDiffView) => {
      session.applyDiff(assistantId, diff, envRef.current);
    },
    discardDiff: (assistantId: number, diff: PendingDiffView) => {
      session.discardDiff(assistantId, diff, envRef.current);
    },
  }), [messages, busy, loadingLabel, session]);
}
