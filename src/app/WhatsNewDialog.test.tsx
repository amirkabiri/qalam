// Component tests for the What's New dialog: releases render as a localized
// list (version chip, date, flattened note bullets), the commits fallback
// labeling, lazy fetch on open (cached after close), the inline error state
// with retry, and the FA mirroring — same RAC skeleton as ShortcutsDialog.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';

import { I18nProvider } from './i18n';
import WhatsNewDialog from './WhatsNewDialog';

interface GhReleaseFixture {
  name: string | null;
  tag_name: string;
  published_at: string | null;
  html_url: string;
  body: string | null;
}

const RELEASE: GhReleaseFixture = {
  name: 'v1.1.0 — What\u2019s New',
  tag_name: 'v1.1.0',
  published_at: '2026-10-16T12:00:00Z',
  html_url: 'https://github.com/amirkabiri/qalam/releases/v1.1.0',
  body: '* **ui:** add the What\u2019s New dialog\n* fix: selection toolbar focus',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface SetupOpts {
  lang?: 'en' | 'fa';
  fetchMock?: (url: string) => Promise<Response>;
}

function setup({ lang = 'en', fetchMock }: SetupOpts = {}) {
  const onOpenChange = vi.fn();
  const fetchImpl = vi.fn(fetchMock ?? (async () => jsonResponse([RELEASE])));
  vi.stubGlobal('fetch', fetchImpl);
  render(
    <I18nProvider lang={lang}>
      <WhatsNewDialog isOpen onOpenChange={onOpenChange} lang={lang} />
    </I18nProvider>,
  );
  return { onOpenChange, fetchImpl };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<WhatsNewDialog />', () => {
  it('lists releases with version chip, date, bullets and links', async () => {
    setup();

    expect(screen.getByRole('heading', { name: "What's new" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    });
    expect(screen.getByText('v1.1.0 — What\u2019s New')).toHaveAttribute(
      'href',
      'https://github.com/amirkabiri/qalam/releases/v1.1.0',
    );
    expect(screen.getByText('ui: add the What\u2019s New dialog')).toBeInTheDocument();
    expect(screen.getByText('fix: selection toolbar focus')).toBeInTheDocument();
    // Locale-formatted date (medium style) — year shows in the en-US row.
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('labels commit-fallback entries and fetches the commits endpoint', async () => {
    setup({
      fetchMock: async (url) => (
        url.includes('/releases')
          ? jsonResponse([])
          : jsonResponse([{
            sha: 'abc1234def5678',
            html_url: 'https://github.com/amirkabiri/qalam/commit/abc1234',
            commit: { message: 'feat(ui): something\n\nbody', author: { date: '2026-10-15T08:30:00Z' } },
          }])
      ),
    });

    await waitFor(() => {
      expect(screen.getByText('Recent commits: feat(ui): something')).toBeInTheDocument();
    });
  });

  it('fetches lazily on open and caches across close/reopen', async () => {
    const onOpenChange = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse([RELEASE]));
    vi.stubGlobal('fetch', fetchImpl);

    const { rerender } = render(
      <I18nProvider lang="en">
        <WhatsNewDialog isOpen={false} onOpenChange={onOpenChange} lang="en" />
      </I18nProvider>,
    );
    // Closed: nothing fetched, nothing rendered.
    expect(fetchImpl).not.toHaveBeenCalled();

    rerender(
      <I18nProvider lang="en">
        <WhatsNewDialog isOpen onOpenChange={onOpenChange} lang="en" />
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Reopen after close: the session cache serves the list, no refetch.
    rerender(
      <I18nProvider lang="en">
        <WhatsNewDialog isOpen={false} onOpenChange={onOpenChange} lang="en" />
      </I18nProvider>,
    );
    rerender(
      <I18nProvider lang="en">
        <WhatsNewDialog isOpen onOpenChange={onOpenChange} lang="en" />
      </I18nProvider>,
    );
    expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when GitHub returns no releases or commits', async () => {
    setup({ fetchMock: async () => jsonResponse([]) });

    await waitFor(() => {
      expect(screen.getByText('No releases yet.')).toBeInTheDocument();
    });
  });

  it('surfaces the error state and refetches on Retry', async () => {
    const user = userEvent.setup();
    let failing = true;
    const { fetchImpl } = setup({
      fetchMock: async () => {
        if (failing) return jsonResponse({ message: 'rate limited' }, 403);
        return jsonResponse([RELEASE]);
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Couldn't load the changelog from GitHub.")).toBeInTheDocument();
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    failing = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('mirrors into Persian: localized labels and FA-digit dates', async () => {
    setup({ lang: 'fa' });

    expect(screen.getByRole('heading', { name: 'چه چیزهایی تازه است' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    });
    // The FA locale renders the date with Persian digits.
    expect(screen.getByText(/[\u06F0-\u06F9]/)).toBeInTheDocument();
  });
});
