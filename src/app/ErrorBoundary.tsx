// Module: app/ErrorBoundary — the app-shell safety net. One render error
// anywhere used to unmount the WHOLE app (React unmounts to the nearest
// boundary; there was none), blanking the workspace with no recovery even
// though the document text lives in recoverable state. The boundary renders
// a minimal, i18n-ed fallback with a retry (reset + remount) affordance.
// Deliberately scoped around Shell only: provider failures above it are
// boot failures, not render failures.
import {
  Component, useCallback, useState,
  type ErrorInfo, type ReactNode,
} from 'react';

import { useT } from './i18n';

interface BoundaryState {
  failed: boolean;
}

interface BoundaryProps {
  children: ReactNode;
  /** Fallback copy (bound translator output — class components take props). */
  title: string;
  retry: string;
  onRetry: () => void;
}

class ShellErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The boundary IS the report: keep the failure on the console for
    // diagnosis (no telemetry backend exists).
    // eslint-disable-next-line no-console -- deliberate: the only failure report
    console.error('[app] render error caught by the boundary', error, info.componentStack);
  }

  render(): ReactNode {
    const { failed } = this.state;
    const {
      children,
      title,
      retry,
      onRetry,
    } = this.props;
    if (!failed) return children;
    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p
          style={{
            maxWidth: 480,
            margin: 0,
          }}
        >
          {title}
        </p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            fontFamily: 'inherit',
            fontSize: 13.5,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            cursor: 'pointer',
          }}
        >
          {retry}
        </button>
      </div>
    );
  }
}

/** The shell wrapper: i18n + the reset affordance around the class boundary. */
export default function ErrorBoundary({ children }: { children: ReactNode }) {
  const t = useT();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return (
    <ShellErrorBoundary
      key={attempt}
      title={t('appErrorTitle')}
      retry={t('appErrorRetry')}
      onRetry={retry}
    >
      {children}
    </ShellErrorBoundary>
  );
}
