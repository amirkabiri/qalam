// Component tests for the app-shell ErrorBoundary: a render error anywhere
// under the boundary must produce the recovery fallback (never a blank page),
// and Retry must remount the subtree.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import ErrorBoundary from './ErrorBoundary';
import { I18nProvider } from './i18n';

/** Throws while `armed` (the failure probe). */
let armed = true;
function Bomb() {
  if (armed) throw new Error('boom');
  return <p>recovered</p>;
}

function renderBoundary(ui: React.ReactNode): void {
  render(
    <I18nProvider lang="en">
      <ErrorBoundary>{ui}</ErrorBoundary>
    </I18nProvider>,
  );
}

afterEach(() => {
  armed = true;
  vi.restoreAllMocks();
});

describe('<ErrorBoundary />', () => {
  it('renders the fallback (not a blank page) when a child throws on render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderBoundary(<Bomb />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Something went wrong/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('Retry remounts the subtree — a healed child renders again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderBoundary(<Bomb />);

    // First render throws, the boundary catches, the fallback shows.
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Retry remounts; with the probe healed, the subtree renders.
    armed = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('recovered')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('passes children through untouched when nothing throws', () => {
    renderBoundary(<p>fine</p>);

    expect(screen.getByText('fine')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
