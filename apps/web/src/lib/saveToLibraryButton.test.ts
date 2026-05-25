import { describe, expect, it } from 'vitest';
import {
  canShowSaveToLibraryButton,
  getEffectiveSaveToLibraryState,
  getSaveToLibraryButtonTestId,
  getSaveToLibraryButtonView,
} from './saveToLibraryButton';

describe('getSaveToLibraryButtonView', () => {
  it('keeps the saved state visible and disabled after a successful save', () => {
    expect(getSaveToLibraryButtonView('saved')).toEqual({
      label: '✓ Saved',
      disabled: true,
    });
  });

  it('uses an explicit saving state while the request is in flight', () => {
    expect(getSaveToLibraryButtonView('saving')).toEqual({
      label: 'Saving…',
      disabled: true,
    });
  });

  it('allows saving before an artifact exists for the message', () => {
    expect(getSaveToLibraryButtonView('idle')).toEqual({
      label: 'Save to Library',
      disabled: false,
    });
  });

  it('treats an already persisted message artifact as saved', () => {
    expect(getEffectiveSaveToLibraryState('idle', true)).toBe('saved');
    expect(getEffectiveSaveToLibraryState('saving', true)).toBe('saved');
    expect(getEffectiveSaveToLibraryState('idle', false)).toBe('idle');
  });

  it('only shows the save action for persisted non-loading assistant output', () => {
    expect(canShowSaveToLibraryButton({ id: 'msg-1', content: 'Reusable answer', isError: false, isLoading: false })).toBe(true);
    expect(canShowSaveToLibraryButton({ id: 'local-msg-1', content: 'Still optimistic', isError: false, isLoading: false })).toBe(false);
    expect(canShowSaveToLibraryButton({ id: 'msg-1', content: 'Thinking...', isError: false, isLoading: false })).toBe(false);
    expect(canShowSaveToLibraryButton({ id: 'msg-1', content: 'Generation failed', isError: true, isLoading: false })).toBe(false);
    expect(canShowSaveToLibraryButton({ id: 'msg-1', content: 'Generating image...', isError: false, isLoading: true })).toBe(false);
  });

  it('builds stable message-scoped test ids for save-to-library smoke checks', () => {
    expect(getSaveToLibraryButtonTestId('msg-123')).toBe('save-to-library-msg-123');
    expect(getSaveToLibraryButtonTestId('msg/with space')).toBe('save-to-library-msg-with-space');
  });
});
