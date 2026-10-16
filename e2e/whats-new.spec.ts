import {
  expect, test,
} from '@playwright/test';

/**
 * The "What's New" dialog against the production build: the topbar gift
 * button opens the modal, api.github.com is intercepted (the live network is
 * never touched), and releases render with version chip + note bullets. A
 * second journey covers the commits fallback and the error+retry state.
 */

const RELEASES = [
  {
    name: 'v1.1.0 — What\u2019s New',
    tag_name: 'v1.1.0',
    published_at: '2026-10-16T12:00:00Z',
    html_url: 'https://github.com/amirkabiri/qalam/releases/v1.1.0',
    body: '* **ui:** add the What\u2019s New dialog\n* fix: selection toolbar focus',
  },
];

const COMMITS = [
  {
    sha: 'abc1234def5678',
    html_url: 'https://github.com/amirkabiri/qalam/commit/abc1234',
    commit: {
      message: 'feat(ui): something\n\nbody',
      author: { date: '2026-10-15T08:30:00Z' },
    },
  },
];

interface RouteFulfill {
  status: number;
  contentType: string;
  body: string;
}

function fulfillJson(body: unknown): RouteFulfill {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

test.describe("what's new dialog", () => {
  test('gift button opens the modal and lists the releases', async ({ page }) => {
    await page.route('**/api.github.com/repos/amirkabiri/qalam/releases**', async (route) => {
      await route.fulfill(fulfillJson(RELEASES));
    });
    await page.route('**/api.github.com/repos/amirkabiri/qalam/commits**', async (route) => {
      await route.fulfill(fulfillJson([]));
    });
    await page.goto('/');
    await expect(page.getByRole('textbox')).toHaveValue(/# Qalam/);

    await page.getByRole('button', { name: "What's new" }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: "What's new" })).toBeVisible();
    await expect(dialog.getByText('v1.1.0 — What\u2019s New')).toBeVisible();
    await expect(dialog.getByText('ui: add the What\u2019s New dialog')).toBeVisible();

    // Esc closes the RAC modal (focus trap + dismiss keyboard contract).
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('falls back to recent commits when no release exists', async ({ page }) => {
    await page.route('**/api.github.com/repos/amirkabiri/qalam/releases**', async (route) => {
      await route.fulfill(fulfillJson([]));
    });
    await page.route('**/api.github.com/repos/amirkabiri/qalam/commits**', async (route) => {
      await route.fulfill(fulfillJson(COMMITS));
    });
    await page.goto('/');

    await page.getByRole('button', { name: "What's new" }).click();

    await expect(
      page.getByRole('dialog').getByText('Recent commits: feat(ui): something'),
    ).toBeVisible();
  });

  test('shows the inline error state and recovers on Retry', async ({ page }) => {
    let failing = true;
    await page.route('**/api.github.com/repos/amirkabiri/qalam/releases**', async (route) => {
      if (failing) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"rate limited"}' });
        return;
      }
      await route.fulfill(fulfillJson(RELEASES));
    });
    await page.goto('/');

    await page.getByRole('button', { name: "What's new" }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText("Couldn't load the changelog from GitHub.")).toBeVisible();

    failing = false;
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByText('v1.1.0 — What\u2019s New')).toBeVisible();
  });
});
