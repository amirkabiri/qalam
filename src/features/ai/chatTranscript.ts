// Module: features/ai/chatTranscript — the PURE chat-run state transitions
// extracted from AiPanel (the panel is an 800-line component whose riskiest
// logic was the agent event loop wired straight into setMessages callbacks).
// Every function here is (prev, …) ⇒ next over the transcript array — no
// React, no DOM, no provider — so the run pipeline is unit-testable in node
// and AiPanel keeps only wiring + rendering. The panel owns ids (its counter)
// and passes docAtProposal (the live editor text) in.

import type { PendingDiffStatus, PendingDiffView } from './pendingDiff';
import type { ToolCallStatus, ToolCallView } from './ToolActivity';
import type { PendingDiffData } from '../../lib/ai/tool-results';

export interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolCallView[];
  diffs: PendingDiffView[];
  pending: boolean;
  /** The run died before/without a reply — the bubble shows the failure. */
  failed?: boolean;
}

/** Patch one entry (by id); other entries pass through untouched. */
function patchEntry(
  prev: ChatEntry[],
  id: number,
  patch: (entry: ChatEntry) => ChatEntry,
): ChatEntry[] {
  return prev.map((entry) => (entry.id === id ? patch(entry) : entry));
}

/** A send appends the user's bubble and the pending assistant bubble. */
export function appendSendPair(
  prev: ChatEntry[],
  userId: number,
  assistantId: number,
  question: string,
): ChatEntry[] {
  return [
    ...prev,
    {
      id: userId,
      role: 'user',
      text: question,
      tools: [],
      diffs: [],
      pending: false,
    },
    {
      id: assistantId,
      role: 'assistant',
      text: '',
      tools: [],
      diffs: [],
      pending: true,
    },
  ];
}

/** A streamed text snapshot replaces the assistant bubble's text. */
export function applyAgentText(
  prev: ChatEntry[],
  assistantId: number,
  text: string,
): ChatEntry[] {
  return patchEntry(prev, assistantId, (entry) => ({ ...entry, text }));
}

/** A tool call starts: a `running` step joins the assistant's tool list. */
export function applyAgentToolStart(
  prev: ChatEntry[],
  assistantId: number,
  step: ToolCallView,
): ChatEntry[] {
  return patchEntry(prev, assistantId, (entry) => ({
    ...entry,
    tools: [...entry.tools, step],
  }));
}

export interface ToolResultPatchInput {
  assistantId: number;
  /** The outcome status as the UI labels it (applied/refused/error/…). */
  status: ToolCallStatus;
  tool: string;
  /**
   * When the outcome is a pending diff, everything needed for the card —
   * settled step id, diff data, and the document as captured at proposal.
   * Null for non-pending outcomes.
   */
  diff: {
    id: number;
    stepId: number;
    data: PendingDiffData;
    docAtProposal: string;
  } | null;
}

/**
 * A tool result settles the MOST RECENT running step of the same tool
 * (the loop is sequential, so the last match is always the one) and, for
 * pending write outcomes, appends the diff card.
 */
export function applyAgentToolResult(
  prev: ChatEntry[],
  input: ToolResultPatchInput,
): ChatEntry[] {
  return patchEntry(prev, input.assistantId, (entry) => {
    const tools = [...entry.tools];
    let settledId = -1;
    for (let i = tools.length - 1; i >= 0; i -= 1) {
      const step = tools[i];
      if (step.status === 'running' && step.tool === input.tool) {
        tools[i] = { ...step, status: input.status };
        settledId = step.id;
        break;
      }
    }
    const diffs = input.diff !== null && settledId >= 0
      ? [...entry.diffs, {
        id: input.diff.id,
        stepId: settledId,
        status: 'pending' as PendingDiffStatus,
        data: input.diff.data,
        docAtProposal: input.diff.docAtProposal,
      }]
      : entry.diffs;
    return { ...entry, tools, diffs };
  });
}

/**
 * Run finished: the bubble's final text lands, pending flips off — and a
 * failed run STAYS (with the error flag) even when nothing was produced.
 * An empty tool-free bubble from a successful run is dropped (the legacy
 * "Working…" cleanup).
 */
export function finalizeRun(
  prev: ChatEntry[],
  assistantId: number,
  final: string,
  streamFailed: boolean,
): ChatEntry[] {
  const target = prev.find((entry) => entry.id === assistantId);
  const finished = patchEntry(prev, assistantId, (entry) => (streamFailed
    ? {
      ...entry, text: final, pending: false, failed: true,
    }
    : { ...entry, text: final, pending: false }));
  const empty = !streamFailed && final === '' && (target?.tools.length ?? 0) === 0;
  return empty ? finished.filter((entry) => entry.id !== assistantId) : finished;
}

/** A diff card was applied/discarded: card status + its tool step follow. */
export function settleDiff(
  prev: ChatEntry[],
  assistantId: number,
  stepId: number,
  diffId: number,
  status: 'applied' | 'discarded' | 'error',
): ChatEntry[] {
  return patchEntry(prev, assistantId, (entry) => ({
    ...entry,
    tools: entry.tools.map((step) => (step.id === stepId
      ? { ...step, status }
      : step)),
    diffs: entry.diffs.map((diff) => (diff.id === diffId
      ? { ...diff, status }
      : diff)),
  }));
}
