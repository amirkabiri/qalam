// Unit tests for the chat run-state controller (useChatSession / ChatSession)
// — plain instantiation, no component tree (the controller is framework-free
// by design; one renderHook test pins the React mirror wiring). The env is
// faked at every boundary per TESTING.md: a scripted ChatProvider, a recording
// ToolExecutor, and the recording FakeEditorApi from ai-fakes.
// Coverage: send success, send error, the mid-flight abort guard, retry after
// failure, transcript append + empty-bubble trim, and the §5.4 resolution feed
// (discard + apply) riding on the next send's system prompt.

import { renderHook } from '@testing-library/react';
import { act } from 'react';
import {
  describe, expect, it, vi,
} from 'vitest';
import {
  ChatSession,
  useChatSession,
} from './useChatSession';
import type {
  ChatSessionEnv,
  PendingSend,
} from './useChatSession';
import type { ToolExecutor } from '../../lib/ai/agent';
import type {
  ChatMessage,
  ChatProvider,
  ProviderId,
  ProviderSettings,
} from '../../lib/ai/types';
import { FakeExecutor } from '../../test/agent-fakes';
import { createFakeEditor, makeT } from './ai-fakes';
import type { PendingDiffView } from './pendingDiff';

const tt = makeT('en');
// Assembled at runtime so no credential-shaped literal appears in source.
const TEST_KEY = ['test', '-', 'key'].join('');

function makeSettings(): ProviderSettings {
  return {
    provider: 'openai',
    baseUrl: 'https://api.example.com/v1',
    apiKey: TEST_KEY,
    model: 'gpt-test',
  };
}

interface Deferred {
  resolve: (value: void) => void;
  promise: Promise<void>;
}

function makeDeferred(): Deferred {
  let resolve: (value: void) => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { resolve, promise };
}

/** One scripted stream() turn: fail (throw), hang-then-yield, or yield text. */
type ScriptStep = { fail: true } | { hang: Deferred; text: string } | { text: string };

/** Streams one scripted reply per stream() call, recording every prompt. */
class ScriptedProvider implements ChatProvider {
  readonly id: ProviderId = 'openai';

  calls: ChatMessage[][] = [];

  destroyed = 0;

  private script: ScriptStep[];

  constructor(...steps: ScriptStep[]) {
    this.script = [...steps];
  }

  async* stream(messages: ChatMessage[]): AsyncGenerator<string> {
    this.calls.push(messages.map((m) => ({ ...m })));
    const step = this.script.shift();
    if (!step) return;
    if ('fail' in step) throw new Error('network down');
    if ('hang' in step) await step.hang.promise; // hold the stream mid-flight
    const pieces = step.text.match(/[\s\S]{1,6}/g) ?? [];
    for (const piece of pieces) yield piece;
  }

  destroy(): void {
    this.destroyed += 1;
  }
}

function makeHost() {
  return {
    setMessages: vi.fn(),
    setBusy: vi.fn(),
    setLoadingLabel: vi.fn(),
  };
}

/** A builtin stub (external-provider sends never consult it). */
function makeBuiltinStub() {
  return {
    id: 'builtin' as const,
    supported: true,
    ensureSession: async () => null,
    stream: async function* stream(): AsyncGenerator<string> {
      // External-provider sends never consult the builtin backend.
    },
  };
}

function makeEnv(provider: ChatProvider, overrides: Partial<ChatSessionEnv> = {}): ChatSessionEnv {
  const settings = makeSettings();
  return {
    tt,
    getSettings: () => settings,
    builtin: makeBuiltinStub(),
    refreshBuiltin: async () => 'available',
    createExternal: () => provider,
    makeExecutor: (): ToolExecutor => new FakeExecutor(),
    editor: createFakeEditor('# Doc'),
    withEditorAccess: (write) => write(),
    clearDraft: vi.fn(),
    clearExcerpt: vi.fn(),
    ...overrides,
  };
}

function makeSend(question: string): PendingSend {
  return {
    question, docText: '# Doc', pinnedRange: null, excerpt: null,
  };
}

/** A replace_text diff proposal anchored on the whole '# Doc' heading. */
function makeDiff(id = 5): PendingDiffView {
  return {
    id,
    stepId: 7,
    status: 'pending',
    data: {
      tool: 'replace_text',
      startLine: 1,
      endLine: 1,
      startOffset: 0,
      endOffset: 5,
      removedText: '# Doc',
      addedText: '# New Doc',
    },
    docAtProposal: '# Doc',
  };
}

describe('ChatSession — send success', () => {
  it('streams the reply into the transcript and releases busy', async () => {
    const provider = new ScriptedProvider({ text: 'Hello there' });
    const session = new ChatSession(makeHost());
    const env = makeEnv(provider);

    await session.performSend(makeSend('hi'), env);

    const { messages } = session.state;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', text: 'hi', pending: false });
    expect(messages[1]).toMatchObject({ role: 'assistant', text: 'Hello there', pending: false });
    expect(messages[1].failed).toBeUndefined();
    expect(session.isBusy).toBe(false);
    expect(session.state.loadingLabel).toBeNull();
    expect(env.clearDraft).toHaveBeenCalledTimes(1);
    // The prompt reached the provider as a system + user message pair.
    expect(provider.calls[0]).toHaveLength(2);
    expect(provider.calls[0][0].role).toBe('system');
    expect(provider.calls[0][1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('shows the labeled loading state until the first streamed event', async () => {
    const gate = makeDeferred();
    const provider = new ScriptedProvider({ hang: gate, text: 'late reply' });
    const session = new ChatSession(makeHost());
    const env = makeEnv(provider);

    const run = session.performSend(makeSend('hi'), env);
    expect(session.isBusy).toBe(true);
    expect(session.state.loadingLabel).toBe(tt('aiConnectingOpenai'));

    gate.resolve();
    await run;

    expect(session.isBusy).toBe(false);
    expect(session.state.loadingLabel).toBeNull();
    expect(session.state.messages[1]?.text).toBe('late reply');
  });
});

describe('ChatSession — send error', () => {
  it('keeps the failed turn visible and releases busy', async () => {
    const provider = new ScriptedProvider({ fail: true });
    const session = new ChatSession(makeHost());
    const env = makeEnv(provider);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await session.performSend(makeSend('hello'), env);

    const { messages } = session.state;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ role: 'assistant', failed: true, pending: false });
    expect(session.isBusy).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('ChatSession — mid-flight abort guard', () => {
  it('refuses a second send while a run is in flight', async () => {
    const gate = makeDeferred();
    const provider = new ScriptedProvider({ hang: gate, text: 'first answer' });
    const session = new ChatSession(makeHost());
    const env = makeEnv(provider);

    const first = session.performSend(makeSend('first'), env);
    await session.performSend(makeSend('second'), env); // refused immediately

    // Only the first send's pair exists — the refused send appended nothing.
    expect(session.state.messages).toHaveLength(2);
    gate.resolve();
    await first;

    expect(session.state.messages.map((m) => m.text)).toEqual(['first', 'first answer']);
    expect(session.isBusy).toBe(false);
  });
});

describe('ChatSession — retry after failure', () => {
  it('appends a fresh pair and succeeds on the next send', async () => {
    const provider = new ScriptedProvider({ fail: true }, { text: 'recovered' });
    const session = new ChatSession(makeHost());
    const env = makeEnv(provider);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await session.performSend(makeSend('hello'), env);
    expect(session.isBusy).toBe(false);
    await session.performSend(makeSend('hello again'), env);
    errorSpy.mockRestore();

    const { messages } = session.state;
    expect(messages).toHaveLength(4);
    expect(messages[1]).toMatchObject({ failed: true });
    expect(messages[3]).toMatchObject({ role: 'assistant', text: 'recovered' });
    expect(messages[3].failed).toBeUndefined();
  });
});

describe('ChatSession — transcript append + trim', () => {
  it('drops an empty tool-free assistant bubble (legacy "Working…" cleanup)', async () => {
    const provider = new ScriptedProvider({ text: '' });
    const session = new ChatSession(makeHost());

    await session.performSend(makeSend('hi'), makeEnv(provider));

    expect(session.state.messages).toHaveLength(1);
    expect(session.state.messages[0]).toMatchObject({ role: 'user', text: 'hi' });
  });
});

describe('ChatSession — the §5.4 resolution feed', () => {
  it('feeds a discard back on the next send, once', async () => {
    const provider = new ScriptedProvider({ text: 'ok' }, { text: 'ok' });
    const session = new ChatSession(makeHost());
    const env = makeEnv(provider);

    session.discardDiff(999, makeDiff(), env);
    await session.performSend(makeSend('different approach'), env);

    const system = provider.calls[0][0].content;
    expect(system).toContain('DISCARDED by the user');
    expect(system).toContain('replace_text');

    // The record describes exactly one turn — the next send is clean.
    await session.performSend(makeSend('thanks'), env);
    expect(provider.calls[1][0].content).not.toContain('Note:');
  });

  it('feeds an apply back on the next send (and lands the edit)', async () => {
    const provider = new ScriptedProvider({ text: 'ok' });
    const session = new ChatSession(makeHost());
    const editor = createFakeEditor('# Doc');
    const env = makeEnv(provider, { editor });

    session.applyDiff(999, makeDiff(), env);
    expect(editor.doc).toBe('# New Doc'); // applied through the editor

    await session.performSend(makeSend('nice'), env);
    expect(provider.calls[0][0].content).toContain('was APPLIED to the document');
  });
});

describe('ChatSession — external provider tracking', () => {
  it('destroys the tracked external provider on destroy()', async () => {
    const provider = new ScriptedProvider({ text: 'hi' });
    const session = new ChatSession(makeHost());

    await session.performSend(makeSend('hi'), makeEnv(provider));
    session.destroy();

    expect(provider.destroyed).toBe(1);
  });
});

describe('useChatSession — the React mirror', () => {
  it('mirrors transcript/busy/loading state and delegates sends', async () => {
    const gate = makeDeferred();
    const provider = new ScriptedProvider({ hang: gate, text: 'mirrored reply' });
    const { result } = renderHook(() => useChatSession(makeEnv(provider)));

    expect(result.current.messages).toEqual([]);
    let run: Promise<void> = Promise.resolve();
    act(() => {
      run = result.current.performSend(makeSend('hello'));
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.loadingLabel).toBe(tt('aiConnectingOpenai'));

    await act(async () => {
      gate.resolve();
      await run;
    });

    expect(result.current.busy).toBe(false);
    expect(result.current.loadingLabel).toBeNull();
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]?.text).toBe('mirrored reply');
    expect(result.current.isBusy()).toBe(false);
  });
});
