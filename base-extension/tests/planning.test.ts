import vm from 'node:vm';
import { expect, it } from 'vitest';
import { planningView } from '../src/planning';

// Minimal DOM fixture; no browser dependency is added to the starter.
class TestElement {
  id = '';
  textContent = '';
  attrs = new Map<string, string>();
  children: TestElement[] = [];
  parentElement: TestElement | null = null;
  shadowRoot: TestElement | null = null;
  constructor(public tagName = 'div') {}
  setAttribute(key: string, value: string) {
    this.attrs.set(key, value);
  }
  getAttribute(key: string) {
    return this.attrs.get(key) ?? null;
  }
  append(...nodes: TestElement[]) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  attachShadow() {
    this.shadowRoot = new TestElement('shadow');
    return this.shadowRoot;
  }
  after(node: TestElement) {
    const parent = this.parentElement!;
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
  }
  remove() {
    const parent = this.parentElement;
    if (parent) parent.children.splice(parent.children.indexOf(this), 1);
    this.parentElement = null;
  }
}
function fixture() {
  const body = new TestElement('body');
  const target = new TestElement();
  target.id = 'planning-target';
  target.textContent = 'Original website content';
  body.append(target);
  const document = {
    body,
    documentElement: new TestElement('html'),
    getElementById: (id: string) => body.children.find((node) => node.id === id) ?? null,
    querySelector: (selector: string) => (selector === '#planning-target' ? target : null),
    evaluate: (xpath: string) => ({
      singleNodeValue: xpath === '//*[@id="planning-target"]' ? target : null,
    }),
    createElement: (tag: string) => new TestElement(tag),
  };
  const context = vm.createContext({
    document,
    Element: TestElement,
    XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 },
  });
  const run = (
    action: 'status' | 'check' | 'mount' | 'remove',
    kind: 'id' | 'css' | 'xpath' = 'css',
    value = '#planning-target',
  ) => {
    Object.assign(context, { action, target: { kind, value } });
    return vm.runInContext(
      `(${planningView.toString()})(action, target, 'test-planning-root', 'GraphQL connected (HTTP 200).')`,
      context,
    );
  };
  return { body, target, run };
}

it.each([
  ['id', 'planning-target'],
  ['css', '#planning-target'],
  ['xpath', '//*[@id="planning-target"]'],
] as const)(
  'mounts by %s without replacing original content, prevents duplicates, and removes only its root',
  (kind, value) => {
    const { body, target, run } = fixture();
    expect(run('status')).toEqual({ value: false });
    expect(run('check', kind, value)).toEqual({ value: false });
    expect(body.children).toEqual([target]);
    expect(run('mount', kind, value)).toEqual({ value: true });
    expect(run('mount', kind, value)).toEqual({ value: true });
    expect(run('status')).toEqual({ value: true });
    expect(body.children).toHaveLength(2);
    expect(target.textContent).toBe('Original website content');
    expect(body.children[1]!.shadowRoot?.children[1]?.children[1]?.textContent).toContain(
      'HTTP 200',
    );
    expect(run('remove')).toEqual({ value: false });
    expect(body.children).toEqual([target]);
    expect(run('remove')).toEqual({ value: false });
  },
);

it('reports a missing target without changing the webpage', () => {
  const { body, target, run } = fixture();
  expect(run('mount', 'css', '.missing')).toHaveProperty(
    'error',
    expect.stringContaining('target not found'),
  );
  expect(body.children).toEqual([target]);
});

it('does not remove a webpage element that happens to share the root ID', () => {
  const { target, run, body } = fixture();
  target.id = 'test-planning-root';
  expect(run('remove')).toHaveProperty('error', expect.stringContaining('conflicts'));
  expect(body.children).toEqual([target]);
});
