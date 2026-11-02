export const DEMO_KEY = 'fast-chrome-starter:demo';

// Query on every click so actions use the current tab and activeTab grant.
export async function runPageAction(
  action: 'title' | 'get' | 'set' | 'remove',
  area: 'local' | 'session' = 'local',
): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab is available.');
  if (!tab.url || !/^https?:\/\//i.test(tab.url)) {
    throw new Error('Open a regular HTTP or HTTPS webpage and reopen the popup to grant access.');
  }
  const url = new URL(tab.url);
  if (
    url.hostname === 'chromewebstore.google.com' ||
    (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
  ) {
    throw new Error('Chrome does not allow extensions to run on the Chrome Web Store.');
  }

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'ISOLATED',
    // Chrome copies this function into the webpage. It must not reference
    // imports or outer variables: pass values through args instead.
    func: (
      action: 'title' | 'get' | 'set' | 'remove',
      area: 'local' | 'session',
      key: string,
      value: string,
    ) => {
      try {
        if (action === 'title') return { value: document.title };
        const storage = area === 'local' ? window.localStorage : window.sessionStorage;
        if (action === 'get') return { value: storage.getItem(key) };
        if (action === 'set') {
          storage.setItem(key, value);
          return { value: `Saved demo key in webpage ${area}Storage.` };
        }
        storage.removeItem(key);
        return { value: `Removed demo key from webpage ${area}Storage.` };
      } catch (error) {
        // Return page errors explicitly; Chrome may omit the result when an
        // injected function throws (e.g. blocked storage or quota exceeded).
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
    args: [action, area, DEMO_KEY, 'Hello from Fast Chrome Starter'],
  });
  const result = injection?.result;
  if (!result)
    throw new Error('No page result. The tab may have navigated; reopen the popup and retry.');
  if (result.error !== undefined) throw new Error(result.error);
  return result.value;
}
