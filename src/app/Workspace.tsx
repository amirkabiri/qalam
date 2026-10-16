// The workspace (legacy div#workspace): editor pane | divider | preview pane.
// Owns the split-fraction drag (double-click resets, RTL-aware) and the
// bidirectional editor/preview scroll sync with the legacy 60 ms lock.
// R8 additions: the readonly-session banner ("being edited in another tab" +
// Take over) above the editor, and the document name in the pane head is an
// inline rename (wired to the repository rename).
import {
  useEffect, useRef, useState, type CSSProperties,
} from 'react';

import { useT } from './i18n';
import { DocumentName } from '../features/documents';
import Editor from '../features/editor/Editor';
import type { EditorController } from '../features/editor/useEditorController';
import Preview from '../features/preview/Preview';
import type { MarkdownPreviewState } from '../features/preview/useMarkdownPreview';
import {
  countChars, countWords, localeForLang, store,
} from '../lib/store';
import type {
  ContentDir, Lang, PaneMode, Theme,
} from '../lib/store';

import styles from './Workspace.module.css';

/** Keyboard resize step (percent of the workspace width, per key press). */
const SPLIT_STEP = 2;

export interface WorkspaceProps {
  mode: PaneMode;
  editor: EditorController;
  docName: string;
  /** True while the active document is locked by another tab. */
  docReadonly: boolean;
  /** True when the shown name belongs to a persisted, renameable record. */
  docRenameable: boolean;
  lang: Lang;
  dirEditor: 'ltr' | 'rtl';
  previewState: MarkdownPreviewState;
  previewDir: 'ltr' | 'rtl';
  dirMode: ContentDir;
  theme: Theme;
  docIdentity: string;
  onSpyChange: (id: string | null) => void;
  onOpenDocLink: (href: string) => void;
  onTakeOver: () => void;
  onRenameDoc: (name: string) => void;
}

const SPLIT_MIN = 0.2;
const SPLIT_MAX = 0.8;
/** Legacy scroll-sync lock: ignore echo scrolls for 60 ms. */
const SCROLL_LOCK_MS = 60;

export default function Workspace({
  mode, editor, docName, docReadonly, docRenameable, lang, dirEditor, previewState, previewDir,
  dirMode, theme, docIdentity, onSpyChange, onOpenDocLink, onTakeOver, onRenameDoc,
}: WorkspaceProps) {
  const t = useT();
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const [renamingDoc, setRenamingDoc] = useState(false);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const savedSplit = store.get<string | null>('split', null);
  /** The initially-exposed separator value (pure — no ref access at render). */
  const initialSplitPct = savedSplit
    ? Math.round(parseFloat(savedSplit)) || 50
    : 50;

  /* Divider drag + double-click reset (legacy initDivider). The split value
     lives in ONE helper so the pointer drag, keyboard resize and reset all
     move the same CSS variable and persist identically. */
  const setSplit = (frac: number): void => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, frac));
    workspace.style.setProperty('--split', `${(clamped * 100).toFixed(2)}%`);
    store.set('split', workspace.style.getPropertyValue('--split'));
    // The value is exposed for AT: keep it in sync with the imperative move
    // (this code path bypasses React state by design).
    dividerRef.current?.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
  };

  /** The live split as a fraction (computed style — CSS var or the default). */
  const readSplit = (): number => {
    const workspace = workspaceRef.current;
    if (!workspace) return 0.5;
    const raw = parseFloat(workspace.style.getPropertyValue('--split'));
    return Number.isFinite(raw) ? raw / 100 : 0.5;
  };

  useEffect(() => {
    const divider = dividerRef.current;
    const workspace = workspaceRef.current;
    if (!divider || !workspace) return undefined;

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'split') return;
      divider.setPointerCapture(e.pointerId);
      divider.classList.add(styles.dragging);
      const rect = workspace.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        let frac = (ev.clientX - rect.left) / rect.width;
        if (document.documentElement.dir === 'rtl') frac = 1 - frac;
        frac = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, frac));
        workspace.style.setProperty('--split', `${(frac * 100).toFixed(2)}%`);
      };
      const up = () => {
        divider.classList.remove(styles.dragging);
        store.set('split', workspace.style.getPropertyValue('--split'));
        // Expose the final pointer position to AT (setSplit's attribute sync,
        // without clamping — move() already clamped).
        const pct = parseFloat(workspace.style.getPropertyValue('--split'));
        if (Number.isFinite(pct)) {
          divider.setAttribute('aria-valuenow', String(Math.round(pct)));
        }
        divider.removeEventListener('pointermove', move);
        divider.removeEventListener('pointerup', up);
      };
      divider.addEventListener('pointermove', move);
      divider.addEventListener('pointerup', up);
    };
    const onDblClick = () => {
      workspace.style.removeProperty('--split');
      store.set('split', null);
    };
    /* Keyboard resize (a11y — role=separator per the APG): arrows move the
       split by SPLIT_STEP%, direction-aware; Home resets to the middle. */
    const onKeyDown = (e: KeyboardEvent) => {
      if (modeRef.current !== 'split') return;
      const rtl = document.documentElement.dir === 'rtl';
      const current = readSplit();
      const towardEditor = (e.key === 'ArrowLeft') !== rtl; // LTR: left = smaller
      let next: number | null = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        next = current + (towardEditor ? -1 : 1) * (SPLIT_STEP / 100);
      } else if (e.key === 'Home') {
        next = 0.5;
      }
      if (next === null) return;
      e.preventDefault();
      setSplit(next);
    };

    divider.addEventListener('pointerdown', onPointerDown);
    divider.addEventListener('dblclick', onDblClick);
    divider.addEventListener('keydown', onKeyDown);
    return () => {
      divider.removeEventListener('pointerdown', onPointerDown);
      divider.removeEventListener('dblclick', onDblClick);
      divider.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  /* Editor <-> preview scroll sync (legacy bindScrollSync). */
  useEffect(() => {
    const workspace = workspaceRef.current;
    const previewScroll = previewScrollRef.current;
    if (!workspace || !previewScroll) return undefined;
    const editorEl = workspace.querySelector('textarea');
    if (!editorEl) return undefined;

    let lockUntil = 0;
    const fraction = (el: HTMLElement) => el.scrollTop
      / Math.max(1, el.scrollHeight - el.clientHeight);
    const onEditorScroll = () => {
      if (modeRef.current !== 'split' || Date.now() < lockUntil) return;
      lockUntil = Date.now() + SCROLL_LOCK_MS;
      previewScroll.scrollTop = fraction(editorEl)
        * Math.max(0, previewScroll.scrollHeight - previewScroll.clientHeight);
    };
    const onPreviewScroll = () => {
      if (modeRef.current !== 'split' || Date.now() < lockUntil) return;
      lockUntil = Date.now() + SCROLL_LOCK_MS;
      editorEl.scrollTop = fraction(previewScroll)
        * Math.max(0, editorEl.scrollHeight - editorEl.clientHeight);
    };
    editorEl.addEventListener('scroll', onEditorScroll);
    previewScroll.addEventListener('scroll', onPreviewScroll);
    return () => {
      editorEl.removeEventListener('scroll', onEditorScroll);
      previewScroll.removeEventListener('scroll', onPreviewScroll);
    };
  }, []);

  const splitStyle = savedSplit
    ? ({ '--split': savedSplit } as CSSProperties)
    : undefined;

  return (
    <main
      ref={workspaceRef}
      id="workspace"
      /* a11y: skip-link target (tabindex=-1 makes the landmark focusable
         without putting it in the tab order). */
      tabIndex={-1}
      className={`${styles.workspace} ${styles[`mode${mode[0].toUpperCase()}${mode.slice(1)}`]}`}
      style={splitStyle}
    >
      <section className={styles.editorPane} aria-label={t('editor')}>
        <div className={styles.paneHead}>
          <span className={styles.paneLabel}>{t('editor')}</span>
          {docRenameable ? (
            <DocumentName
              name={docName}
              label={t('docRename')}
              editing={renamingDoc}
              onEditingChange={setRenamingDoc}
              onCommit={onRenameDoc}
              onActivate={() => setRenamingDoc(true)}
              className={styles.docName}
              inputClassName={styles.docNameInput}
            />
          ) : (
            <span className={styles.docName}>{docName}</span>
          )}
        </div>
        {docReadonly && (
          <div className={styles.lockBanner} role="status">
            <span>{t('docLockedBanner')}</span>
            <button type="button" className={styles.takeOverBtn} onClick={onTakeOver}>
              {t('docTakeOver')}
            </button>
          </div>
        )}
        <Editor
          controller={editor}
          dir={dirEditor}
          ariaLabel={t('editorAria')}
          placeholder="# Start writing… / بنویسید…"
          readOnly={docReadonly}
        />
        <div className={styles.statusbar}>
          <span>{countWords(editor.text).toLocaleString(localeForLang(lang))}</span>
          <span>{t('words')}</span>
          <span className={styles.dot}>·</span>
          <span>{countChars(editor.text).toLocaleString(localeForLang(lang))}</span>
          <span>{t('chars')}</span>
        </div>
      </section>

      <div
        ref={dividerRef}
        className={styles.divider}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('dividerLabel')}
        aria-valuemin={SPLIT_MIN * 100}
        aria-valuemax={SPLIT_MAX * 100}
        aria-valuenow={initialSplitPct}
        /* a11y: a focusable separator IS interactive (APG splitter pattern —
           it resizes by keyboard); the rule just doesn't model that role. */
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        title={t('dividerTitle')}
      />

      <section className={styles.previewPane} aria-label={t('preview')}>
        <div className={styles.paneHead}>
          <span className={styles.paneLabel}>{t('preview')}</span>
        </div>
        <Preview
          state={previewState}
          dir={previewDir}
          dirMode={dirMode}
          theme={theme}
          docIdentity={docIdentity}
          scrollRef={previewScrollRef}
          onSpyChange={onSpyChange}
          onOpenDocLink={onOpenDocLink}
        />
      </section>
    </main>
  );
}
