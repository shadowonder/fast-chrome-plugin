import { afterEach, expect, it, vi } from 'vitest';
import { loadPopupTab, savePopupTab } from '../src/storage';
import { copyToken } from '../src/popup/Popup';

afterEach(() => vi.unstubAllGlobals());
it('persists only the tab preference and restores it with a safe default', async () => {
  const data: Record<string, unknown> = {};
  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(data, items);
  });
  vi.stubGlobal('chrome', {
    storage: { local: { get: async (key: string) => ({ [key]: data[key] }), set } },
  });
  expect(await loadPopupTab()).toBe('planning');
  await savePopupTab('token');
  expect(await loadPopupTab()).toBe('token');
  expect(set).toHaveBeenCalledExactlyOnceWith({ selectedPopupTab: 'token' });
  await savePopupTab('planning');
  expect(await loadPopupTab()).toBe('planning');
  data.selectedPopupTab = 'invalid';
  expect(await loadPopupTab()).toBe('planning');
});
it('copies the full token only on request and handles clipboard rejection', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  await copyToken('mock-id-token');
  expect(writeText).toHaveBeenCalledExactlyOnceWith('mock-id-token');
  await expect(copyToken('')).rejects.toThrow('No token');
  writeText.mockRejectedValue(new Error('Permission denied'));
  await expect(copyToken('mock-id-token')).rejects.toThrow('copy it manually');
});
