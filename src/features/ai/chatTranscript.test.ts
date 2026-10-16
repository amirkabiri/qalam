// Unit tests for src/features/ai/chatTranscript.ts — the pure chat-run state
// transitions extracted from AiPanel. Node project (no DOM): the pipeline is
// (prev, …) ⇒ next over plain arrays, so every rule the panel's event loop
// used to implement inline is pinned here without mounting the component.
import { describe, expect, it } from 'vitest';

import {
  appendSendPair,
  applyAgentText,
  applyAgentToolResult,
  applyAgentToolStart,
  finalizeRun,
  settleDiff,
} from './chatTranscript';
import type { ChatEntry } from './chatTranscript';

let nextId = 1;
const id = (): number => {
  const current = nextId;
  nextId += 1;
  return current;
};

function userBubble(text: string): ChatEntry {
  return {
    id: id(), role: 'user', text, tools: [], diffs: [], pending: false,
  };
}

function assistantBubble(): ChatEntry {
  return {
    id: id(), role: 'assistant', text: '', tools: [], diffs: [], pending: true,
  };
}

const TOOL_RESULT_DIFF = {
  tool: 'replace_text',
  startLine: 1,
  endLine: 2,
  startOffset: 0,
  endOffset: 5,
  removedText: 'hello',
  addedText: 'hi',
};

describe('appendSendPair', () => {
  it('appends the user bubble and the pending assistant bubble, existing entries untouched', () => {
    const prev = [userBubble('earlier'), assistantBubble()];
    nextId = 100;

    const next = appendSendPair(prev, 100, 101, 'new question');

    expect(next).toHaveLength(4);
    expect(next[0]).toBe(prev[0]); // pass-through, not cloned
    expect(next[2]).toEqual({
      id: 100, role: 'user', text: 'new question', tools: [], diffs: [], pending: false,
    });
    expect(next[3]).toEqual({
      id: 101, role: 'assistant', text: '', tools: [], diffs: [], pending: true,
    });
  });
});

describe('applyAgentText', () => {
  it('replaces only the assistant bubble text', () => {
    const assistant = assistantBubble();
    const next = applyAgentText([assistant], assistant.id, 'partial answer');

    expect(next[0].text).toBe('partial answer');
    expect(next[0].pending).toBe(true);
  });
});

describe('applyAgentToolStart / applyAgentToolResult', () => {
  it('adds a running step and settles the most recent matching one', () => {
    const assistant = assistantBubble();
    let transcript = applyAgentToolStart([assistant], assistant.id, {
      id: 7, tool: 'read_document', status: 'running',
    });
    // A second (stale) running read followed by a settle — the LAST match wins.
    transcript = applyAgentToolStart(transcript, assistant.id, {
      id: 8, tool: 'read_document', status: 'running',
    });

    const settled = applyAgentToolResult(transcript, {
      assistantId: assistant.id,
      status: 'applied',
      tool: 'read_document',
      diff: null,
    });

    expect(settled[0].tools.map((step) => step.status)).toEqual(['running', 'applied']);
  });

  it('appends a pending diff card wired to the settled step', () => {
    const assistant = assistantBubble();
    let transcript = applyAgentToolStart([assistant], assistant.id, {
      id: 7, tool: 'replace_text', status: 'running',
    });

    transcript = applyAgentToolResult(transcript, {
      assistantId: assistant.id,
      status: 'applied',
      tool: 'replace_text',
      diff: {
        id: 9, stepId: -1, data: TOOL_RESULT_DIFF, docAtProposal: 'hello world',
      },
    });

    expect(transcript[0].diffs).toHaveLength(1);
    expect(transcript[0].diffs[0]).toMatchObject({
      id: 9, stepId: 7, status: 'pending', docAtProposal: 'hello world',
    });
  });

  it('keeps the diff off when the outcome is not pending', () => {
    const assistant = assistantBubble();
    let transcript = applyAgentToolStart([assistant], assistant.id, {
      id: 7, tool: 'replace_text', status: 'running',
    });

    transcript = applyAgentToolResult(transcript, {
      assistantId: assistant.id,
      status: 'refused',
      tool: 'replace_text',
      diff: null,
    });

    expect(transcript[0].diffs).toHaveLength(0);
    expect(transcript[0].tools[0].status).toBe('refused');
  });
});

describe('finalizeRun', () => {
  it('lands the final text and drops an empty tool-free bubble', () => {
    const assistant = assistantBubble();

    const dropped = finalizeRun([assistant], assistant.id, '', false);
    expect(dropped).toEqual([]);

    const kept = finalizeRun([assistant], assistant.id, 'done', false);
    expect(kept).toEqual([
      { ...assistant, text: 'done', pending: false },
    ]);
  });

  it('never drops a FAILED run — it stays flagged for the error note', () => {
    const assistant = assistantBubble();
    const next = finalizeRun([assistant], assistant.id, '', true);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ pending: false, failed: true, text: '' });
  });

  it('keeps a successful run that produced only tool activity', () => {
    const assistant: ChatEntry = {
      ...assistantBubble(),
      tools: [{ id: 1, tool: 'read_document', status: 'applied' }],
    };
    const next = finalizeRun([assistant], assistant.id, '', false);

    expect(next).toHaveLength(1);
    expect(next[0].pending).toBe(false);
  });
});

describe('settleDiff', () => {
  it('moves the card and its tool step to the new status together', () => {
    const entry: ChatEntry = {
      ...assistantBubble(),
      tools: [{ id: 7, tool: 'replace_text', status: 'applied' }],
      diffs: [{
        id: 9,
        stepId: 7,
        status: 'pending',
        docAtProposal: 'x',
        data: TOOL_RESULT_DIFF,
      }],
    };

    const discarded = settleDiff([entry], entry.id, 7, 9, 'discarded');
    expect(discarded[0].tools[0].status).toBe('discarded');
    expect(discarded[0].diffs[0].status).toBe('discarded');

    const applied = settleDiff([entry], entry.id, 7, 9, 'applied');
    expect(applied[0].diffs[0].status).toBe('applied');
  });
});
