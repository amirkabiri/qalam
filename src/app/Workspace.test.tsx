// Component tests for the workspace's R8 additions: the readonly-session
// banner ("being edited in another tab") with its Take over action above the
// editor, and the document name as an inline rename when it belongs to a
// persisted record.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  describe, expect, it, vi,
} from 'vitest';
import { I18nProvider } from './i18n';
import Workspace from './Workspace';
import { useEditorController } from '../features/editor';
import type { EditorController } from '../features/editor';
import type { MarkdownPreviewState } from '../features/preview';

interface HarnessProps {
  docReadonly: boolean;
  docRenameable: boolean;
  onTakeOver: () => void;
  onRenameDoc: (name: string) => void;
  onController: (ctl: EditorController) => void;
}

function makePreviewState(): MarkdownPreviewState {
  return { html: '', toc: [], error: null } as unknown as MarkdownPreviewState;
}

function WorkspaceHarness({
  docReadonly, docRenameable, onTakeOver, onRenameDoc, onController,
}: HarnessProps) {
  const ctl = useEditorController();
  onController(ctl);
  return (
    <Workspace
      mode="split"
      editor={ctl}
      docName="Journal"
      docReadonly={docReadonly}
      docRenameable={docRenameable}
      lang="en"
      dirEditor="ltr"
      previewState={makePreviewState()}
      previewDir="ltr"
      dirMode="auto"
      theme="light"
      docIdentity="journal"
      onSpyChange={() => {}}
      onOpenDocLink={() => {}}
      onTakeOver={onTakeOver}
      onRenameDoc={onRenameDoc}
    />
  );
}

function Harness(props: HarnessProps) {
  return (
    <I18nProvider lang="en">
      <WorkspaceHarness {...props} />
    </I18nProvider>
  );
}

function setup(overrides: Partial<HarnessProps> = {}) {
  const props: HarnessProps = {
    docReadonly: false,
    docRenameable: true,
    onTakeOver: vi.fn(),
    onRenameDoc: vi.fn(),
    onController: vi.fn(),
    ...overrides,
  };
  render(<Harness {...props} />);
  return props;
}

describe('<Workspace /> split divider', () => {
  it('is a focusable separator with an exposed value and localized labels', () => {
    setup();

    const divider = screen.getByRole('separator', { name: 'Resize editor and preview panes' });
    expect(divider).toHaveAttribute('aria-valuemin', '20');
    expect(divider).toHaveAttribute('aria-valuemax', '80');
    expect(divider).toHaveAttribute('title', 'Drag to resize · double-click to reset');
  });

  it('resizes by keyboard: ArrowRight grows the editor pane in LTR', async () => {
    const user = userEvent.setup();
    localStorage.setItem('mv:split', JSON.stringify('49.00%'));
    setup();

    const divider = screen.getByRole('separator');
    expect(divider).toHaveAttribute('aria-valuenow', '49');
    divider.focus();

    await user.keyboard('{ArrowRight}');
    expect(divider).toHaveAttribute('aria-valuenow', '51');

    await user.keyboard('{Home}'); // reset to the middle
    expect(divider).toHaveAttribute('aria-valuenow', '50');
  });

  it('clamps keyboard resize at the documented max', async () => {
    const user = userEvent.setup();
    localStorage.setItem('mv:split', JSON.stringify('79.50%'));
    setup();

    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowRight}'); // would be 81.5 → clamped
    expect(divider).toHaveAttribute('aria-valuenow', '80');
  });
});

describe('<Workspace /> session banner + rename', () => {
  it('shows the readonly banner with Take over only for a readonly session', async () => {
    const props = setup({ docReadonly: true });

    expect(screen.getByRole('status')).toHaveTextContent('Being edited in another tab');
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Take over' }));
    expect(props.onTakeOver).toHaveBeenCalledTimes(1);
  });

  it('keeps the editor editable and hides the banner in edit mode', () => {
    setup({ docReadonly: false });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).not.toHaveAttribute('readonly');
  });

  it('renames the document inline from the pane head', async () => {
    const props = setup({ docRenameable: true });
    const user = userEvent.setup();

    await user.dblClick(screen.getByRole('button', { name: 'Journal' }));
    const input = screen.getByLabelText('Rename');
    await user.clear(input);
    await user.type(input, 'Journal v2{Enter}');

    expect(props.onRenameDoc).toHaveBeenCalledWith('Journal v2');
  });
});
