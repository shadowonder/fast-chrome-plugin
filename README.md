# Fast Chrome Plugin

A lightweight Manifest V3 starter: a React popup that reads the current webpage's DOM and uses its `localStorage` and `sessionStorage`. The runnable project is in [`base-extension`](base-extension).

The runtime is small: `Popup.tsx` renders the interface, and `page.ts` runs a function on the active webpage using `chrome.scripting.executeScript()`. Chrome returns the result directly to the popup. No persistent content script, message protocol, or application background worker is needed for these button-triggered actions.

## Install, build, and load

Use Node **22.12+ within 22.x**, **24.x** (recommended), or **26+**, npm, and Chrome 120+. Node 23 and 25 are outside Vitest's supported engines. `.nvmrc` selects Node 22.

```sh
git clone https://github.com/shadowonder/fast-chrome-plugin.git
cd fast-chrome-plugin/base-extension
npm ci
npm run build
```

Open `chrome://extensions/`, enable **Developer mode**, select **Load unpacked**, and choose **`base-extension/dist/`**. Pin the extension and open its popup on a regular HTTP(S) webpage.

- **Read page title** reads `document.title` without changing the page.
- Choose **localStorage** or **sessionStorage**, then **Save demo**, **Read demo**, or **Remove demo**.
- The storage buttons touch only `fast-chrome-starter:demo`, using the harmless string `Hello from Fast Chrome Starter`. They never enumerate website storage. Remove the demo key when finished; the website can see these values.

## Stack and commands

Vite 8, CRXJS 3, React 19, TypeScript 6, Chrome API types, ESLint 10, Prettier, and Vitest 5. Dependencies are pinned and installed through the committed npm lockfile. TypeScript 6 stays within the installed TypeScript ESLint release's supported range.

Run commands inside `base-extension`:

| Command                                   | Purpose                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `npm ci`                                  | Install the committed dependency graph                                           |
| `npm run dev`                             | Start Vite / CRXJS development mode                                              |
| `npm run build`                           | Type-check and produce the production `dist/` extension                          |
| `npm run lint`                            | Check source, tests, and configuration                                           |
| `npm run typecheck`                       | Check TypeScript                                                                 |
| `npm test` / `npm run test:watch`         | Run / watch the core tests                                                       |
| `npm run verify:build`                    | Check production manifest and bundled resources; build first                     |
| `npm run format` / `npm run format:check` | Apply / check formatting                                                         |
| `npm run check`                           | Run lint, types, tests, production build, artifact checks, and formatting checks |

For development, run `npm run dev`, wait for startup, and load `dist/` as unpacked. Keep the server running on port 5173. CRXJS provides popup hot updates; changed page-action functions run on the next click after the popup updates. Reload the extension after manifest changes. CRXJS adds development helpers, including a worker and localhost connections; run `npm run build` before distributing or checking production behavior.

## Source layout

```text
base-extension/
  index.html                 Popup HTML and React root
  manifest.config.ts         Manifest source consumed by CRXJS
  vite.config.ts             React + CRXJS build configuration
  src/
    popup/
      main.tsx               React entry point
      Popup.tsx              Buttons, storage selection, results, and errors
      styles.css             Popup styles
    page.ts                  Active-tab checks and direct page execution
    storage.ts               Optional chrome.storage helpers
  public/image/              Existing extension icons
  tests/
    page.test.ts             Core page actions and optional storage helpers
    build.test.mjs           Production manifest and resource checks
  dist/                      Generated unpacked extension (ignored)
```

Start with `Popup.tsx` and `page.ts`; those two files contain the complete interaction flow. Each click queries the active tab in the current window, checks that it is a supported webpage, executes a function in the top frame, and displays its result or error. Nothing is installed in the webpage between clicks.

## Accessing and changing the webpage

`src/page.ts` contains the injected function. Chrome copies that function into the webpage, so it **cannot reference imports or variables from the popup's scope**. Pass values through `args`. Keep DOM work inside that function.

The current implementation reads `document.title` and performs storage operations. To query another value, change the title branch to something like:

```ts
return { value: document.querySelector('h1')?.textContent ?? '' };
```

For a user-triggered DOM modification, the same branch could find an element and update it:

```ts
const heading = document.querySelector('h1');
if (heading) heading.textContent = 'Updated by my extension';
return { value: heading ? 'Heading updated.' : 'No heading found.' };
```

These are customization examples; the starter does not modify DOM elements by default. It never assumes the webpage has a React `#root`. Treat webpage text as untrusted and render it as text, as the popup already does.

Here is the underlying Chrome API pattern, usable from popup code:

```ts
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (tab?.id === undefined) throw new Error('No active tab');
const [injection] = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  world: 'ISOLATED',
  func: (selector: string) => document.querySelector(selector)?.textContent ?? '',
  args: ['h1'],
});
console.log(injection?.result);
```

The provided `runPageAction` additionally checks URLs, handles missing results, and returns storage errors explicitly. Its small `{ value }` / `{ error }` return value preserves page-side failures that Chrome may otherwise leave without a result. This is a direct execution result, with no listener or message transport. See the [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting).

Execution stays in Chrome's **isolated world**. The injected function can access the webpage DOM and origin storage without sharing the website's JavaScript globals. MAIN-world execution is unnecessary here.

## Webpage storage and extension storage

The main examples use native Web Storage strings. `getItem` returns a string or `null` for a missing key; `setItem` writes a string; `removeItem` removes the selected key. There is no automatic JSON parsing. If your own feature stores objects, explicitly serialize and parse them where needed, and handle malformed data.

`window.localStorage` and `window.sessionStorage` execute **inside the injected function**, so they belong to the webpage origin. Calling these APIs in the popup would access the extension origin instead. Local storage normally persists across page visits; session storage is scoped to the website origin and tab session. Browser policy, privacy settings, and quotas can restrict both; failures appear in the popup.

For extension-owned data, the optional `src/storage.ts` helper provides small wrappers around `chrome.storage.local` and `chrome.storage.session`:

```ts
// From src/popup code:
import { extensionStorage } from '../storage';

const storage = extensionStorage('local'); // or 'session'
await storage.set('compact-view', true);
const value = await storage.get('compact-view'); // unknown: validate before use
await storage.remove('compact-view');
```

The helper accepts primitive values and lets Chrome API failures reject normally; catch them in the calling UI. Extension local storage persists across browser restarts. Extension session storage is held in memory and cleared on extension reload/disable/update or browser restart. `chrome.storage.session` is not exposed to content scripts by default; this starter does not change that access level. These APIs are unrelated to website storage and require the `storage` permission. See [Chrome's storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage).

## Permissions and target websites

The manifest requests only `activeTab`, `scripting`, and `storage`. Opening the popup grants temporary active-tab access where Chrome permits it. There are no broad host permissions, static content script matches, or production web-accessible resources. If you remove the optional extension storage helper, you can also remove the `storage` permission; webpage Web Storage does not require it.

`runPageAction` rejects non-HTTP(S) pages and the Chrome Web Store before attempting injection. Chrome may also block protected viewers, user-restricted sites, or policy-restricted pages; API failures appear in the popup. Reopen the popup after navigation to renew access. To limit the example to a particular website, add an allowlist check beside the URL checks in `src/page.ts`.

Production code is bundled locally and uses Chrome's default extension CSP. There is no eval, remote executable code, arbitrary code endpoint, or webpage message bridge. Do not collect unrelated storage keys, credentials, or private website data.

## Adding features later

For ongoing webpage observation or automatic behavior, add a dedicated content script only when needed. CRXJS can bundle this manifest entry once you create `src/content.ts`:

```ts
content_scripts: [{
  matches: ['https://example.com/*'],
  js: ['src/content.ts'],
  run_at: 'document_idle',
}],
```

Use precise [Chrome match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns). Automatic injection changes when and where the extension runs; choose the scope deliberately.

For lifecycle events or work while the popup is closed, create `src/background.ts` and add:

```ts
background: { service_worker: 'src/background.ts', type: 'module' },
```

A worker has no DOM or Web Storage; use extension storage there. Introduce messaging only if these future contexts actually need to communicate. No placeholder files or messaging infrastructure are included now.

To reuse the starter, copy the repository or use GitHub's template workflow if enabled. Update the package name, manifest name/description/version, icons, and README. Keep npm as the single package manager and commit lockfile changes. The existing [license](LICENSE) remains in place.

## Validation and debugging

`npm test` checks direct DOM results, both webpage storage areas, isolated-function serialization, storage restrictions, unsupported tabs, injection failures, missing results, and the optional extension storage helpers. The injected function runs in a fresh Node VM during tests to catch accidental references to popup variables. Production checks verify the MV3 manifest, permissions, popup resources, local asset references, and absence of obsolete content-script output or development code.

These checks do not replace Chrome verification. After `npm run check`, manually:

1. Load `dist/` and confirm Chrome reports no extension errors.
2. Read the title on a regular webpage without a `#root`; repeat after navigating and reopening the popup.
3. Save/read/remove the demo in both webpage storage areas. Check only that key in the webpage's DevTools Application panel; unrelated values should remain unchanged.
4. Try a Chrome internal page and the Chrome Web Store, and confirm meaningful errors.
5. Try blocked webpage storage and restricted site access; confirm errors appear without crashing the popup.
6. Run development mode and verify popup updates and page actions after editing.

Manual Chrome testing has not been performed as part of the automated validation.

For a blank popup, right-click it and choose **Inspect**; make sure you loaded `dist/`. For injection failures, use an HTTP(S) page, check Chrome site-access settings, and reopen the popup. For development connection failures, keep Vite running on port 5173 and reload the extension after switching between development and production builds. For install or native build errors, check Node compatibility and run `npm ci` instead of copying `node_modules` between systems.

The previous dependency audit reported 11 moderate development-tool findings from the [minimatch denial-of-service advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) in ESLint / TypeScript ESLint. A forced major override would exceed their declared dependency ranges, so none is applied. This dependency is not shipped in the extension; the runtime audit reported zero vulnerabilities. Recheck `npm audit` as upstream tools update.

## What the simplification removed

The earlier modernization replaced CRA and a filename-scanning manifest script with Vite and CRXJS. This pass preserves that build system and replaces its persistent content listener with direct `executeScript` results.

Removed the request/response message contracts, runtime validators, sender checks, duplicate-injection flag, standalone content bundle, message transport, error normalization module, JSON webpage-storage wrapper, and four-location storage demonstration UI. Those layers served a long-lived message endpoint that the current examples do not need. Extension storage remains an optional small helper. Tests now focus on page execution, storage behavior, and production output instead of the removed messaging infrastructure.
