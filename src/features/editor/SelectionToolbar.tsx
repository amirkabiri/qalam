// The floating markdown formatting toolbar over an editor selection: a SMALL
// HORIZONTAL inline toolbar (Notion-style) of icon buttons, positioned just
// ABOVE the selection rectangle — or BELOW it when the selection sits at the
// very top of the viewport (placement from useSelectionToolbar) — never
// covering the selected text. It is a plain absolutely-positioned element in
// the (position: relative) editor wrapper, NOT a RAC menu: the old
// Popover+Menu mounted with autoFocus="first", which moved focus out of the
// textarea and visually destroyed the user's live selection before any
// action could run.
//
// Focus contract: every button calls preventDefault on mousedown, so the
// pointer never moves focus out of the textarea — the selection stays alive
// and highlighted while the toolbar is open, and applyAction writes through
// controller.applyFormat with the PINNED range as one native undo step.
// The buttons remain real focusable <button>s (Tab from the textarea), and
// the toolbar carries role="toolbar" + localized aria-labels.
//
// The toolbar's `dir` follows the DOCUMENT's direction (an RTL document
// mirrors the button order and the anchor side even under an LTR UI).
import {
  useLayoutEffect, useRef, useState,
} from 'react';
import type { CSSProperties, RefObject } from 'react';

import { useT } from '../../app/i18n';

import type { CaretMeasurer } from './caretGeometry';
import { getSelectionFormatting } from './markdownActions';
import type { FormatAction } from './markdownActions';
import styles from './SelectionToolbar.module.css';
import { useSelectionToolbar } from './useSelectionToolbar';
import type { EditorController } from './useEditorController';

export interface SelectionToolbarProps {
  /** The editor textarea (the selection owner). */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Writes formatting through the controller's undo-preserving primitive. */
  controller: EditorController;
  /** The DOCUMENT's rendered direction — mirrors the toolbar order/side. */
  dir: 'ltr' | 'rtl';
  /** Non-editable documents never show the toolbar. */
  readOnly: boolean;
  /** Measurement seam — tests inject a scripted fake (caretGeometry). */
  // eslint-disable-next-line react/require-default-props
  createMeasurer?: (textarea: HTMLTextAreaElement) => CaretMeasurer;
}

/** The default actions, in the research's §6 order. `glyph` is the compact
 *  visual (decorative — the accessible name is the localized label). */
const ACTIONS: readonly {
  id: FormatAction; labelKey: string; glyph: string; glyphClass?: string;
}[] = [
  {
    id: 'bold', labelKey: 'fmtBold', glyph: 'B', glyphClass: styles.glyphBold,
  },
  {
    id: 'italic', labelKey: 'fmtItalic', glyph: 'I', glyphClass: styles.glyphItalic,
  },
  {
    id: 'strikethrough', labelKey: 'fmtStrikethrough', glyph: 'S', glyphClass: styles.glyphStrike,
  },
  { id: 'inlineCode', labelKey: 'fmtInlineCode', glyph: '</>' },
  { id: 'link', labelKey: 'fmtLink', glyph: '🔗' },
  { id: 'heading2', labelKey: 'fmtHeading2', glyph: 'H2' },
  { id: 'heading3', labelKey: 'fmtHeading3', glyph: 'H3' },
  { id: 'bulletList', labelKey: 'fmtBulletList', glyph: '••' },
  { id: 'numberedList', labelKey: 'fmtNumberedList', glyph: '1.' },
  { id: 'taskList', labelKey: 'fmtTaskList', glyph: '☑' },
  { id: 'blockquote', labelKey: 'fmtBlockquote', glyph: '❝' },
  { id: 'codeBlock', labelKey: 'fmtCodeBlock', glyph: '{}' },
];

/** Gap between the toolbar and the selection rectangle, in px. */
const EDGE_OFFSET_PX = 8;

export default function SelectionToolbar({
  textareaRef, controller, dir, readOnly, createMeasurer,
}: SelectionToolbarProps) {
  const t = useT();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const {
    open, anchor, placement, range, hide, applyAction,
  } = useSelectionToolbar({
    textareaRef, controller, readOnly, createMeasurer,
  });

  // Horizontal clamp: the bar's left edge sits at the selection start, but
  // never overflows the editor wrapper's far edge (offsetParent — the
  // wrapper is position: relative). Runs before paint (no flicker).
  const [left, setLeft] = useState(0);
  useLayoutEffect(() => {
    if (!open) return;
    const node = toolbarRef.current;
    const wrapper = node?.offsetParent as HTMLElement | null;
    if (!node || !wrapper) return;
    const max = wrapper.clientWidth - node.offsetWidth;
    setLeft(Math.max(0, Math.min(anchor.x, max)));
  }, [open, anchor, placement]);

  if (!open) return null;

  // The selection's CURRENT formatting (t_d18b34b2): the pinned range read
  // against the live document text — each button renders aria-pressed from
  // it, and the pure actions below toggle accordingly (bold on bold text
  // UNWRAPS instead of double-wrapping).
  const formatting = getSelectionFormatting(controller.text, range[0], range[1]);

  // Above the selection (bottom edge `offset` px over its top), or below the
  // selection end when flipped (top edge `offset` px under its bottom).
  const style: CSSProperties = {
    left: `${left}px`,
    top: `${anchor.y}px`,
    transform: placement === 'top'
      ? `translateY(calc(-100% - ${EDGE_OFFSET_PX}px))`
      : `translateY(${EDGE_OFFSET_PX}px)`,
  };

  return (
    <div
      ref={toolbarRef}
      className={styles.toolbar}
      style={style}
      role="toolbar"
      aria-label={t('fmtMenu')}
      aria-orientation="horizontal"
      data-testid="selection-toolbar"
      data-placement={placement}
      dir={dir}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide();
      }}
    >
      {ACTIONS.map(({
        id, labelKey, glyph, glyphClass,
      }) => {
        const active = formatting[id];
        return (
          <button
            key={id}
            type="button"
            className={active ? `${styles.btn} ${styles.btnActive}` : styles.btn}
            title={t(labelKey)}
            aria-label={t(labelKey)}
            aria-pressed={active}
            data-active={active || undefined}
            // THE fix for the lost selection: the pointer never moves focus
            // out of the textarea, so the live selection stays highlighted.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction(id)}
          >
            <span aria-hidden="true" className={glyphClass}>{glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
