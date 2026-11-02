import vm from 'node:vm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestGraphQL } from '../src/graphql';

const fetchMock = vi.fn();
let storage: { getItem: () => string | null };
beforeEach(() => {
  storage = { getItem: () => 'mock-id-token' };
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { __typename: 'Query' } }),
  });
});
afterEach(() => vi.unstubAllGlobals());
// Run the actual helper as Chrome would: serialized, without popup imports.
function request(query = 'query { __typename }', variables?: Record<string, unknown>) {
  return vm.runInNewContext(`(${requestGraphQL.toString()})(query, variables)`, {
    query,
    variables,
    sessionStorage: storage,
    fetch: fetchMock,
    URL,
    AbortSignal,
    window: { location: { origin: 'https://example.test' } },
  }) as ReturnType<typeof requestGraphQL>;
}

it('posts query and optional variables to the page origin, keeping credentials same-origin', async () => {
  expect(await request('query Demo($n: Int) { __typename }', { n: 1 })).toEqual({
    value: { data: { __typename: 'Query' }, status: 200 },
  });
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe('https://example.test/graphql');
  expect(options).toMatchObject({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-id-token' },
    credentials: 'same-origin',
    mode: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
  });
  expect(JSON.parse(options.body)).toEqual({
    query: 'query Demo($n: Int) { __typename }',
    variables: { n: 1 },
  });
  await request();
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ query: 'query { __typename }' });
});

it('rejects missing/empty tokens and inaccessible session storage without making a request', async () => {
  for (const token of [null, '', '   ']) {
    storage.getItem = () => token;
    expect(await request()).toHaveProperty('error', expect.stringContaining('No idToken'));
  }
  storage.getItem = () => {
    throw new Error('mock-id-token');
  };
  expect(await request()).toEqual({ error: 'The webpage sessionStorage is inaccessible.' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([401, 403, 500])('handles HTTP %s without exposing response bodies', async (status) => {
  const json = vi.fn();
  fetchMock.mockResolvedValue({ ok: false, status, json });
  const result = await request();
  expect(result).toHaveProperty('error', expect.stringContaining(`HTTP ${status}`));
  expect(json).not.toHaveBeenCalled();
});

it('sanitizes network, redirect, and GraphQL errors instead of echoing sensitive details', async () => {
  fetchMock.mockRejectedValueOnce(new Error('mock-id-token'));
  expect(await request()).toEqual({
    error: 'GraphQL request failed: network, timeout, or redirect blocked.',
  });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ data: null, errors: [{ message: 'mock-id-token' }] }),
  });
  expect(await request()).toEqual({ error: 'GraphQL returned 1 error(s).' });
});

it('rejects malformed JSON and invalid GraphQL data', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('parse');
    },
  });
  expect(await request()).toEqual({ error: 'GraphQL response is not valid JSON.' });
  for (const body of [null, {}, { data: [] }, { data: null }]) {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
    expect(await request()).toHaveProperty('error');
  }
});
