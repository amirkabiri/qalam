// Module: features/editor/useSelectionToolbar — the interaction gating state
// machine for the editor's floating selection toolbar (docs/selection-
// toolbar-research.md §4): show ~200 ms after a non-empty selection settles,
// hide on selection collapse, textarea scroll, pointer-down in the textarea,
// Escape, IME composition, window blur and readOnly; phase 1 gates to fine
// pointers (no touch/mobile — native selection handles collide with the
// toolbar).
//
// Detection is a DOCUMENT-level 'selectionchange' listener that checks
// document.activeElement — the universal pattern (element-level
// selectionchange only landed in Chrome/Edge 127+, Firefox 92+, Safari 18+;
// research §2.3). The acted-on range is PINNED at toolbar-open (mirroring
// applyEdit's pinnedRange) so the toolbar can never read a stale selection,
// and actions go through here so the write's programmatic selectionchange
// echo (setSelectionRange + insertText) can be suppressed — an action
// dismisses the toolbar and must not re-open over the user's next keystrokes.
//
// Focus contract (the bug this design fixes): the toolbar NEVER takes focus
// — its buttons call preventDefault on mousedown — so the textarea keeps
// focus and the live, highlighted selection the whole time. Nothing needs to
// be restored: the selection the user sees is the selection the action hits.

import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import type { RefObject } from 'react';

import { createDomCaretMeasurer } from './caretGeometry';
import type { CaretMeasurer, CaretPoint } from './caretGeometry';
import type { FormatAction } from './markdownActions';
import type { EditorController } from './useEditorController';

/** Debounce before a settled non-empty selection shows the toolbar (research
 *  §4: prevents flicker during drag-select; 200 ms is the product default). */
export const SHOW_DELAY_MS = 200;

/** How long after an ACTION the selectionchange echo of the programmatic
 *  write (setSelectionRange + insertText) is ignored. Real write bursts land
 *  within milliseconds; no user selection intent can. */
export const WRITE_ECHO_SUPPRESS_MS = 100;

/** Vertical room (in px) the toolbar needs above the selection start: bar
 *  height (~32) + the 8px offset + slack. With less, the toolbar flips
 *  BELOW the selection's end caret (Notion's behavior at the top of a page). */
export const PLACEMENT_CLEARANCE_PX = 48;

export type ToolbarPlacement = 'top' | 'bottom';

export interface SelectionToolbarOptions {
  /** The editor textarea (the selection owner). */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** The controller — actions write through its applyFormat (pinned range). */
  controller: Pick<EditorController, 'applyFormat'>;
  /** Non-editable documents never show the toolbar. */
  readOnly: boolean;
  /** Measurement seam — tests inject a scripted fake. */
  createMeasurer?: (textarea: HTMLTextAreaElement) => CaretMeasurer;
  /** Phase-1 pointer gate (`(pointer: fine)` media). Seam for tests; when
   *  the platform cannot answer (jsdom), the toolbar stays enabled. */
  finePointer?: () => boolean;
}

export interface SelectionToolbarState {
  /** The toolbar is mounted. */
  open: boolean;
  /** The PINNED selection the toolbar acts on — captured when showing. */
  range: [number, number];
  /** Wrapper-relative anchor point (0,0 while closed): the selection START
   *  for top placement, the selection END when flipped below. */
  anchor: CaretPoint;
  /** 'top' = above the selection (default); 'bottom' = below it (no room). */
  placement: ToolbarPlacement;
  /** Hide immediately (Escape / outside dismissal). */
  hide: () => void;
  /** Apply a formatting action to the pinned selection and dismiss. */
  applyAction: (action: FormatAction) => void;
}

/** Module-level so the default never re-creates the measurer per render. */
const defaultCreateMeasurer = createDomCaretMeasurer;

/** The phase-1 gate: pointer-driven only (research §4, mobile pitfall). */
function defaultFinePointer(): boolean {
  return typeof window.matchMedia !== 'function' || window.matchMedia('(pointer: fine)').matches;
}

export function useSelectionToolbar({
  textareaRef,
  controller,
  readOnly,
  createMeasurer = defaultCreateMeasurer,
  finePointer = defaultFinePointer,
}: SelectionToolbarOptions): SelectionToolbarState {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [anchor, setAnchor] = useState<CaretPoint>({ x: 0, y: 0, lineBottom: 0 });
  const [placement, setPlacement] = useState<ToolbarPlacement>('top');

  const showTimerRef = useRef(0);
  const pinnedRangeRef = useRef<[number, number]>([0, 0]);
  const composingRef = useRef(false);
  const echoUntilRef = useRef(0);
  // Call-time reads, so listener closures stay stable and options may churn
  // (same call-time pattern as the controller's tRef/optsRef).
  const readOnlyRef = useRef(readOnly);
  const finePointerRef = useRef(finePointer);
  const openRef = useRef(open);

  useEffect(() => {
    readOnlyRef.current = readOnly;
    finePointerRef.current = finePointer;
    openRef.current = open;
  }, [readOnly, finePointer, open]);

  const hide = useMemo(() => () => {
    window.clearTimeout(showTimerRef.current);
    setOpen(false);
  }, []);

  // Measurer + all show/hide listeners: mounted once per textarea identity.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return undefined;
    const measurer = createMeasurer(el);

    /** Measure the anchor for the PINNED selection: horizontally at the
     *  selection's start, ABOVE it — or, when there is no room at the top
     *  of the viewport, BELOW the selection's end LINE (the Notion flip,
     *  anchored at the end caret's line BOTTOM so the bar never covers the
     *  selected text). Returns false when nothing trustworthy could be
     *  measured. */
    const place = (): boolean => {
      const from = measurer.measurePoint(el, pinnedRangeRef.current[0]);
      if (!from) return false;
      if (from.y >= PLACEMENT_CLEARANCE_PX) {
        setAnchor(from);
        setPlacement('top');
        return true;
      }
      const to = measurer.measurePoint(el, pinnedRangeRef.current[1]);
      if (!to) return false;
      setAnchor({ x: to.x, y: to.lineBottom, lineBottom: to.lineBottom });
      setPlacement('bottom');
      return true;
    };

    /** Show the toolbar once a non-empty selection settles (debounced). The
     *  range is read and pinned NOW — later selection churn restarts the
     *  timer, and the act-on range never goes stale while open. */
    const scheduleShow = () => {
      if (composingRef.current || readOnlyRef.current || !finePointerRef.current()) {
        return;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start === null || end === null || start === end) {
        hide();
        return;
      }
      window.clearTimeout(showTimerRef.current);
      pinnedRangeRef.current = [start, end];
      showTimerRef.current = window.setTimeout(() => {
        // readOnly may flip while the debounce runs.
        if (readOnlyRef.current) return;
        if (!place()) return;
        setRange(pinnedRangeRef.current);
        setOpen(true);
      }, SHOW_DELAY_MS);
    };

    const onSelectionChange = () => {
      // Textarea-external selection churn (another control, the toolbar
      // itself — though it never takes focus) must not show — nor hide — it.
      if (document.activeElement !== el) return;
      // The write echo of our own applyFormat must not re-open the toolbar.
      if (Date.now() < echoUntilRef.current) return;
      scheduleShow();
    };

    // Escape closes the toolbar while the textarea keeps focus (it never
    // left — the buttons are mousedown-preventDefault'ed).
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) hide();
    };

    const onCompositionStart = () => {
      composingRef.current = true;
      hide();
    };
    const onCompositionEnd = () => {
      composingRef.current = false;
    };

    // Reposition the OPEN toolbar when the window re-wraps the text.
    const onWindowResize = () => {
      if (!openRef.current) return;
      if (!place()) hide();
    };

    document.addEventListener('selectionchange', onSelectionChange);
    el.addEventListener('scroll', hide);
    el.addEventListener('pointerdown', hide);
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', onWindowResize);

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      el.removeEventListener('scroll', hide);
      el.removeEventListener('pointerdown', hide);
      el.removeEventListener('keydown', onKeydown);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionend', onCompositionEnd);
      window.removeEventListener('blur', hide);
      window.removeEventListener('resize', onWindowResize);
      window.clearTimeout(showTimerRef.current);
      measurer.dispose?.();
    };
  }, [textareaRef, createMeasurer, hide]);

  const applyAction = useMemo(() => (action: FormatAction) => {
    echoUntilRef.current = Date.now() + WRITE_ECHO_SUPPRESS_MS;
    controller.applyFormat(action, pinnedRangeRef.current);
    hide();
  }, [controller, hide]);

  // A document that became read-only mid-selection never keeps the toolbar —
  // adjusted during render (the "react to a prop change" pattern; ref-based
  // side effects stay out of render: a pending debounce self-suppresses via
  // the readOnlyRef check inside the timer callback).
  const [prevReadOnly, setPrevReadOnly] = useState(readOnly);
  if (prevReadOnly !== readOnly) {
    setPrevReadOnly(readOnly);
    if (readOnly) setOpen(false);
  }

  return {
    open, range, anchor, placement, hide, applyAction,
  };
}
