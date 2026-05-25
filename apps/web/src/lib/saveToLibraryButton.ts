export type SaveToLibraryState = 'idle' | 'saving' | 'saved';

interface SaveToLibraryButtonView {
  label: string;
  disabled: boolean;
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
