// Module: features/ai/AiPanel — the AI co-author panel (React port of
// legacy/src/ai/index.ts, on React Aria Components + the ported src/lib/ai
// modules). Self-contained: props are exactly { editor, t, lang } (the frozen
// wave-2 contract) — no app-context dependencies. Behavior parity with legacy:
//
//   provider settings (disclosure: provider select, base URL, token, model,
//     Save → persistence + validation + status line + toast feedback)
//   builtin availability state machine (checking / unavailable / downloadable
//     / downloading / available) + honest no-network-calls explainer
//   direct-edit toggle = the agent's write permission (off → read-only prompt,
//     edits refused, agent suggests text in chat)
//   selection-aware chat (chip; selection + document pinned at send time;
//     replace-selection pinned to the captured range)
//   plain-text bubbles (textContent semantics, never dangerouslySetInnerHTML),
//     Esc closes, busy disables send, close destroys the builtin session
//
// One deliberate exception to "no app dependencies": the Esc topmost-layer
// rule imports the pure probe isForeignLayerOpen from app/shortcuts (no
// React, no context) so the panel never closes out from under a RAC layer.
//
// Plus the three stakeholder UX requirements:
//   1. first-send loading feedback — labeled spinner state from send until the
//      first streamed event ("Starting the on-device model…" for builtin
//      LanguageModel.create(), "Connecting to <provider>…" for external SSE);
//      input/send disabled while loading; the assistant bubble shows the
//      loading affordance; "Working…" afterwards, like legacy.
//   2. explicit ~4 GB download consent — a 'downloadable' availability NEVER
//      auto-downloads; trying to use the model opens the consent AlertDialog;
//      only the explicit Download press starts it (progress live), "Not now"
//      keeps the draft and shows the honest explainer.
//   3. visible tool calls — every agent tool event renders as a compact
//      muted entry in the message (tool, edit-mode label, running → OK /
//      refused) that STAYS in the chat audit trail.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Button,
  Dialog,
  Heading,
  I18nProvider,
  Modal,
  ModalOverlay,
  ProgressBar,
  TextArea,
} from 'react-aria-components';
import { isForeignLayerOpen } from '../../app/shortcuts';
import {
  isExternalReady,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from '../../lib/ai/settings';
import type { ProviderSettings } from '../../lib/ai/types';
import type { EditorApi } from '../editor/api';
import type { Lang } from '../../i18n';
import createExternalProvider from './chat-provider';
import ConsentDialog from './ConsentDialog';
import AiSettingsForm from './AiSettingsForm';
import type { ProviderDraft } from './AiSettingsForm';
import ToolActivity from './ToolActivity';
import PendingDiffCard from './PendingDiffCard';
import { createToolExecutor } from './executor';
import { canAttempt as canAttemptProvider } from './providerResolution';
import type { ChatEntry } from './chatTranscript';
import { aiToast } from './toast-queue';
import { previewExcerptQueue } from './previewExcerpt';
import type { PreviewExcerptPayload } from './previewExcerpt';
import { useBuiltinAi } from './useBuiltinAi';
import type { BuiltinAi } from './useBuiltinAi';
import { useChatSession } from './useChatSession';
import type { PendingSend } from './useChatSession';
import styles from './AiPanel.module.css';

export interface AiPanelProps {
  /** The frozen editor contract (read document/selection, apply edits). */
  editor: EditorApi;
  /** App translator (already bound to the active language). */
  t: (key: string) => string;
  /** Active UI language — drives the kit's RTL direction and local digits. */
  lang: Lang;
}

interface SelectionChipState {
  active: boolean;
  length: number;
}

/** The chip's localized source hint ("lines 3–3 · Guide › Details"). */
function excerptSourceLine(
  excerpt: PreviewExcerptPayload,
  tt: (key: string) => string,
  lang: Lang,
): string {
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  const parts: string[] = [];
  if (excerpt.sourceRange) {
    parts.push(
      `${tt('aiExcerptLines')} ${excerpt.sourceRange.startLine.toLocaleString(locale)}–${excerpt.sourceRange.endLine.toLocaleString(locale)}`,
    );
  }
  if (excerpt.headingPath.length > 0) parts.push(excerpt.headingPath.join(' › '));
  return parts.join(' · ');
}

/** The selection chip reflects what a send would target right now. */
function readChip(editor: EditorApi): SelectionChipState {
  const { start, end } = editor.getSelection();
  const length = Math.max(0, end - start);
  return { active: editor.getText().slice(start, end).trim() !== '', length };
}

/** Keeps a background promise from surfacing as an unhandled rejection. */
function trap(promise: Promise<unknown>): void {
  promise.catch((err) => console.error('[ai] background task failed', err));
}

/**
 * The status area above the messages: the external readiness line, or the
 * builtin availability machine (checking / unavailable / downloadable /
 * downloading / available).
 */
interface StatusAreaProps {
  settings: ProviderSettings;
  builtin: BuiltinAi;
  consentDeclined: boolean;
  tt: (key: string) => string;
  onDownload: () => void;
}

function StatusArea({
  settings,
  builtin,
  consentDeclined,
  tt,
  onDownload,
}: StatusAreaProps) {
  if (settings.provider !== 'builtin') {
    const ready = isExternalReady(settings);
    return (
      <p className={ready ? `${styles.statusNote} ${styles.statusOk}` : styles.statusNote}>
        {ready ? tt('aiReady') : tt('aiSettingsIncomplete')}
      </p>
    );
  }
  const percent = builtin.downloadPercent;
  if (builtin.availability === 'checking') {
    return <p className={styles.statusNote}>{tt('aiChecking')}</p>;
  }
  if (builtin.availability === 'unavailable') {
    return <p className={styles.statusNote}>{tt('aiUnavailableExplainer')}</p>;
  }
  if (builtin.availability === 'downloading') {
    return (
      <>
        <p className={styles.statusNote}>
          {tt('aiDownloadProgress')}
          {percent >= 0 ? ` ${percent}%` : ''}
        </p>
        <ProgressBar
          aria-label={tt('aiDownloadProgress')}
          minValue={0}
          maxValue={100}
          value={percent >= 0 ? percent : undefined}
          className={styles.progressBar}
        >
          <div className={styles.bar}>
            <div
              className={percent >= 0 ? styles.barFill : `${styles.barFill} ${styles.barIndet}`}
              style={percent >= 0 ? { width: `${percent}%` } : undefined}
            />
          </div>
        </ProgressBar>
      </>
    );
  }
  if (builtin.availability === 'downloadable') {
    return (
      <>
        {consentDeclined && <p className={styles.statusNote}>{tt('aiUnavailableExplainer')}</p>}
        <Button onPress={onDownload} className={styles.downloadButton}>
          {tt('aiDownloadModel')}
        </Button>
      </>
    );
  }
  return null; // 'available' — nothing to explain
}

/** The body of one chat bubble (user/assistant text or the pending affordance). */
interface MessageBodyProps {
  entry: ChatEntry;
  showLoading: boolean;
  loadingLabel: string | null;
  tt: (key: string) => string;
}

function MessageBody({
  entry,
  showLoading,
  loadingLabel,
  tt,
}: MessageBodyProps) {
  if (entry.role === 'assistant' && entry.pending && entry.text === '') {
    return (
      <div className={styles.pending}>
        <span className={styles.spinner} aria-hidden="true" />
        <span>{showLoading ? loadingLabel : tt('aiWorking')}</span>
      </div>
    );
  }
  if (entry.text !== '' || entry.failed) {
    return (
      <>
        {entry.text !== '' && <div className={styles.msgText}>{entry.text}</div>}
        {entry.failed && (
          <div className={`${styles.msgText} ${styles.msgError}`} role="alert">
            {tt('aiRequestFailed')}
          </div>
        )}
      </>
    );
  }
  return null;
}

/**
 * The AI co-author panel: a sliding side sheet (inline-end, overlaying the
 * workspace) rendered through React Aria's modal primitives.
 */
export default function AiPanel({ editor, t, lang }: AiPanelProps) {
  // All labels now live in the global dictionaries (promoted from the former
  // feature-local labels.ts) — the injected translator covers every key.
  const tt = t;

  const [open, setOpen] = useState(true);
  const [settings, setSettings] = useState<ProviderSettings>(loadSettings);
  const settingsRef = useRef(settings);
  // The settings form's draft (lifted here so the form stays a controlled,
  // effect-free component); Save normalizes + persists + activates it.
  const [settingsDraft, setSettingsDraft] = useState<ProviderDraft>(() => {
    const initial = loadSettings();
    return {
      provider: initial.provider,
      baseUrl: initial.baseUrl,
      apiKey: initial.apiKey,
      model: initial.model,
    };
  });
  const [draft, setDraft] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentDeclined, setConsentDeclined] = useState(false);
  const pendingSendRef = useRef<PendingSend | null>(null);

  const builtin = useBuiltinAi();

  // Own overlay element — the Escape handler measures foreign layers against
  // it (the panel's OWN dialog must not count as "a layer above me").
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [chip, setChip] = useState<SelectionChipState>(() => readChip(editor));
  const refreshChip = useCallback(() => setChip(readChip(editor)), [editor]);

  /* Preview-selection context (the "Ask AI about this" handoff): adopted on
     mount (the payload may have been published before the panel existed) and
     on every publication while alive. Adopting re-opens the panel — a user
     who selected text in the preview asked for THIS panel next. */
  const [excerpt, setExcerpt] = useState<PreviewExcerptPayload | null>(null);
  useEffect(() => {
    const adopt = (payload: PreviewExcerptPayload): void => {
      previewExcerptQueue.consume();
      setExcerpt(payload);
      setOpen(true);
    };
    const unsubscribe = previewExcerptQueue.subscribe(adopt);
    const waiting = previewExcerptQueue.current;
    if (waiting) adopt(waiting);
    return unsubscribe;
  }, []);

  // New context arrives → the user's next step is typing the prompt.
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (excerpt) composerRef.current?.focus();
  }, [excerpt]);

  // Esc closes the panel — a document-level CAPTURE listener, exactly like
  // legacy (bubble-phase events from inside the RAC portal are delegated at
  // React's root and never reach a document bubble listener; capture runs
  // first). Topmost-layer rule: while any React Aria layer OUTSIDE this
  // panel is open (the consent dialog, the Open dialog, menus…), THAT layer
  // owns the escape hatch — the panel never closes out from under it.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const overlay = overlayRef.current;
      if (overlay && isForeignLayerOpen(overlay)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  // Auto-scroll the message list to the newest content.
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const updateSettings = (next: ProviderSettings): void => {
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
  };

  const applySettingsDraft = (): void => {
    // directEdit is not a draft field — carry the live state across Save.
    const next = normalizeSettings({
      ...settingsDraft,
      directEdit: settingsRef.current.directEdit === true,
    });
    updateSettings(next);
    setSettingsDraft({
      provider: next.provider,
      baseUrl: next.baseUrl,
      apiKey: next.apiKey,
      model: next.model,
    });
    aiToast(t('aiSaved'));
    // Switching to builtin may need this session's first availability check.
    if (next.provider === 'builtin' && builtin.availability === 'checking') {
      trap(builtin.refresh());
    }
  };

  // Toggling the write permission saves immediately (legacy parity).
  const handleDirectEditChange = (on: boolean): void => {
    updateSettings(normalizeSettings({ ...settingsRef.current, directEdit: on }));
  };

  /**
   * Runs an editor write with the panel overlay released: the React Aria
   * modal marks outside content inert, so the frozen applyEdit's
   * focus()+execCommand path silently no-ops while reporting success. The
   * overlay unmounts and remounts within ONE task (two flushSync commits,
   * no paint in between) — the write lands with real focus, one undo step.
   */
  const withEditorAccess = useCallback(<T,>(write: () => T): T => {
    flushSync(() => setOpen(false));
    try {
      return write();
    } finally {
      flushSync(() => setOpen(true));
    }
  }, []);

  /**
   * The agent's hands (v2 toolset, executor.ts): reads always granted; the
   * direct-edit permission gates every write (off ⇒ structured READ_ONLY
   * refusal). Small writes auto-apply through the frozen applyEdit mechanism
   * (one splice = one undo step); larger ones come back as PENDING diffs.
   */
  const makeExecutor = (directEditOn: boolean) => createToolExecutor(editor, {
    directEdit: directEditOn,
    withEditorAccess,
  });

  // The chat run state (transcript, busy, loading label, §5.4 resolution
  // feed) and the send pipeline live in the useChatSession controller; the
  // panel supplies the environment: settings, translator, the builtin
  // machine, and the editor access bridge. Rendering stays here.
  const chat = useChatSession({
    tt,
    getSettings: () => settingsRef.current,
    builtin: builtin.provider,
    refreshBuiltin: builtin.refresh,
    createExternal: createExternalProvider,
    makeExecutor,
    editor,
    withEditorAccess,
    clearDraft: () => setDraft(''),
    clearExcerpt: () => setExcerpt(null),
  });
  const { messages, busy, loadingLabel } = chat;

  // Auto-scroll the message list to the newest content.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loadingLabel]);

  /** The consent-gated download (explicit user activation ONLY). */
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

  const handleConsentAccept = (): void => {
    setConsentOpen(false);
    trap(startDownloadFlow());
  };

  const handleConsentDecline = (): void => {
    setConsentOpen(false);
    setConsentDeclined(true);
    pendingSendRef.current = null; // the draft never left the composer
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
    const attachedExcerpt = excerpt;
    refreshChip();

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
  const sendNow = (): void => {
    handleSend().catch((err) => console.error('[ai] request failed', err));
  };
  const downloadNow = (): void => {
    startDownloadFlow().catch((err) => console.error('[ai] request failed', err));
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendNow();
    }
  };

  const canAttempt = canAttemptProvider(settings, builtin.availability);
  const controlsDisabled = !canAttempt || busy;

  return (
    <I18nProvider locale={lang === 'fa' ? 'fa-IR' : 'en-US'}>
      <ModalOverlay ref={overlayRef} isOpen={open} isDismissable={false} className={styles.overlay}>
        <Modal className={styles.panel}>
          <Dialog aria-label={tt('aiTitle')} className={styles.inner}>
            <header className={styles.head}>
              <Heading slot="title" className={styles.title}>{tt('aiTitle')}</Heading>
              <Button
                onPress={() => setOpen(false)}
                aria-label={tt('aiClose')}
                className={styles.closeButton}
              >
                ×
              </Button>
            </header>

            <div className={styles.status} role="status">
              <StatusArea
                settings={settings}
                builtin={builtin}
                consentDeclined={consentDeclined}
                tt={tt}
                onDownload={downloadNow}
              />
            </div>

            <AiSettingsForm
              tt={tt}
              draft={settingsDraft}
              onDraftChange={setSettingsDraft}
              onApply={applySettingsDraft}
              directEdit={settings.directEdit === true}
              onDirectEditChange={handleDirectEditChange}
            />

            <div className={styles.messages} ref={messagesRef}>
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={message.role === 'user' ? styles.msgUser : styles.msgAssistant}
                >
                  {message.role === 'assistant' && <ToolActivity steps={message.tools} tt={tt} />}
                  {message.role === 'assistant' && message.diffs.map((diff) => (
                    <PendingDiffCard
                      key={diff.id}
                      diff={diff}
                      tt={tt}
                      onApply={() => chat.applyDiff(message.id, diff)}
                      onDiscard={() => chat.discardDiff(message.id, diff)}
                    />
                  ))}
                  <MessageBody
                    entry={message}
                    showLoading={loadingLabel !== null && index === messages.length - 1}
                    loadingLabel={loadingLabel}
                    tt={tt}
                  />
                </div>
              ))}
            </div>

            {chip.active && (
              <div className={styles.selChip}>
                {`${tt('aiSelectionChip')} · ${chip.length.toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US')}`}
              </div>
            )}

            {loadingLabel !== null && (
              <div className={styles.loading} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                {loadingLabel}
              </div>
            )}

            {/* Visible, removable preview-selection context: the user must
                SEE what will be sent before pressing Send. */}
            {excerpt && (
              <div className={styles.excerpt} role="group" aria-label={tt('aiExcerptContext')}>
                <div className={styles.excerptHead}>
                  <span className={styles.excerptLabel}>{tt('aiExcerptContext')}</span>
                  <span className={styles.excerptSource}>
                    {excerptSourceLine(excerpt, tt, lang)}
                  </span>
                  <Button
                    onPress={() => setExcerpt(null)}
                    aria-label={tt('aiExcerptRemove')}
                    className={styles.excerptRemove}
                  >
                    ×
                  </Button>
                </div>
                <blockquote className={styles.excerptQuote}>{excerpt.excerpt}</blockquote>
              </div>
            )}

            <div className={styles.composer}>
              <TextArea
                ref={composerRef}
                aria-label={tt('aiInputPlaceholder')}
                placeholder={tt('aiInputPlaceholder')}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={controlsDisabled}
                className={styles.input}
                onKeyDown={handleComposerKeyDown}
              />
              <Button
                onPress={sendNow}
                isDisabled={controlsDisabled || draft.trim() === ''}
                className={styles.sendButton}
              >
                {tt('aiSend')}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>

      <ConsentDialog
        isOpen={consentOpen}
        tt={tt}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />
    </I18nProvider>
  );
}
