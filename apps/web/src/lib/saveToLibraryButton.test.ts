import { describe, expect, it } from 'vitest';
import { getSaveToLibraryButtonView } from './saveToLibraryButton';

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
});
