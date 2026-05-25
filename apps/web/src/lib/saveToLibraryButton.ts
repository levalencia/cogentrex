export type SaveToLibraryState = 'idle' | 'saving' | 'saved';

interface SaveToLibraryButtonView {
  label: string;
  disabled: boolean;
}

interface SaveToLibraryEligibilityInput {
  id: string | undefined;
  content: string | undefined;
  isError: boolean;
  isLoading: boolean;
}

export function getEffectiveSaveToLibraryState(state: SaveToLibraryState, hasSavedArtifact: boolean): SaveToLibraryState {
  return hasSavedArtifact ? 'saved' : state;
}

export function getSaveToLibraryButtonView(state: SaveToLibraryState): SaveToLibraryButtonView {
  if (state === 'saving') {
    return { label: 'Saving…', disabled: true };
  }

  if (state === 'saved') {
    return { label: '✓ Saved', disabled: true };
  }

  return { label: 'Save to Library', disabled: false };
}

export function canShowSaveToLibraryButton(input: SaveToLibraryEligibilityInput): boolean {
  return Boolean(
    input.id
    && input.content
    && !input.id.startsWith('local-')
    && !input.content.startsWith('Thinking')
    && !input.isError
    && !input.isLoading,
  );
}

export function getSaveToLibraryButtonTestId(messageId: string): string {
  const safeMessageId = messageId.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `save-to-library-${safeMessageId || 'message'}`;
}
