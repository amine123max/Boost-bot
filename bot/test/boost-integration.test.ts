import { describe, expect, test } from 'vitest';
import { memberRequestAllowed } from '../src/boost-permissions.js';
import { normalizeBotAppearance, defaultBotAppearance } from '../shared/appearance/preferences.js';
import { sampleSupportAvatar } from '../shared/appearance/supportAvatar.js';
describe('Boost integration boundaries', () => {
  test('members can chat and select models but cannot execute tools or configure credentials', () => {
    for (const [method, path] of [ ['GET', '/bots/default/chat'], ['POST', '/bots/default/chat/stream'], ['PUT', '/bots/default/chat/model'], ['POST', '/conversations/c1/stop'] ]) expect(memberRequestAllowed(method, path)).toBe(true);
    for (const [method, path] of [ ['PUT', '/bots/default/settings'], ['POST', '/tasks'], ['POST', '/channel-accounts/new-key'], ['POST', '/connections/notion/token'], ['POST', '/diagnostics/test-agent'], ['POST', '/catalog/dev'], ['PUT', '/settings'], ['GET', '/bots/default/../../tasks'] ]) expect(memberRequestAllowed(method, path)).toBe(false);
  });
  test('appearance rejects stale or malformed preferences and retains explicit defaults', () => {
    expect(normalizeBotAppearance({ animation: 'invalid', size: 999, speed: -1, customColor: 'url(x)' })).toEqual(defaultBotAppearance);
    expect(normalizeBotAppearance({ animation: 'hearts', contour: 'star', size: 64, speed: 1.5, followPointer: false })).toMatchObject({ animation: 'hearts', contour: 'star', size: 64, speed: 1.5, followPointer: false });
  });
  test('animation samples keep finite paths across every body shape', () => {
    for (let time = 0; time < 60; time += .47) {
      const pose = sampleSupportAvatar(time, { thinking: true });
      for (const path of [pose.body, pose.left, pose.right]) { expect(path).toMatch(/^M/); expect(path).not.toMatch(/NaN|Infinity|undefined/); }
    }
  });
});
