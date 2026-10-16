// Unit tests for src/features/ai/diffResolution.ts — the pure pending-diff
// resolution decisions extracted from AiPanel (spec §5.4). Node project (no
// DOM): one test per path the card's Apply/Discard presses can take — apply,
// conflict (the document moved), discard.
import { describe, expect, it } from 'vitest';

import { planApplyDiff, planDiscardDiff } from './diffResolution';
import type { PendingDiffView } from './pendingDiff';
import type { ApplyDiffResult } from './executor';

function diffView(overrides: Partial<PendingDiffView> = {}): PendingDiffView {
  return {
    id: 7,
    stepId: 3,
    status: 'pending',
    data: {
      tool: 'replace_text',
      startLine: 2,
      endLine: 4,
      startOffset: 10,
      endOffset: 42,
      removedText: 'old text\n',
      addedText: 'new text\n',
    },
    docAtProposal: 'the document as proposed',
    ...overrides,
  };
}

describe('planApplyDiff — applied', () => {
  it('records applied, toasts aiToolApplied, settles the card as applied', () => {
    const outcome = planApplyDiff(
      diffView({
        data: {
          tool: 'replace_range',
          startLine: 1,
          endLine: 9,
          startOffset: 0,
          endOffset: 80,
          removedText: 'whole\nrange\n',
          addedText: 'replaced\n',
        },
      }),
      { applied: true },
    );

    expect(outcome).toEqual({
      resolution: { tool: 'replace_range', resolution: 'applied' },
      toastKey: 'aiToolApplied',
      toastKind: 'info',
      settleStatus: 'applied',
    });
  });
});

describe('planApplyDiff — conflict', () => {
  it('toasts aiDiffChanged as an error, settles the card as errored, and does NOT touch the resolution record', () => {
    const result: ApplyDiffResult = { applied: false, reason: 'changed' };

    const outcome = planApplyDiff(diffView(), result);

    expect(outcome).toEqual({
      resolution: null,
      toastKey: 'aiDiffChanged',
      toastKind: 'error',
      settleStatus: 'error',
    });
  });
});

describe('planDiscardDiff', () => {
  it('records discarded, toasts aiToolDiscarded, settles the card as discarded', () => {
    const outcome = planDiscardDiff(diffView());

    expect(outcome).toEqual({
      resolution: { tool: 'replace_text', resolution: 'discarded' },
      toastKey: 'aiToolDiscarded',
      toastKind: 'info',
      settleStatus: 'discarded',
    });
  });
});
