import { describe, expect, it } from 'vitest';
import {
  getLauncherItems,
  getLauncherPlaceholder,
  getPrimaryLauncherItems,
} from './workflowLauncher';

describe('workflow launcher helpers', () => {
  it('keeps the chat-first launcher focused on existing workflows before aspirational skills', () => {
    const items = getLauncherItems();

    expect(items.map((item) => item.id)).toEqual([
      'ask-chat',
      'deep-research',
      'social-writer',
      'image-studio',
      'video-studio',
      'artifact-brief',
    ]);
    expect(items.some((item) => /god mode/i.test(item.label))).toBe(false);
    expect(items.every((item) => item.status === 'available' || item.status === 'near_existing')).toBe(true);
  });

  it('maps primary launcher items to app modes without inventing new routes', () => {
    expect(getPrimaryLauncherItems().map((item) => [item.id, item.mode])).toEqual([
      ['ask-chat', 'CHAT'],
      ['deep-research', 'DEEP_RESEARCH'],
      ['social-writer', 'SOCIAL_WRITING'],
      ['image-studio', 'IMAGE_GENERATION'],
      ['video-studio', 'VIDEO_GENERATION'],
    ]);
  });

  it('returns mode-aware composer placeholder copy', () => {
    expect(getLauncherPlaceholder('deep-research')).toBe('What should Cogentrex research with sources?');
    expect(getLauncherPlaceholder('artifact-brief')).toBe('What brief, memo, or artifact should Cogentrex draft?');
    expect(getLauncherPlaceholder('missing')).toBe('Ask Cogentrex... (Press Enter to send)');
  });
});
