import { requestGraphQL } from './graphql';
import { planningView } from './planning';
import { PLANNING_QUERY, PLANNING_ROOT_ID, PLANNING_TARGET } from './planning.config';

async function activePage(): Promise<chrome.scripting.InjectionTarget> {
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
  return { tabId: tab.id };
}

// Direct execution results, not a message transport. Every injected function
// is self-contained and receives configuration through serializable args.
async function execute<T, A extends unknown[]>(
  target: chrome.scripting.InjectionTarget,
  func: (
    ...args: A
  ) => { value: T } | { error: string } | Promise<{ value: T } | { error: string }>,
  args: A,
) {
  const [injection] = await chrome.scripting.executeScript({
    target,
    world: 'ISOLATED',
    func,
    args,
  });
  if (!injection?.result) throw new Error('No page result. Reopen the popup and retry.');
  if ('error' in injection.result) throw new Error(injection.result.error);
  return { value: injection.result.value, documentId: injection.documentId };
}

export async function isPlanningMounted(): Promise<boolean> {
  const result = await execute(await activePage(), planningView, [
    'status',
    PLANNING_TARGET,
    PLANNING_ROOT_ID,
  ]);
  return result.value;
}

export async function setPlanningView(enabled: boolean): Promise<boolean> {
  const target = await activePage();
  const initial = await execute(target, planningView, [
    enabled ? 'check' : 'remove',
    PLANNING_TARGET,
    PLANNING_ROOT_ID,
  ]);
  if (!enabled || initial.value) return initial.value;
  // Pin the request and mount to the checked document, so navigation cannot
  // send a request or mount a view in a different page midway through enabling.
  if (!initial.documentId) throw new Error('The page document is unavailable. Reopen the popup.');
  const documentTarget = { tabId: target.tabId, documentIds: [initial.documentId] };
  const connection = await execute(documentTarget, requestGraphQL, [PLANNING_QUERY]);
  const result = await execute(documentTarget, planningView, [
    'mount',
    PLANNING_TARGET,
    PLANNING_ROOT_ID,
    `GraphQL connected (HTTP ${connection.value.status}, ${Object.keys(connection.value.data).length} response field(s)).`,
  ]);
  return result.value;
}

export async function readPageToken(): Promise<string> {
  const result = await execute(
    await activePage(),
    (): { value: string } | { error: string } => {
      try {
        const token = sessionStorage.getItem('idToken');
        if (!token?.trim()) return { error: 'No idToken is available in webpage sessionStorage.' };
        return { value: token };
      } catch {
        return { error: 'The webpage sessionStorage is inaccessible.' };
      }
    },
    [],
  );
  return result.value;
}
