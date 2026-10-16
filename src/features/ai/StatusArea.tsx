// Module: features/ai/StatusArea — the AiPanel status strip above the
// messages: the external readiness line, or the builtin availability machine
// (checking / unavailable / downloadable / downloading / available). Pure
// rendering — extracted from AiPanel's thin render shell.

import { Button, ProgressBar } from 'react-aria-components';
import { isExternalReady } from '../../lib/ai/settings';
import type { ProviderSettings } from '../../lib/ai/types';
import type { BuiltinAi } from './useBuiltinAi';
import styles from './AiPanel.module.css';

interface StatusAreaProps {
  settings: ProviderSettings;
  builtin: BuiltinAi;
  consentDeclined: boolean;
  tt: (key: string) => string;
  onDownload: () => void;
}

export default function StatusArea({
  settings,
  builtin,
  consentDeclined,
  tt,
  onDownload,
}: StatusAreaProps) {
  if (settings.provider !== 'builtin') {
    const ready = isExternalReady(settings);
    return (
      <p className={ready ? `${styles.statusNote} ${styles.statusOk}` : styles.statusNote}>
        {ready ? tt('aiReady') : tt('aiSettingsIncomplete')}
      </p>
    );
  }
  const percent = builtin.downloadPercent;
  if (builtin.availability === 'checking') {
    return <p className={styles.statusNote}>{tt('aiChecking')}</p>;
  }
  if (builtin.availability === 'unavailable') {
    return <p className={styles.statusNote}>{tt('aiUnavailableExplainer')}</p>;
  }
  if (builtin.availability === 'downloading') {
    return (
      <>
        <p className={styles.statusNote}>
          {tt('aiDownloadProgress')}
          {percent >= 0 ? ` ${percent}%` : ''}
        </p>
        <ProgressBar
          aria-label={tt('aiDownloadProgress')}
          minValue={0}
          maxValue={100}
          value={percent >= 0 ? percent : undefined}
          className={styles.progressBar}
        >
          <div className={styles.bar}>
            <div
              className={percent >= 0 ? styles.barFill : `${styles.barFill} ${styles.barIndet}`}
              style={percent >= 0 ? { width: `${percent}%` } : undefined}
            />
          </div>
        </ProgressBar>
      </>
    );
  }
  if (builtin.availability === 'downloadable') {
    return (
      <>
        {consentDeclined && <p className={styles.statusNote}>{tt('aiUnavailableExplainer')}</p>}
        <Button onPress={onDownload} className={styles.downloadButton}>
          {tt('aiDownloadModel')}
        </Button>
      </>
    );
  }
  return null; // 'available' — nothing to explain
}
