// Module: features/ai/diffResolution — the PURE pending-diff resolution
// decisions extracted from AiPanel (spec §5.4): what an Apply or Discard
// press MEANS, decided in one place. Every path (apply / conflict / discard)
// returns the same plain outcome — the resolution record fed to the next
// prompt, the toast, and the card's settle status — so the panel keeps only
// the wiring (the live apply attempt, setMessages, aiToast). No React, no
// DOM, no editor.

import type { ApplyDiffResult } from './executor';
import type { PendingDiffView } from './pendingDiff';

/** How the previous turn's proposed edit was resolved — fed to the next
 *  prompt so the model never re-proposes a discarded edit (spec §5.4). */
export interface DiffResolutionRecord {
  tool: string;
  resolution: 'applied' | 'discarded';
}

/** Everything the panel must do after one Apply/Discard press. */
export interface DiffResolutionOutcome {
  /** The spec §5.4 record to store, or null when the resolution must NOT
   *  overwrite the pending one (the conflict path reports, but does not
   *  claim, an outcome for the next prompt). */
  resolution: DiffResolutionRecord | null;
  toastKey: string;
  toastKind: 'info' | 'error';
  /** The card's settle status (settleDiff's final argument). */
  settleStatus: 'applied' | 'discarded' | 'error';
}

/**
 * One Apply press: applied edits record 'applied' and settle the card as
 * applied; a conflict (the document moved too far for a safe re-anchor —
 * the executor's `changed` verdict) toasts the error, settles the card as
 * errored, and leaves the resolution record untouched.
 */
export function planApplyDiff(
  diff: PendingDiffView,
  result: ApplyDiffResult,
): DiffResolutionOutcome {
  if (result.applied) {
    return {
      resolution: { tool: diff.data.tool, resolution: 'applied' },
      toastKey: 'aiToolApplied',
      toastKind: 'info',
      settleStatus: 'applied',
    };
  }
  return {
    resolution: null,
    toastKey: 'aiDiffChanged',
    toastKind: 'error',
    settleStatus: 'error',
  };
}

/**
 * One Discard press: the proposal is recorded as 'discarded' (so the next
 * prompt knows) and the card settles as discarded.
 */
export function planDiscardDiff(diff: PendingDiffView): DiffResolutionOutcome {
  return {
    resolution: { tool: diff.data.tool, resolution: 'discarded' },
    toastKey: 'aiToolDiscarded',
    toastKind: 'info',
    settleStatus: 'discarded',
  };
}
