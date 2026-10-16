// The "What's New" dialog: a React Aria modal listing Qalam's changes —
// GitHub releases when they exist (cut by the semantic-release workflow),
// recent commits otherwise. Data loads lazily on first open via
// app/whatsNew and is then cached for the session; failures surface inline
// with a localized retry. Focus trap, Esc and aria-modal come from React
// Aria, exactly like the shortcuts cheat-sheet this dialog mirrors.
import {
  Button, Dialog, Heading, Modal,
} from 'react-aria-components';
import { useEffect, useState } from 'react';

import { useT } from './i18n';
import type { WhatsNewEntry } from './whatsNew';
import { fetchWhatsNew, formatWhatsNewDate } from './whatsNew';
import type { Lang } from '../lib/store';

import styles from './WhatsNewDialog.module.css';

export interface WhatsNewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
}

const CLOSE_BUTTON = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const EXTERNAL_ICON = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
  </svg>
);

/** "Recent commits: " prefix for commit entries (localized), else nothing. */
function entryPrefix(entry: WhatsNewEntry, commitsLabel: string): string {
  return entry.kind === 'commit' ? `${commitsLabel}: ` : '';
}

export default function WhatsNewDialog({ isOpen, onOpenChange, lang }: WhatsNewDialogProps) {
  const t = useT();
  // null = not yet fetched; 'ready' entries survive close/open, so the
  // changelog is fetched once per session (plus explicit retries).
  const [entries, setEntries] = useState<WhatsNewEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const loading = isOpen && entries === null && !error;

  useEffect(() => {
    if (!loading) return undefined;
    let cancelled = false;
    fetchWhatsNew()
      .then((loaded) => {
        if (!cancelled) setEntries(loaded);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, reloadToken]);

  const retry = () => {
    setEntries(null);
    setError(false);
    setReloadToken((token) => token + 1);
  };

  return (
    <Modal isDismissable isOpen={isOpen} onOpenChange={onOpenChange} className={styles.overlay}>
      <Dialog className={styles.dialog}>
        {({ close }) => (
          <>
            <div className={styles.head}>
              <Heading slot="title" className={styles.title}>{t('whatsNew')}</Heading>
              <Button className={styles.closeBtn} aria-label={t('close')} onPress={close}>
                {CLOSE_BUTTON}
              </Button>
            </div>

            {error && (
              <div className={styles.state}>
                <p className={styles.stateText}>{t('whatsNewError')}</p>
                <Button className={styles.retryBtn} onPress={retry}>
                  {t('whatsNewRetry')}
                </Button>
              </div>
            )}

            {loading && (
              <p className={styles.state} role="status">{t('whatsNewLoading')}</p>
            )}

            {!error && entries !== null && entries.length === 0 && (
              <p className={styles.state}>{t('whatsNewEmpty')}</p>
            )}

            {!error && entries !== null && entries.length > 0 && (
              <ol className={styles.list}>
                {entries.map((entry) => (
                  <li key={entry.id} className={styles.entry}>
                    <div className={styles.entryHead}>
                      {entry.version !== null && (
                        <span className={styles.version} dir="ltr">{entry.version}</span>
                      )}
                      <a
                        className={styles.entryTitle}
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {entryPrefix(entry, t('whatsNewCommits'))}
                        {entry.title}
                        <span className={styles.externalIcon} aria-hidden="true">{EXTERNAL_ICON}</span>
                      </a>
                      <time className={styles.date} dateTime={entry.date}>
                        {formatWhatsNewDate(entry.date, lang)}
                      </time>
                    </div>
                    {entry.items.length > 0 && (
                      <ul className={styles.items}>
                        {entry.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Dialog>
    </Modal>
  );
}
