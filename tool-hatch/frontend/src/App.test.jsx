import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StringService } from '../bindings/github.com/shadowonder/fast-chrome-plugin/tool-hatch';
import App from './App.jsx';
import { Clipboard } from '@wailsio/runtime';

vi.mock('../bindings/github.com/shadowonder/fast-chrome-plugin/tool-hatch', () => ({
  StringService: { Process: vi.fn() },
}));

vi.mock('@wailsio/runtime', () => ({ Clipboard: { SetText: vi.fn() } }));
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false, media: query, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  })),
});
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root, requests;
const input = () => container.querySelector('textarea:not([readonly])');
const output = () => container.querySelector('textarea[readonly]');
const status = () => container.querySelector('.status[role="status"]');
const apply = () => container.querySelector('.apply');
const manual = () => container.querySelector('input[type="checkbox"]');

async function edit(value) {
  await act(async () => {
    // Use the native setter so React observes the input event as a user edit.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(element) {
  await act(async () => element.click());
}

async function resolve(index, result, metadata = {}) {
  await act(async () => requests[index].resolve({
    result,
    metadata: { operation: requests[index].operation, success: true, message: 'Processed.', ...metadata },
  }));
}

beforeEach(async () => {
  requests = [];
  window.localStorage.clear();
  Clipboard.SetText.mockReset().mockResolvedValue(undefined);
  StringService.Process.mockReset().mockImplementation((text, operation, namespacePrefix) => new Promise((resolve, reject) => {
    requests.push({ text, operation, namespacePrefix, resolve, reject });
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
  await resolve(0, '');
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('String tool', () => {
  it('shows only the Avro operation and processes input automatically without blocking typing', async () => {
    expect(apply().disabled).toBe(true);
    expect(manual().checked).toBe(false);
    expect(status().textContent).toBe('Done');
    expect(status().classList.contains('done')).toBe(true);
    await edit(' Mixed ');
    expect(requests.at(-1)).toMatchObject({ text: ' Mixed ', operation: 'avro-to-plain' });
    expect(input().disabled).toBe(false);
    expect(status().textContent).toBe('Processing…');
    const options = container.querySelector('select[aria-label="Operation"]').options;
    expect([...options].map((item) => item.textContent)).toEqual(['Avro JSON → Plain JSON']);
    await resolve(1, 'Mixed');
    expect(output().value).toBe('Mixed');
    expect(output().readOnly).toBe(true);
  });

  it('ignores outdated successes and failures after a newer response', async () => {
    await edit('old');
    await edit('middle');
    await edit('latest');
    await resolve(3, 'latest');
    await resolve(1, 'old');
    await act(async () => requests[2].reject(new Error('Old transport failure')));
    expect(output().value).toBe('latest');
    expect(status().textContent).toBe('Done');
  });

  it('does not show an old automatic response while the newest request is pending', async () => {
    await edit('old');
    await edit('new');
    await resolve(1, 'old');
    expect(output().value).toBe('');
    expect(status().textContent).toBe('Processing…');
    await resolve(2, 'new');
    expect(output().value).toBe('new');
  });

  it('only runs Apply in manual mode and automatically resumes with the current values', async () => {
    await click(manual());
    expect(apply().disabled).toBe(false);
    await edit('manual input');
    expect(requests).toHaveLength(1);
    await click(apply());
    expect(requests[1]).toMatchObject({ text: 'manual input', operation: 'avro-to-plain' });
    await resolve(1, 'MANUAL INPUT');
    expect(output().value).toBe('MANUAL INPUT');
    await click(manual());
    expect(requests).toHaveLength(3);
    expect(apply().disabled).toBe(true);
    await resolve(2, 'MANUAL INPUT');
    expect(status().textContent).toBe('Done');
  });

  it('invalidates pending automatic work when manual mode is selected', async () => {
    await edit('pending');
    await click(manual());
    await resolve(1, 'stale');
    expect(output().value).toBe('');
    expect(status().textContent).toBe('Ready — click Apply.');
  });

  it('invalidates pending manual work on edits and keeps only the newest Apply', async () => {
    await click(manual());
    await edit('old');
    await click(apply());
    await edit('new');
    await resolve(1, 'old');
    expect(output().value).toBe('');
    await click(apply());
    await click(apply());
    await resolve(3, 'new');
    await resolve(2, 'outdated Apply');
    expect(output().value).toBe('new');
    expect(status().textContent).toBe('Done');
  });

  it('shows the backend failure reason in the error status and can recover', async () => {
    await edit('input');
    await resolve(1, '', { success: false, message: 'Operation unavailable.' });
    expect(status().textContent).toBe('Operation unavailable.');
    expect(status().classList.contains('error')).toBe(true);
    await edit('recovered');
    await resolve(2, 'recovered');
    expect(status().textContent).toBe('Done');
    expect(output().value).toBe('recovered');
  });

  it('handles rejected or malformed transport responses without crashing', async () => {
    await edit('input');
    await act(async () => requests[1].reject(new Error('Bridge disconnected')));
    expect(status().textContent).toBe('Could not process the string. Please try again.');
    expect(output().value).toBe('');
    await edit('another');
    await act(async () => requests[2].resolve(null));
    expect(status().classList.contains('error')).toBe(true);
    expect(input().value).toBe('another');
  });

  it('handles StrictMode effect replay without accepting the abandoned response', async () => {
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<StrictMode><App /></StrictMode>));
    expect(requests).toHaveLength(3);
    await resolve(2, 'current');
    await resolve(1, 'abandoned');
    expect(output().value).toBe('current');
  });
});


describe('JSON, copy and theme', () => {
  const copyInput = () => container.querySelector('[aria-label="Copy Input"]');
  const copyOutput = () => container.querySelector('[aria-label="Copy Output"]');

  it('sends JSON to Go, shows the converted response, and clears stale output on malformed input', async () => {
    await edit('{"b":{"long":1},"a":{"array":[true]}}');
    expect(requests.at(-1)).toMatchObject({ text: '{"b":{"long":1},"a":{"array":[true]}}', operation: 'avro-to-plain' });
    const formatted = '{\n  "b": 1,\n  "a": [\n    true\n  ]\n}';
    await resolve(1, formatted);
    expect(output().value).toBe(formatted);
    expect(copyOutput().disabled).toBe(false);
    await edit('{"b":');
    expect(output().value).toBe('');
    expect(copyOutput().disabled).toBe(true);
    await resolve(2, '', { success: false, message: 'Invalid JSON: unexpected end of JSON input' });
    expect(status().textContent).toContain('Invalid JSON: unexpected end');
    expect(status().classList.contains('error')).toBe(true);
    expect(output().value).toBe('');
  });

  it('does not process JSON changes in manual mode, and discards an older invalid-JSON response', async () => {
    await click(manual());
    await edit('{');
    expect(requests).toHaveLength(1);
    await click(apply());
    await edit('{}');
    await click(apply());
    await resolve(2, '{}');
    await resolve(1, '', { success: false, message: 'Invalid JSON' });
    expect(output().value).toBe('{}');
    expect(status().textContent).toBe('Done');
  });

  it('copies the complete input and complete output with independent success feedback', async () => {
    const full = '  first line\nsecond line 世界\n';
    await edit(full);
    await resolve(1, full);
    await click(copyInput());
    expect(Clipboard.SetText).toHaveBeenLastCalledWith(full);
    expect(copyInput().textContent).toBe('Copied');
    await click(copyOutput());
    expect(Clipboard.SetText).toHaveBeenCalledTimes(2);
    expect(Clipboard.SetText).toHaveBeenLastCalledWith(full);
    expect(copyOutput().textContent).toBe('Copied');
    expect(input().value).toBe(full);
    expect(output().readOnly).toBe(true);
    expect(status().textContent).toBe('Done');
  });

  it('copies valid empty results but disables output copy for pending or failed processing', async () => {
    await click(copyOutput());
    expect(Clipboard.SetText).toHaveBeenLastCalledWith('');
    await edit('pending');
    expect(copyOutput().disabled).toBe(true);
    await resolve(1, '', { success: false, message: 'Failed.' });
    expect(copyOutput().disabled).toBe(true);
    await click(copyOutput());
    expect(Clipboard.SetText).toHaveBeenCalledTimes(1);
  });

  it('handles clipboard rejection without changing the processing result and permits retry', async () => {
    Clipboard.SetText.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    await click(copyInput());
    expect(container.textContent).toContain('Copy failed');
    expect(status().textContent).toBe('Done');
    expect(copyInput().disabled).toBe(false);
    await click(copyInput());
    expect(copyInput().textContent).toBe('Copied');
    expect(container.textContent).not.toContain('Copy failed');
  });

  it('does not show copied feedback for input that changed while a copy was pending', async () => {
    let finish;
    Clipboard.SetText.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await edit('old');
    await click(copyInput());
    await edit('new');
    await act(async () => finish());
    expect(Clipboard.SetText).toHaveBeenLastCalledWith('old');
    expect(copyInput().textContent).toBe('Copy');
    expect(input().value).toBe('new');
  });

  it('supports explicit light/dark and system themes without sending processing requests', async () => {
    const themeSelect = container.querySelector('select[aria-label="Color theme"]');
    for (const value of ['dark', 'light', 'auto']) {
      await act(async () => {
        themeSelect.value = value;
        themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe(value === 'dark' ? 'dark' : 'light');
    }
    expect(requests).toHaveLength(1);
  });
});


it('shows conversion warnings from Go and ignores warnings from obsolete requests', async () => {
  await edit('{"User":{"id":{"int":1}}}');
  await resolve(1, '{"id":1}', { warnings: ['Schema-free best-effort conversion.', 'Named-type heuristic used.'] });
  expect(status().textContent).toBe('Done');
  expect(container.querySelector('[aria-label="Conversion warnings"]').textContent).toContain('Named-type heuristic');
  await edit('old');
  expect(container.querySelector('[aria-label="Conversion warnings"]')).toBeNull();
  await edit('new');
  await resolve(3, '{}', { warnings: ['Current limitations.'] });
  await resolve(2, '{}', { warnings: ['Obsolete warning.'] });
  expect(container.textContent).toContain('Current limitations.');
  expect(container.textContent).not.toContain('Obsolete warning.');
});

it('handles malformed optional warning metadata without crashing', async () => {
  await edit('{}');
  await resolve(1, '{}', { warnings: 'invalid' });
  expect(status().classList.contains('error')).toBe(true);
  expect(output().value).toBe('');
});


async function editPrefix(value) {
  await act(async () => {
    const element = container.querySelector('input[aria-label="Namespace Prefix"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('places an optional empty Namespace Prefix below Input and sends it to Go', () => {
  const element = container.querySelector('input[aria-label="Namespace Prefix"]');
  expect(element.value).toBe('');
  expect(container.textContent).toContain('Empty uses automatic named-type detection.');
  expect(element.closest('.input-column').querySelector('textarea')).toBe(input());
  expect(element.closest('.input-column').contains(output())).toBe(false);
  expect(element.closest('.input-column').firstElementChild.contains(input())).toBe(true);
  expect(requests[0].namespacePrefix).toBe('');
});

it('automatically processes literal prefix changes and clearing without accepting stale results or failures', async () => {
  await edit('{"com.example.Address":{"id":{"int":1}}}');
  await editPrefix('com.example.');
  expect(requests[2]).toMatchObject({ namespacePrefix: 'com.example.', operation: 'avro-to-plain' });
  await resolve(2, '{"id":1}');
  await resolve(1, '{"old":true}');
  expect(output().value).toBe('{"id":1}');
  await editPrefix('literal[1]+. ');
  expect(requests[3].namespacePrefix).toBe('literal[1]+. ');
  await editPrefix('');
  expect(requests[4].namespacePrefix).toBe('');
  await resolve(4, '{"id":1}', { warnings: ['Automatic named-type heuristics.'] });
  await act(async () => requests[3].reject(new Error('Obsolete prefix failure')));
  expect(output().value).toBe('{"id":1}');
  expect(container.textContent).toContain('Automatic named-type heuristics.');
  expect(status().textContent).toBe('Done');
});

it('requires Apply for manual prefix edits and invalidates pending requests when the prefix changes', async () => {
  await click(manual());
  await editPrefix('com.example.');
  await edit('{}');
  expect(requests).toHaveLength(1);
  await click(apply());
  expect(requests[1].namespacePrefix).toBe('com.example.');
  await editPrefix('org.other.');
  await resolve(1, '{"obsolete":true}', { warnings: ['Old prefix warning.'] });
  expect(output().value).toBe('');
  expect(container.textContent).not.toContain('Old prefix warning.');
  expect(status().textContent).toBe('Ready — click Apply.');
  expect(requests).toHaveLength(2);
  await click(apply());
  expect(requests[2].namespacePrefix).toBe('org.other.');
  await resolve(2, '{}');
  await click(manual());
  expect(requests[3].namespacePrefix).toBe('org.other.');
  expect(apply().disabled).toBe(true);
  await resolve(3, '{}');
  expect(status().textContent).toBe('Done');
});


it('switches automatic and explicit named matching across manual and automatic execution without stale metadata', async () => {
  await edit('{"Status":"READY"}');
  await resolve(1, '"READY"', { warnings: ['Automatic named-type heuristics.'] });
  await editPrefix('com.example.');
  expect(requests[2].namespacePrefix).toBe('com.example.');
  await click(manual());
  await resolve(2, '{"Status":"READY"}', { warnings: ['Obsolete explicit response.'] });
  expect(container.textContent).not.toContain('Obsolete explicit response.');
  await editPrefix('');
  expect(requests).toHaveLength(3);
  expect(status().textContent).toBe('Ready — click Apply.');
  await click(apply());
  expect(requests[3].namespacePrefix).toBe('');
  await resolve(3, '"READY"', { warnings: ['Automatic named-type heuristics.'] });
  expect(output().value).toBe('"READY"');
  await editPrefix('com.example.');
  expect(requests).toHaveLength(4);
  await click(manual());
  expect(requests[4].namespacePrefix).toBe('com.example.');
  await resolve(4, '{"Status":"READY"}', { warnings: ['Explicit prefix only.'] });
  expect(output().value).toBe('{"Status":"READY"}');
  expect(container.textContent).toContain('Explicit prefix only.');
});
