// Module: features/ai/useChatFlow — the panel's controller hook, layered on
// the useChatSession run-state hook. Owns everything that is NOT rendering:
//   provider settings state (the live settings + the form's draft, Save =
//     normalize + persist + activate + toast, the direct-edit instant toggle)
//   the composer draft (cleared when a send commits, handed back on decline)
//   the consent-gated download flow (the explicit ~4 GB consent requirement:
//     a send while 'downloadable' requeues the message and opens the consent
//     dialog; only the explicit Download press starts it, then the queued
//     message proceeds — "Not now" keeps the draft and shows the explainer)
//   the builtin availability machine (useBuiltinAi) it drives
// The panel renders what this returns; no JSX lives here.

import { useRef, useState } from 'react';
import type { EditorApi } from '../editor/api';
import {
  loadSettings,
  normalizeSettings,
  saveSettings,
} from '../../lib/ai/settings';
import type { ProviderSettings } from '../../lib/ai/types';
import type { ProviderDraft } from './AiSettingsForm';
import { canAttempt as canAttemptProvider } from './providerResolution';
import type { PreviewExcerptPayload } from './previewExcerpt';
import { aiToast } from './toast-queue';
import createExternalProvider from './chat-provider';
import { createToolExecutor } from './executor';
import { useBuiltinAi } from './useBuiltinAi';
import type { BuiltinAi } from './useBuiltinAi';
import { useChatSession } from './useChatSession';
import type { ChatSessionHandle, PendingSend } from './useChatSession';

/** Everything the flow needs from the panel at call time (the UI side). */
export interface ChatFlowEnv {
  /** The active translator (for loading labels + toasts). */
  tt: (key: string) => string;
  /** The frozen editor contract (read document/selection, apply edits). */
  editor: EditorApi;
  /** The overlay-released write bridge (the RAC modal inert trap). */
  withEditorAccess: <T>(write: () => T) => T;
  /** The current preview-selection context, if one is attached. */
  getExcerpt: () => PreviewExcerptPayload | null;
  /** Clears the excerpt chip once the context is part of the message. */
  clearExcerpt: () => void;
  /** Refreshes the selection chip after a send pinned the range. */
  refreshChip: () => void;
}

/** What the panel renders from the controller. */
export interface ChatFlowHandle {
  /** The chat run-state handle (messages, busy, loadingLabel, diffs). */
  chat: ChatSessionHandle;
  /** The builtin availability machine (status area + consent flow). */
  builtin: BuiltinAi;
  /** The composer draft (controller-owned: cleared/handed back on sends). */
  draft: string;
  setDraft: (draft: string) => void;
  /** Live provider settings + the settings form's draft. */
  settings: ProviderSettings;
  settingsDraft: ProviderDraft;
  setSettingsDraft: (draft: ProviderDraft) => void;
  /** Save press: normalize + persist + activate + toast. */
  applyDraft: () => void;
  /** The direct-edit toggle saves immediately (legacy parity). */
  onDirectEditChange: (on: boolean) => void;
  /** Whether the active provider could attempt a send right now. */
  canAttempt: boolean;
  /** Sync send wrapper for the RAC event props (promises never float). */
  send: () => void;
  /** Sync download wrapper for the status-area download button. */
  download: () => void;
  /** The consent dialog state + handlers. */
  consentOpen: boolean;
  consentDeclined: boolean;
  onConsentAccept: () => void;
  onConsentDecline: () => void;
}

/** Keeps a background promise from surfacing as an unhandled rejection. */
function trap(promise: Promise<unknown>): void {
  promise.catch((err) => console.error('[ai] background task failed', err));
}

/** The editable draft view of a settings record (directEdit is not a field). */
function draftOf(s: ProviderSettings): ProviderDraft {
  return {
    provider: s.provider,
    baseUrl: s.baseUrl,
    apiKey: s.apiKey,
    model: s.model,
  };
}

/**
 * One controller per panel lifetime. Builds the chat session's environment
 * (settings, builtin machine, executor, external provider factory) and runs
 * the send flow around it: pin → consent gate → performSend.
 */
export function useChatFlow(env: ChatFlowEnv): ChatFlowHandle {
  const { tt, editor } = env;
  const builtin = useBuiltinAi();

  const [settings, setSettings] = useState<ProviderSettings>(loadSettings);
  const settingsRef = useRef(settings);
  const [settingsDraft, setSettingsDraft] = useState<ProviderDraft>(
    () => draftOf(loadSettings()),
  );
  const [draft, setDraft] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentDeclined, setConsentDeclined] = useState(false);
  const pendingSendRef = useRef<PendingSend | null>(null);

  const updateSettings = (next: ProviderSettings): void => {
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
  };

  const applyDraft = (): void => {
    // directEdit is not a draft field — carry the live state across Save.
    const next = normalizeSettings({
      ...settingsDraft,
      directEdit: settingsRef.current.directEdit === true,
    });
    updateSettings(next);
    setSettingsDraft(draftOf(next));
    aiToast(tt('aiSaved'));
    // Switching to builtin may need this session's first availability check.
    if (next.provider === 'builtin' && builtin.availability === 'checking') {
      trap(builtin.refresh());
    }
  };

  // Toggling the write permission saves immediately (legacy parity).
  const onDirectEditChange = (on: boolean): void => {
    updateSettings(normalizeSettings({ ...settingsRef.current, directEdit: on }));
  };

  /**
   * The agent's hands (v2 toolset, executor.ts): reads always granted; the
   * direct-edit permission gates every write (off ⇒ structured READ_ONLY
   * refusal). Small writes auto-apply through the frozen applyEdit mechanism
   * (one splice = one undo step); larger ones come back as PENDING diffs.
   */
  const makeExecutor = (directEditOn: boolean) => createToolExecutor(editor, {
    directEdit: directEditOn,
    withEditorAccess: env.withEditorAccess,
  });

  // The chat run state (transcript, busy, loading label, §5.4 resolution
  // feed) and the send pipeline live in the useChatSession controller; the
  // flow supplies its environment.
  const chat = useChatSession({
    tt,
    getSettings: () => settingsRef.current,
    builtin: builtin.provider,
    refreshBuiltin: builtin.refresh,
    createExternal: createExternalProvider,
    makeExecutor,
    editor,
    withEditorAccess: env.withEditorAccess,
    clearDraft: () => setDraft(''),
    clearExcerpt: env.clearExcerpt,
  });

  /**
   * The consent-gated download (explicit user activation ONLY). On success
   * the queued message proceeds; on refusal the draft is handed back and the
   * status area is refreshed to reflect reality.
   */
  const startDownloadFlow = async (): Promise<void> => {
    const ok = await builtin.startDownload();
    const req = pendingSendRef.current;
    if (ok) {
      setConsentDeclined(false);
      if (req) {
        pendingSendRef.current = null;
        await chat.performSend(req); // proceed with the message the user sent
      }
    } else {
      trap(builtin.refresh()); // status area reflects reality
      if (req) {
        pendingSendRef.current = null;
        setDraft(req.question); // hand the draft back to the composer
      }
    }
  };

  const handleSend = async (): Promise<void> => {
    const question = draft.trim();
    if (!question || chat.isBusy()) return;
    // Resolve a 'checking' machine state first (its verdict decides consent).
    let { availability } = builtin;
    if (settingsRef.current.provider === 'builtin' && availability === 'checking') {
      availability = await builtin.refresh();
    }
    if (chat.isBusy()) return;

    // Pin the document/selection BEFORE any await: it decides the prompt
    // (whole-document vs selection-aware) and the pinned edit target.
    const docText = editor.getText();
    const { start, end } = editor.getSelection();
    const selected = docText.slice(start, end);
    const hasSelection = selected.trim() !== '';
    const pinnedRange: [number, number] | null = hasSelection ? [start, end] : null;
    const attachedExcerpt = env.getExcerpt();
    env.refreshChip();

    // NEVER auto-download: a send while 'downloadable' opens the consent
    // dialog; the message is requeued and sent after an explicit Download.
    if (settingsRef.current.provider === 'builtin' && availability === 'downloadable') {
      pendingSendRef.current = {
        question, docText, pinnedRange, excerpt: attachedExcerpt,
      };
      setConsentOpen(true);
      return;
    }

    await chat.performSend({
      question, docText, pinnedRange, excerpt: attachedExcerpt,
    });
  };

  // Sync handlers for the RAC event props (promises must not leak as floats).
  const send = (): void => {
    handleSend().catch((err) => console.error('[ai] request failed', err));
  };
  const download = (): void => {
    startDownloadFlow().catch((err) => console.error('[ai] request failed', err));
  };

  const onConsentAccept = (): void => {
    setConsentOpen(false);
    trap(startDownloadFlow());
  };

  const onConsentDecline = (): void => {
    setConsentOpen(false);
    setConsentDeclined(true);
    pendingSendRef.current = null; // the draft never left the composer
  };

  return {
    chat,
    builtin,
    draft,
    setDraft,
    settings,
    settingsDraft,
    setSettingsDraft,
    applyDraft,
    onDirectEditChange,
    canAttempt: canAttemptProvider(settings, builtin.availability),
    send,
    download,
    consentOpen,
    consentDeclined,
    onConsentAccept,
    onConsentDecline,
  };
}
