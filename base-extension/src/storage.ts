// Optional extension-owned storage; unrelated to the webpage storage demo.
// Use from the popup or a future worker. Session is not exposed to content
// scripts by default. Chrome API failures reject the returned promises.
export function extensionStorage(area: 'local' | 'session') {
  return {
    async get(key: string): Promise<unknown> {
      return (await chrome.storage[area].get(key))[key];
    },
    async set(key: string, value: string | number | boolean | null): Promise<void> {
      await chrome.storage[area].set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await chrome.storage[area].remove(key);
    },
  };
}

export type PopupTab = 'planning' | 'token';

export async function loadPopupTab(): Promise<PopupTab> {
  return (await extensionStorage('local').get('selectedPopupTab')) === 'token'
    ? 'token'
    : 'planning';
}

export async function savePopupTab(tab: PopupTab): Promise<void> {
  await extensionStorage('local').set('selectedPopupTab', tab);
}
