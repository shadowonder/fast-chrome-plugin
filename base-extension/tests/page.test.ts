import vm from 'node:vm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isPlanningMounted, readPageToken, setPlanningView } from '../src/page';

const query = vi.fn();
const executeScript = vi.fn();
beforeEach(() => {
  query.mockReset().mockResolvedValue([{ id: 7, url: 'https://example.test/' }]);
  executeScript.mockReset();
  vi.stubGlobal('chrome', { tabs: { query }, scripting: { executeScript } });
});
afterEach(() => vi.unstubAllGlobals());

it('reads actual mounted state without GraphQL or token access', async () => {
  executeScript.mockResolvedValue([{ result: { value: true }, documentId: 'doc-1' }]);
  expect(await isPlanningMounted()).toBe(true);
  expect(executeScript).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      world: 'ISOLATED',
      target: { tabId: 7 },
      args: expect.arrayContaining(['status']),
    }),
  );
});

it('checks target, fetches once, and mounts only in the original document with safe metadata', async () => {
  executeScript
    .mockResolvedValueOnce([{ result: { value: false }, documentId: 'doc-1' }])
    .mockResolvedValueOnce([
      {
        result: { value: { data: { __typename: 'Query', secret: 'mock-id-token' }, status: 200 } },
        documentId: 'doc-1',
      },
    ])
    .mockResolvedValueOnce([{ result: { value: true }, documentId: 'doc-1' }]);
  expect(await setPlanningView(true)).toBe(true);
  const calls = executeScript.mock.calls;
  expect(calls).toHaveLength(3);
  expect(calls[0]![0].args[0]).toBe('check');
  expect(calls[1]![0].target).toEqual({ tabId: 7, documentIds: ['doc-1'] });
  expect(calls[2]![0].target).toEqual({ tabId: 7, documentIds: ['doc-1'] });
  expect(calls[2]![0].args[3]).toBe('GraphQL connected (HTTP 200, 2 response field(s)).');
  expect(JSON.stringify(calls[2]![0].args)).not.toContain('mock-id-token');
});

it('does not fetch for an existing mount, missing target, or removal', async () => {
  executeScript.mockResolvedValueOnce([{ result: { value: true } }]);
  expect(await setPlanningView(true)).toBe(true);
  expect(executeScript).toHaveBeenCalledTimes(1);
  executeScript
    .mockClear()
    .mockResolvedValueOnce([{ result: { error: 'Planning target not found' } }]);
  await expect(setPlanningView(true)).rejects.toThrow('target not found');
  expect(executeScript).toHaveBeenCalledTimes(1);
  executeScript.mockClear().mockResolvedValueOnce([{ result: { value: false } }]);
  expect(await setPlanningView(false)).toBe(false);
  expect(executeScript).toHaveBeenCalledTimes(1);
  expect(executeScript.mock.calls[0]![0].args[0]).toBe('remove');
});

it('does not mount if GraphQL fails or the checked page navigates away', async () => {
  executeScript
    .mockResolvedValueOnce([{ result: { value: false }, documentId: 'doc-1' }])
    .mockResolvedValueOnce([{ result: { error: 'Authentication failed' } }]);
  await expect(setPlanningView(true)).rejects.toThrow('Authentication failed');
  expect(executeScript).toHaveBeenCalledTimes(2);
  executeScript
    .mockClear()
    .mockResolvedValueOnce([{ result: { value: false }, documentId: 'doc-1' }])
    .mockRejectedValueOnce(new Error('No document with ID doc-1'));
  await expect(setPlanningView(true)).rejects.toThrow('No document');
  expect(executeScript).toHaveBeenCalledTimes(2);
});

it('reads a full mock token with a serialized function, reporting missing or blocked storage', async () => {
  let token: string | null = 'mock-id-token';
  let blocked = false;
  executeScript.mockImplementation(async ({ func }: { func: { toString(): string } }) => [
    {
      result: vm.runInNewContext(`(${func.toString()})()`, {
        sessionStorage: {
          getItem: (key: string) => {
            expect(key).toBe('idToken');
            if (blocked) throw new Error('denied');
            return token;
          },
        },
      }),
    },
  ]);
  expect(await readPageToken()).toBe('mock-id-token');
  token = ' ';
  await expect(readPageToken()).rejects.toThrow('No idToken');
  blocked = true;
  await expect(readPageToken()).rejects.toThrow('inaccessible');
});

it('handles unsupported pages, missing tabs/results, and injection denial', async () => {
  query.mockResolvedValue([]);
  await expect(readPageToken()).rejects.toThrow('No active tab');
  for (const url of [
    undefined,
    'chrome://extensions/',
    'file:///tmp/test.html',
    'https://chromewebstore.google.com/',
    'https://chrome.google.com/webstore/detail/test',
  ]) {
    query.mockResolvedValue([{ id: 7, url }]);
    await expect(readPageToken()).rejects.toThrow();
  }
  expect(executeScript).not.toHaveBeenCalled();
  query.mockResolvedValue([{ id: 7, url: 'https://example.test/' }]);
  executeScript.mockResolvedValueOnce([]);
  await expect(readPageToken()).rejects.toThrow('No page result');
  executeScript.mockRejectedValueOnce(new Error('Site access denied'));
  await expect(readPageToken()).rejects.toThrow('Site access denied');
});
