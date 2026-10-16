import { expect, test, type Page } from '@playwright/test';

/**
 * Selection toolbar (small HORIZONTAL markdown toolbar floating over an
 * editor selection). Real engines only, per TESTING.md: word selection,
 * caret geometry, the native undo stack and focus preservation are browser
 * behaviors with no jsdom oracle.
 *
 * Journeys: double-click a word → the toolbar floats after its settle
 * debounce → Bold wraps it in **…** as ONE undo step → Mod/Ctrl+Z reverts
 * exactly → Escape dismisses and typing lands back in the editor. Also: the
 * selection stays LIVE while the toolbar is open (focus never leaves the
 * textarea — the bug this toolbar design fixes), the viewport-top flip to
 * below-placement, multi-line selections, and the RTL document side.
 */

const DOC = 'Bleeding ink on paper\nSecond line here\nThird line ends here';
const DOC_FA = 'قلم و مرکب\nخط دوم';

function editor(page: Page) {
  return page.getByRole('textbox');
}

function toolbar(page: Page) {
  return page.getByRole('toolbar', { name: 'Formatting' });
}

/** Boots the app and waits for the boot README's ASYNC hydration to settle
 *  — a document written before it lands gets clobbered by loadDocument. */
async function boot(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toHaveValue(/# Qalam/);
}

/** Loads `text` the way the app's own loadDocument does — value write plus
 *  one input event for the controller's mirror (line-numbers.spec pattern). */
async function loadDocumentText(page: Page, text: string) {
  await editor(page).evaluate((el, t) => {
    if (!(el instanceof HTMLTextAreaElement)) throw new Error('editor is not a textarea');
    // eslint-disable-next-line no-param-reassign
    el.value = t;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await expect(editor(page)).toHaveValue(text);
}

/** The selection is LIVE under the open toolbar: the textarea keeps focus
 *  and its non-empty selection (the toolbar never steals focus). */
async function expectLiveSelection(page: Page) {
  const live = await editor(page).evaluate((el) => {
    if (!(el instanceof HTMLTextAreaElement)) throw new Error('editor is not a textarea');
    return {
      focused: document.activeElement === el,
      collapsed: el.selectionStart === el.selectionEnd,
    };
  });
  expect(live.focused).toBe(true);
  expect(live.collapsed).toBe(false);
}

/** The toolbar floats clear of the selection: it is a horizontal strip and,
 *  per the app's own anchor (`data-placement` + inline `top`, both derived
 *  from the real caret geometry), it sits entirely ABOVE the anchor line
 *  ('top') or entirely BELOW the end line's bottom ('bottom'). The wrapper
 *  and textarea share the editor's top edge, so anchor y maps to page y via
 *  the textarea's box. */
async function expectToolbarClearOfSelection(page: Page) {
  const result = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="selection-toolbar"]');
    const ta = document.querySelector('textarea');
    if (!(bar instanceof HTMLElement) || !(ta instanceof HTMLElement)) return null;
    const box = bar.getBoundingClientRect();
    const placement = bar.getAttribute('data-placement');
    const anchorY = parseFloat(bar.style.top);
    if (!Number.isFinite(anchorY)) return null;
    const clearLine = ta.getBoundingClientRect().top + anchorY;
    return {
      horizontal: box.width > box.height,
      clear: placement === 'top'
        ? box.bottom <= clearLine + 2
        : box.top >= clearLine + 6,
    };
  });
  expect(result).not.toBeNull();
  expect(result!.horizontal).toBe(true);
  expect(result!.clear).toBe(true);
}

test.describe('selection toolbar', () => {
  test('select a word by mouse, Bold wraps it, undo reverts in one step', async ({ page }) => {
    await boot(page);
    await loadDocumentText(page, DOC);

    // Mouse selection: a double-click selects the word under the pointer
    // (native behavior — the toolbar is pointer-driven). y:60 is line 2,
    // so the selected word is "Second".
    await editor(page).dblclick({ position: { x: 70, y: 60 } });
    await expect(toolbar(page)).toBeVisible();
    await expectLiveSelection(page);

    // The bar floats over the selection, on the document's side (LTR).
    const barBox = await toolbar(page).boundingBox();
    const editorBox = await editor(page).boundingBox();
    expect(barBox && editorBox).toBeTruthy();
    expect(barBox!.x).toBeLessThan(editorBox!.x + editorBox!.width / 2);
    await expectToolbarClearOfSelection(page);

    await toolbar(page).getByRole('button', { name: 'Bold' }).click();
    await expect(editor(page)).toHaveValue(
      'Bleeding ink on paper\n**Second** line here\nThird line ends here',
    );

    // Every toolbar action is ONE native undo step — a single Mod/Ctrl+Z
    // restores the document byte-for-byte.
    await editor(page).press('ControlOrMeta+z');
    await expect(editor(page)).toHaveValue(DOC);
  });

  test('Escape dismisses and typing lands back in the editor', async ({ page }) => {
    await boot(page);
    await loadDocumentText(page, DOC);

    await editor(page).dblclick({ position: { x: 70, y: 60 } });
    await expect(toolbar(page)).toBeVisible();

    await editor(page).press('Escape');
    await expect(toolbar(page)).toHaveCount(0);
    await expect(editor(page)).toHaveValue(DOC);

    // Focus never left the editor (the toolbar can't steal it), so
    // keystrokes land immediately — replacing the still-live selection
    // ("Second", the word the dblclick selected on line 2).
    await editor(page).press('x');
    await expect(editor(page)).toHaveValue(
      'Bleeding ink on paper\nx line here\nThird line ends here',
    );
  });

  test('the toolbar flips BELOW a selection at the viewport top', async ({ page }) => {
    await boot(page);
    await loadDocumentText(page, DOC);

    // First line: no room above → placement 'bottom' (below the selection).
    await editor(page).dblclick({ position: { x: 70, y: 25 } });
    await expect(toolbar(page)).toBeVisible();
    await expect(toolbar(page)).toHaveAttribute('data-placement', 'bottom');
    await expectToolbarClearOfSelection(page);
    await editor(page).press('Escape');
    await expect(toolbar(page)).toHaveCount(0);

    // A word on a lower line has room → placement 'top' (above it).
    await editor(page).dblclick({ position: { x: 70, y: 90 } });
    await expect(toolbar(page)).toBeVisible();
    await expect(toolbar(page)).toHaveAttribute('data-placement', 'top');
    await expectToolbarClearOfSelection(page);
  });

  test('a multi-line selection keeps the toolbar above its first line', async ({ page }) => {
    await boot(page);
    await loadDocumentText(page, DOC);

    // Click at the start of line 2, shift-click into line 3 → multi-line
    // selection (spanning a newline — the caret anchor is line 2's start).
    await editor(page).click({ position: { x: 30, y: 60 } });
    await editor(page).click({
      position: { x: 220, y: 90 },
      modifiers: ['Shift'],
    });
    await expect(toolbar(page)).toBeVisible();
    await expectLiveSelection(page);
    await expect(toolbar(page)).toHaveAttribute('data-placement', 'top');
    await expectToolbarClearOfSelection(page);

    // The action hits the whole pinned multi-line range (per-line prefix
    // action: blockquote on both selected lines).
    await toolbar(page).getByRole('button', { name: 'Blockquote' }).click();
    await expect(editor(page)).toHaveValue(
      'Bleeding ink on paper\n> Second line here\n> Third line ends here',
    );
  });

  test('an RTL document shows the toolbar on the right (document direction)', async ({ page }) => {
    await boot(page);
    // The direction toggle cycles Auto → LTR → RTL; force RTL.
    const dirToggle = page.getByRole('button', { name: 'Text direction (Auto / LTR / RTL)' });
    await dirToggle.click();
    await dirToggle.click();
    await expect(editor(page)).toHaveAttribute('dir', 'rtl');

    await loadDocumentText(page, DOC_FA);
    // The first word of an RTL line sits at the top-RIGHT.
    const editorBox = await editor(page).boundingBox();
    expect(editorBox).toBeTruthy();
    await editor(page).dblclick({
      position: { x: editorBox!.width - 70, y: 60 },
    });
    await expect(toolbar(page)).toBeVisible();
    await expectLiveSelection(page);

    const barBox = await toolbar(page).boundingBox();
    expect(barBox).toBeTruthy();
    // Placement follows the DOCUMENT's direction: the bar hugs the editor's
    // right side (mirrored from the LTR case) — its RIGHT edge sits in the
    // right half (a ~12-button bar's left edge may cross the center).
    expect(barBox!.x + barBox!.width)
      .toBeGreaterThan(editorBox!.x + editorBox!.width / 2);
  });
});
