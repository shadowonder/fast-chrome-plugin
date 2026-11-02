import vm from 'node:vm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEMO_KEY, runPageAction } from '../src/page';
import { extensionStorage } from '../src/storage';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

const query = vi.fn();
const executeScript = vi.fn();
let pageWindow: {
  localStorage: ReturnType<typeof memoryStorage>;
  sessionStorage: ReturnType<typeof memoryStorage>;
};
beforeEach(() => {
  pageWindow = { localStorage: memoryStorage(), sessionStorage: memoryStorage() };
  query.mockReset().mockResolvedValue([{ id: 7, url: 'https://example.com/' }]);
  // Chrome serializes func: a fresh VM catches accidental outer-scope references.
  executeScript
    .mockReset()
    .mockImplementation(
      async ({ func, args }: { func: { toString(): string }; args: unknown[] }) => [
        {
          frameId: 0,
          result: vm.runInNewContext(`(${func.toString()})(...args)`, {
            args,
            document: { title: '<untrusted page title>' },
            window: pageWindow,
          }),
        },
      ],
    );
  vi.stubGlobal('chrome', { tabs: { query }, scripting: { executeScript } });
});
afterEach(() => vi.unstubAllGlobals());

it('reads the DOM through a self-contained function in the isolated top frame', async () => {
  expect(await runPageAction('title')).toBe('<untrusted page title>');
  expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  expect(executeScript).toHaveBeenCalledWith(
    expect.objectContaining({
      target: { tabId: 7 },
      world: 'ISOLATED',
      func: expect.any(Function),
    }),
  );
});

it.each(['local', 'session'] as const)(
  'reads, writes, and removes only the demo key in %sStorage',
  async (area) => {
    const store = area === 'local' ? pageWindow.localStorage : pageWindow.sessionStorage;
    const other = area === 'local' ? pageWindow.sessionStorage : pageWindow.localStorage;
    store.setItem('unrelated', 'keep me');
    expect(await runPageAction('get', area)).toBeNull();
    await runPageAction('set', area);
    expect(await runPageAction('get', area)).toBe('Hello from Fast Chrome Starter');
    expect(other.getItem(DEMO_KEY)).toBeNull();
    store.setItem(DEMO_KEY, 'plain text, not JSON');
    expect(await runPageAction('get', area)).toBe('plain text, not JSON');
    await runPageAction('remove', area);
    expect(await runPageAction('get', area)).toBeNull();
    expect(store.getItem('unrelated')).toBe('keep me');
  },
);

it('returns blocked storage and quota failures from the injected function', async () => {
  Object.defineProperty(pageWindow, 'localStorage', {
    get() {
      throw new Error('Storage blocked');
    },
  });
  await expect(runPageAction('get')).rejects.toThrow('Storage blocked');
  pageWindow.sessionStorage.setItem = () => {
    throw new Error('Quota exceeded');
  };
  await expect(runPageAction('set', 'session')).rejects.toThrow('Quota exceeded');
});

it('rejects missing tabs and unsupported pages before injection', async () => {
  query.mockResolvedValue([]);
  await expect(runPageAction('title')).rejects.toThrow('No active tab');
  for (const url of [
    undefined,
    'chrome://extensions/',
    'file:///tmp/test.html',
    'https://chromewebstore.google.com/',
    'https://chrome.google.com/webstore/detail/test',
  ]) {
    query.mockResolvedValue([{ id: 7, url }]);
    await expect(runPageAction('title')).rejects.toThrow();
  }
  expect(executeScript).not.toHaveBeenCalled();
});

it('surfaces injection restrictions and missing execution results', async () => {
  executeScript.mockRejectedValueOnce(new Error('Site access denied'));
  await expect(runPageAction('title')).rejects.toThrow('Site access denied');
  executeScript.mockResolvedValueOnce([]);
  await expect(runPageAction('title')).rejects.toThrow('No page result');
});

it('keeps optional extension storage separate and propagates Chrome API failures', async () => {
  for (const area of ['local', 'session'] as const) {
    const data: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      storage: {
        [area]: {
          get: async (key: string) => ({ [key]: data[key] }),
          set: async (items: Record<string, unknown>) => {
            Object.assign(data, items);
          },
          remove: async (key: string) => {
            delete data[key];
          },
        },
      },
    });
    const store = extensionStorage(area);
    await store.set('demo', false);
    expect(await store.get('demo')).toBe(false);
    await store.remove('demo');
    expect(await store.get('demo')).toBeUndefined();
  }
  vi.stubGlobal('chrome', {
    storage: { local: { set: vi.fn().mockRejectedValue(new Error('Quota exceeded')) } },
  });
  await expect(extensionStorage('local').set('demo', 'text')).rejects.toThrow('Quota exceeded');
});
