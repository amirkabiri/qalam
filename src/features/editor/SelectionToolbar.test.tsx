// Component tests for the editor selection toolbar: selection → a small
// HORIZONTAL toolbar floating above the selection (with scripted caret
// geometry faked at the DOM boundary — house style, jsdom has no layout
// engine), an action applying through the controller (textarea value +
// exactly one change notification), Escape dismissal, read-only suppression
// and the scroll/press dismissal gates.
//
// Focus contract tests: the toolbar never takes focus (buttons
// mousedown-preventDefault) — the textarea keeps focus and the live
// selection while open.
//
// Timers: the interaction tests run on real timers and poll the 200 ms
// debounce with findByRole; the debounce-window and absence-after-the-window
// assertions use fake timers with fireEvent (deterministic, no userEvent
// needed there).
import {
  act, fireEvent, render, screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { I18nProvider } from '../../app/i18n';

import Editor from './Editor';
import type { CaretMeasurer } from './caretGeometry';
import { WRITE_ECHO_SUPPRESS_MS } from './useSelectionToolbar';
import { useEditorController } from './useEditorController';
import type { EditorController } from './useEditorController';

/** Scripted caret geometry at the DOM boundary: offset-dependent x AND y
 *  (y = 60 + index clears the 48px top clearance → 'top' placement). Tests
 *  of the viewport-top flip push the start caret's y below the clearance. */
class FakeCaretMeasurer implements CaretMeasurer {
  readonly calls: number[] = [];

  /** Extra downward shift (px) simulating a selection near the top. */
  lift = 0;

  measurePoint(
    _textarea: HTMLTextAreaElement,
    index: number,
  ): { x: number; y: number; lineBottom: number } {
    this.calls.push(index);
    const y = 60 + index - this.lift;
    return { x: 42 + index, y, lineBottom: y + 24 };
  }
}

let ctl: EditorController | undefined;
let fakeMeasurer: FakeCaretMeasurer;

function Inner({
  capture, readOnly, onDocChange,
}: {
  capture: (c: EditorController) => void;
  readOnly: boolean;
  // eslint-disable-next-line react/require-default-props -- test harness
  onDocChange?: (text: string) => void;
}) {
  const ctrl = useEditorController({ onDocChange });
  useEffect(() => {
    capture(ctrl);
  }, [capture, ctrl]);
  return (
    <Editor
      controller={ctrl}
      dir="ltr"
      ariaLabel="Markdown source"
      placeholder="# Start writing…"
      readOnly={readOnly}
      createMeasurer={() => ({ measureHeights: () => [28] })}
      createCaretMeasurer={() => fakeMeasurer}
    />
  );
}

function Harness({
  readOnly = false, onDocChange, lang = 'en',
}: {
  // eslint-disable-next-line react/require-default-props -- test harness
  readOnly?: boolean;
  // eslint-disable-next-line react/require-default-props -- test harness
  onDocChange?: (text: string) => void;
  // eslint-disable-next-line react/require-default-props -- test harness
  lang?: 'en' | 'fa';
}) {
  return (
    <I18nProvider lang={lang}>
      <Inner
        capture={(c) => {
          ctl = c;
        }}
        readOnly={readOnly}
        onDocChange={onDocChange}
      />
    </I18nProvider>
  );
}

function controller(): EditorController {
  if (!ctl) throw new Error('controller not captured');
  return ctl;
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText('Markdown source');
}

function toolbar(): HTMLElement {
  return screen.getByRole('toolbar', { name: 'Formatting' });
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Focus, make a non-empty selection and emit the document-level
 *  selectionchange the hook listens to (jsdom fires none on its own). */
function select(start: number, end: number): void {
  const ta = textarea();
  ta.focus();
  act(() => {
    ta.setSelectionRange(start, end);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

/** Select and wait through the real 200 ms debounce (findBy polls). */
async function openToolbar(start = 6, end = 11): Promise<void> {
  select(start, end);
  await screen.findByRole('toolbar', { name: 'Formatting' });
}

/** A real (small) execCommand at the boundary: performs the insertion, like
 *  browsers do, and records the call (the undo-stack-preserving path). */
function stubExecCommand(): ReturnType<typeof vi.fn> {
  const execCommand = vi.fn((_command: string, _ui: boolean, text?: string) => {
    if (typeof text === 'string') {
      const el = textarea();
      el.setRangeText(text, el.selectionStart ?? 0, el.selectionEnd ?? 0, 'end');
    }
    return true;
  });
  document.execCommand = execCommand;
  return execCommand;
}

beforeEach(() => {
  fakeMeasurer = new FakeCaretMeasurer();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // execCommand is a boundary we stub per-test; always drop the stub.
  Reflect.deleteProperty(document, 'execCommand');
});

describe('<SelectionToolbar />', () => {
  it('appears as a horizontal toolbar ~200ms after a selection settles', async () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    select(6, 11);
    // Still hidden inside the debounce window (drag-select flicker guard).
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const bar = toolbar();
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-orientation', 'horizontal');
    expect(bar).toHaveAttribute('data-placement', 'top');
    expect(button('Bold')).toBeInTheDocument();
    expect(button('Italic')).toBeInTheDocument();
    expect(button('Code block')).toBeInTheDocument();
    // The anchor measured the selection START, above the selection.
    expect(fakeMeasurer.calls).toEqual([6]);
    expect(bar.style.top).toBe('66px');

    // THE bug this rewrite fixes: the selection stays live under the open
    // toolbar — the textarea still holds focus and the pinned selection.
    expect(textarea()).toHaveFocus();
    expect(textarea().selectionStart).toBe(6);
    expect(textarea().selectionEnd).toBe(11);
  });

  it('flips BELOW the selection when it sits at the viewport top', async () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    fakeMeasurer.lift = 60; // start caret's y = 6 → no room above
    select(6, 11);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    const bar = toolbar();
    expect(bar).toHaveAttribute('data-placement', 'bottom');
    // Both carets were measured (start, then the END for the below-flip);
    // the anchor is the selection's end caret.
    expect(fakeMeasurer.calls).toEqual([6, 11]);
    // The below-anchor is the end caret's line BOTTOM (11 + 24), so the bar
    // opens clear under the selected line.
    expect(bar.style.top).toBe('35px');
  });

  it('shows Bold as ACTIVE (aria-pressed) when the selection is inside bold markers, and Bold then UNWRAPS', async () => {
    render(<Harness />);
    act(() => controller().loadDocument('a **bold** b'));
    stubExecCommand();

    // Selection strictly INSIDE the **…** span (a re-selection of the
    // already-bold word — t_d18b34b2).
    await openToolbar(4, 8);

    expect(button('Bold')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Bold')).toHaveAttribute('data-active');
    expect(button('Italic')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.setup().click(button('Bold'));
    // Toggled OFF — no double **…** wrapping.
    expect(textarea().value).toBe('a bold b');
  });

  it('a plain selection renders every button aria-pressed=false', async () => {
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    await openToolbar();

    expect(button('Bold')).toHaveAttribute('aria-pressed', 'false');
    expect(button('Blockquote')).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies Bold through the controller: undo-path write, one change event, focus kept', async () => {
    const onDocChange = vi.fn();
    render(<Harness onDocChange={onDocChange} />);
    act(() => controller().loadDocument('hello world'));
    const execCommand = stubExecCommand();

    await openToolbar();

    // userEvent honors the buttons' mousedown preventDefault: focus never
    // leaves the textarea — the live selection survives the click.
    await userEvent.setup().click(button('Bold'));

    expect(textarea().value).toBe('hello **world**');
    expect(textarea()).toHaveFocus();
    expect(onDocChange).toHaveBeenCalledTimes(1);
    expect(onDocChange).toHaveBeenCalledWith('hello **world**');
    // The undo-preserving write path was the one that ran.
    expect(execCommand).toHaveBeenCalledWith('insertText', false, '**world**');
    // The action dismisses the toolbar.
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('does not re-open from its own write echo after an action', async () => {
    vi.useFakeTimers();
    const onDocChange = vi.fn();
    render(<Harness onDocChange={onDocChange} />);
    act(() => controller().loadDocument('hello world'));
    stubExecCommand();

    select(6, 11);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(toolbar()).toBeInTheDocument();

    fireEvent.click(button('Bold'));
    expect(textarea().value).toBe('hello **world**');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    // The write's focus/setSelectionRange/insertText burst emitted
    // selectionchange events — none of them may re-open the toolbar.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('acts on the PINNED selection even if the caret moved since', async () => {
    render(<Harness />);
    act(() => controller().loadDocument('alpha beta'));
    stubExecCommand();

    await openToolbar(6, 10);
    // The user's selection churns after the toolbar opened…
    act(() => {
      textarea().setSelectionRange(0, 0);
    });

    await userEvent.setup().click(button('Bold'));

    // …the action still targeted the pinned range.
    expect(textarea().value).toBe('alpha **beta**');
  });

  it('is keyboard-operable: Enter on a focused button applies, Escape hides', async () => {
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));
    stubExecCommand();

    await openToolbar();

    const user = userEvent.setup();
    // The buttons are real focusable <button>s (Tab from outside the
    // textarea — the editor itself captures Tab for indentation); Enter on
    // a focused one applies its action.
    act(() => {
      button('Italic').focus();
    });
    await user.keyboard('{Enter}');
    expect(textarea().value).toBe('hello *world*');

    // Let the action's write-echo suppression window lapse, then open again.
    await act(async () => {
      await new Promise((r) => {
        setTimeout(r, WRITE_ECHO_SUPPRESS_MS + 50);
      });
    });

    // Escape anywhere in the toolbar dismisses it without touching the doc.
    await openToolbar();
    act(() => {
      button('Italic').focus();
    });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(textarea().value).toBe('hello *world*');
  });

  it('hides on Escape without touching the document', async () => {
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    await openToolbar();

    await userEvent.setup().keyboard('{Escape}');

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(textarea().value).toBe('hello world');
    // The textarea never lost focus (no restore needed — the toolbar never
    // took it), so keystrokes land in the editor immediately.
    expect(textarea()).toHaveFocus();
  });

  it('never shows for a read-only document', async () => {
    vi.useFakeTimers();
    render(<Harness readOnly />);
    act(() => controller().loadDocument('hello world'));

    select(6, 11);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(fakeMeasurer.calls).toEqual([]); // measured nothing, showed nothing
  });

  it('hides when the selection collapses', async () => {
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    await openToolbar();
    select(11, 11);

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('a collapse also cancels a pending show', async () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    select(2, 8);
    select(5, 5); // collapses before the debounce settles
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('hides when the textarea scrolls', async () => {
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    await openToolbar();
    act(() => {
      textarea().dispatchEvent(new Event('scroll'));
    });

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('hides when the window loses focus', async () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    select(6, 11);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(toolbar()).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('suppresses the toolbar during IME composition, resumes after', async () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    select(6, 11);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(toolbar()).toBeInTheDocument();

    // Composition starts → the toolbar hides, and selection churn while
    // composing never shows it again.
    act(() => {
      textarea().dispatchEvent(new Event('compositionstart'));
    });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    select(0, 4);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    // After compositionend a fresh selection shows the toolbar again.
    act(() => {
      textarea().dispatchEvent(new Event('compositionend'));
    });
    select(0, 4);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(toolbar()).toBeInTheDocument();
  });

  it('hides on pointer-down in the textarea', async () => {
    render(<Harness />);
    act(() => controller().loadDocument('hello world'));

    await openToolbar();
    act(() => {
      textarea().dispatchEvent(new PointerEvent('pointerdown'));
    });

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('localizes the toolbar to the UI language (فارسی)', async () => {
    render(<Harness lang="fa" />);
    act(() => controller().loadDocument('سلام دنیا'));

    select(0, 4);
    expect(
      await screen.findByRole('toolbar', { name: 'قالب‌بندی' }),
    ).toBeInTheDocument();
    expect(button('درشت')).toBeInTheDocument();
  });
});
