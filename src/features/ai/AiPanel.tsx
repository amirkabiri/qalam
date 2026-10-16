// Module: features/ai/AiPanel — the AI co-author panel (React port of
// legacy/src/ai/index.ts, on React Aria Components + the ported src/lib/ai
// modules). A THIN RENDER SHELL: props are exactly { editor, t, lang } (the
// frozen wave-2 contract) — no app-context dependencies — and every piece of
// business logic lives in the controller hooks:
//   useChatSession — the chat run state (transcript, busy, loading label,
//     §5.4 resolution feed) and the end-to-end send pipeline
//   useChatFlow   — provider settings state, the composer draft, the builtin
//     availability machine, and the consent-gated download flow
// The panel keeps only JSX structure, styling, i18n usage, and the panel-level
// UI behavior (open/close, Esc, the excerpt chip adoption, the selection
// chip). Behavior parity with legacy:
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
// The three stakeholder UX requirements (first-send loading feedback, the
// explicit ~4 GB download consent, visible tool calls) are implemented across
// the controller hooks and rendered here unchanged.

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
  TextArea,
} from 'react-aria-components';
import { isForeignLayerOpen } from '../../app/shortcuts';
import type { EditorApi } from '../editor/api';
import type { Lang } from '../../i18n';
import ConsentDialog from './ConsentDialog';
import AiSettingsForm from './AiSettingsForm';
import MessageBody from './MessageBody';
import StatusArea from './StatusArea';
import ToolActivity from './ToolActivity';
import PendingDiffCard from './PendingDiffCard';
import { previewExcerptQueue } from './previewExcerpt';
import type { PreviewExcerptPayload } from './previewExcerpt';
import { useChatFlow } from './useChatFlow';
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

/**
 * The AI co-author panel: a sliding side sheet (inline-end, overlaying the
 * workspace) rendered through React Aria's modal primitives. Rendering only —
 * the controller lives in useChatFlow (which wraps useChatSession).
 */
export default function AiPanel({ editor, t, lang }: AiPanelProps) {
  // All labels live in the global dictionaries (promoted from the former
  // feature-local labels.ts) — the injected translator covers every key.
  const tt = t;

  const [open, setOpen] = useState(true);

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

  // The controller owns every behavior; the panel renders its state and
  // hands it the panel-side UI it needs (the overlay bridge + chip access).
  const flow = useChatFlow({
    tt,
    editor,
    withEditorAccess,
    getExcerpt: () => excerpt,
    clearExcerpt: () => setExcerpt(null),
    refreshChip,
  });
  const { messages, busy, loadingLabel } = flow.chat;

  // Auto-scroll the message list to the newest content.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loadingLabel]);

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      flow.send();
    }
  };

  const controlsDisabled = !flow.canAttempt || busy;

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
                settings={flow.settings}
                builtin={flow.builtin}
                consentDeclined={flow.consentDeclined}
                tt={tt}
                onDownload={flow.download}
              />
            </div>

            <AiSettingsForm
              tt={tt}
              draft={flow.settingsDraft}
              onDraftChange={flow.setSettingsDraft}
              onApply={flow.applyDraft}
              directEdit={flow.settings.directEdit === true}
              onDirectEditChange={flow.onDirectEditChange}
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
                      onApply={() => flow.chat.applyDiff(message.id, diff)}
                      onDiscard={() => flow.chat.discardDiff(message.id, diff)}
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
                value={flow.draft}
                onChange={(event) => flow.setDraft(event.target.value)}
                disabled={controlsDisabled}
                className={styles.input}
                onKeyDown={handleComposerKeyDown}
              />
              <Button
                onPress={flow.send}
                isDisabled={controlsDisabled || flow.draft.trim() === ''}
                className={styles.sendButton}
              >
                {tt('aiSend')}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>

      <ConsentDialog
        isOpen={flow.consentOpen}
        tt={tt}
        onAccept={flow.onConsentAccept}
        onDecline={flow.onConsentDecline}
      />
    </I18nProvider>
  );
}
