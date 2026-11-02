// This function is copied into the webpage; keep it free of outer references.
export function planningView(
  action: 'status' | 'check' | 'mount' | 'remove',
  target: { kind: 'id' | 'css' | 'xpath'; value: string },
  rootId: string,
  status = 'Connected to GraphQL.',
): { value: boolean } | { error: string } {
  try {
    const existing = document.getElementById(rootId);
    if (existing && existing.getAttribute('data-fast-chrome-plugin-owned') !== 'planning-v1') {
      return { error: 'Planning root ID conflicts with an existing webpage element.' };
    }
    if (action === 'status') return { value: existing !== null };
    if (action === 'remove') {
      existing?.remove();
      return { value: false };
    }
    if (existing) return { value: true };

    let element: Element | null;
    if (target.kind === 'id') element = document.getElementById(target.value);
    else if (target.kind === 'css') element = document.querySelector(target.value);
    else {
      const node = document.evaluate(
        target.value,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      element = node instanceof Element ? node : null;
    }
    if (!element)
      return {
        error: `Planning target not found (${target.kind}: ${target.value}). Edit planning.config.ts.`,
      };
    if (
      !element.parentElement ||
      element === document.documentElement ||
      element === document.body
    ) {
      return { error: 'Planning target must be an element inside the webpage body.' };
    }
    if (action === 'check') return { value: false };

    const root = document.createElement('div');
    root.id = rootId;
    root.setAttribute('data-fast-chrome-plugin-owned', 'planning-v1');
    const shadow = root.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent =
      ':host { display:block; margin:12px 0; } section { font:14px/1.5 system-ui,sans-serif; color:#17283b; background:#f3f6fa; border:1px solid #b8c6d8; border-radius:8px; padding:16px; } h2 { margin:0 0 8px; font-size:16px; } p { margin:0; }';
    const section = document.createElement('section');
    section.setAttribute('aria-label', 'Planning View');
    const heading = document.createElement('h2');
    heading.textContent = 'Planning View';
    const message = document.createElement('p');
    message.textContent = `${status} Placeholder — business content is not configured yet.`;
    section.append(heading, message);
    shadow.append(style, section);
    element.after(root);
    return { value: true };
  } catch {
    return { error: 'Cannot render Planning View. Check the target ID, CSS selector, or XPath.' };
  }
}
