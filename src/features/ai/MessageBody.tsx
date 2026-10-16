// Module: features/ai/MessageBody — the body of one AiPanel chat bubble
// (user/assistant text or the pending affordance). Plain textContent
// semantics, never dangerouslySetInnerHTML. Pure rendering — extracted from
// AiPanel's thin render shell.

import type { ChatEntry } from './chatTranscript';
import styles from './AiPanel.module.css';

interface MessageBodyProps {
  entry: ChatEntry;
  showLoading: boolean;
  loadingLabel: string | null;
  tt: (key: string) => string;
}

export default function MessageBody({
  entry,
  showLoading,
  loadingLabel,
  tt,
}: MessageBodyProps) {
  if (entry.role === 'assistant' && entry.pending && entry.text === '') {
    return (
      <div className={styles.pending}>
        <span className={styles.spinner} aria-hidden="true" />
        <span>{showLoading ? loadingLabel : tt('aiWorking')}</span>
      </div>
    );
  }
  if (entry.text !== '' || entry.failed) {
    return (
      <>
        {entry.text !== '' && <div className={styles.msgText}>{entry.text}</div>}
        {entry.failed && (
          <div className={`${styles.msgText} ${styles.msgError}`} role="alert">
            {tt('aiRequestFailed')}
          </div>
        )}
      </>
    );
  }
  return null;
}
