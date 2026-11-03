# Fast Chrome Plugin

A lightweight Chrome Manifest V3 extension built with Vite, CRXJS, React, and TypeScript. The React popup has two tabs: **Planning** and **Token**. Page operations use `chrome.scripting.executeScript()` with direct results, without a persistent content listener or application background worker.

## Install, build, and load

Use Node **22.12+ within 22.x**, **24.x** (recommended), or **26+**, npm, and Chrome 120+. `.nvmrc` selects Node 22.

```sh
git clone https://github.com/shadowonder/fast-chrome-plugin.git
cd fast-chrome-plugin/base-extension
npm ci
npm run build
```

Open `chrome://extensions/`, enable **Developer mode**, choose **Load unpacked**, and select **`base-extension/dist/`**. Pin the extension and open the popup on a regular HTTP(S) webpage.

The real website selector and business schema are not decided yet. Planning has a TODO selector and a temporary connectivity query; configure the selector before expecting it to mount on a real page.

## Popup tabs

### Planning

The **Display planning view** switch checks the active webpage for a configured target. When enabled, it:

1. Checks the target and whether a view already exists.
2. Reads the webpage's `sessionStorage.getItem('idToken')` and makes one same-origin GraphQL request.
3. Mounts a small placeholder **adjacent to the target**, only after a successful request.

The switch initializes from the actual page DOM when the Planning panel opens. Repeated enabling does not duplicate an existing view or repeat its request. Disabling removes only the extension-owned root. No original webpage content is replaced, and no observers, listeners, polling, or retries are installed.

The view is page-scoped. It disappears after a full page reload and is not automatically restored. A missing target, token, or failed connection leaves a new view unmounted and displays an error. If another application action removes the view while the popup stays open, reopen the panel to refresh its state.

### Token

Opening the **Token** panel reads only the current page's `idToken` from session storage. The full value appears in a selectable, scrollable, read-only text field. **Refresh** reads it again and clears stale values on failure. **Copy token** calls the Clipboard API directly from the button click; if clipboard access is blocked, select and copy the field manually.

The token is held only in popup memory and cleared when leaving the Token panel. It is never saved to extension storage or logged. Copying intentionally places the full value on your system clipboard.

The selected popup tab is the only persisted feature preference: `chrome.storage.local.selectedPopupTab`, containing `planning` or `token`. Reopening the popup restores it. Preference failures show a warning without preventing page actions.

## Configure the Planning target

Edit **`base-extension/src/planning.config.ts`**. It contains an explicit TODO and this placeholder:

```ts
export const PLANNING_TARGET: { kind: 'id' | 'css' | 'xpath'; value: string } = {
  kind: 'css',
  value: '#planning-target',
};
```

Examples, once the real website is known:

```ts
{ kind: 'id', value: 'actual-container-id' }
{ kind: 'css', value: 'main .actual-container' }
{ kind: 'xpath', value: '//*[@id="actual-container-id"]' }
```

Choose an element **inside the top-frame webpage body**. A missing target or invalid selector produces an error; there is no fallback to an arbitrary page element. Body and document-root targets are rejected because the example mounts adjacent to the selected element.

`PLANNING_ROOT_ID` gives the root a unique extension-specific ID. A small ownership marker prevents removing a webpage element with a colliding ID. The root contains a Shadow DOM for style isolation. `src/planning.ts` holds the placeholder markup; replace that small rendering block when business content is defined. It uses DOM creation and `textContent`, without unsafe HTML rendering.

## GraphQL transport

`src/graphql.ts` exports the self-contained `requestGraphQL(query, variables?)` function, executed in the webpage's isolated world. The separate `PLANNING_QUERY` in `planning.config.ts` is temporarily:

```graphql
query {
  __typename
}
```

No business schema or fields have been invented. Replace the query only once the schema is known. The transport accepts optional serializable variables, so the invocation in `src/page.ts` can later pass `[PLANNING_QUERY, { ... }]`.

Every request uses:

```ts
new URL('/graphql', window.location.origin);
```

It reads `sessionStorage.getItem('idToken')` in the page context, then sends POST JSON containing `query` and optional `variables`, with `Content-Type: application/json` and `Authorization: Bearer <idToken>`. It never uses the popup origin or a fixed external hostname.

Fetch is restricted to the same origin, uses same-origin credentials, disables caching, rejects redirects, and has a 15-second timeout. It makes no automatic retry or background refresh. Request failures, inaccessible storage, empty tokens, HTTP 401/403, other unsuccessful HTTP responses, invalid JSON/data, and GraphQL errors are handled explicitly. Errors do not echo response bodies or backend error messages that might include credentials.

The placeholder displays only HTTP status and the number of response fields. It does not put the token, response values, or server error messages into the webpage DOM. The transport returns response data for future use, but the current rendering path uses only that safe metadata.

The target check returns Chrome's document ID. The request and final mount target that same document, so navigation cannot silently move an in-progress enable action onto a different page. A vanished document causes the action to fail.

## Source layout and execution context

```text
base-extension/
  index.html                 Popup HTML and React root
  manifest.config.ts         Manifest source consumed by CRXJS
  vite.config.ts             React + CRXJS build configuration
  src/
    popup/
      main.tsx               React entry point
      Popup.tsx              Tabs, switch, token viewer, clipboard, and errors
      styles.css             Compact popup styling
    page.ts                  Active-tab checks and direct page execution
    planning.config.ts       TODO target, root ID, and temporary query
    planning.ts              Mount/check/remove the placeholder
    graphql.ts               Same-origin authenticated transport
    storage.ts               Small extension-storage and tab-preference helpers
  public/image/              Extension icons
  dist/                      Generated unpacked extension (ignored)
```

Injected functions are self-contained. Chrome copies them into the page; imported values or popup closures are not available there. Configuration travels through serializable `args`. Functions return a small `{ value }` or `{ error }` directly; there is no runtime messaging protocol. See the [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting).

The DOM, session storage, and GraphQL fetch all use Chrome's **isolated world**. No MAIN-world execution is necessary. The only durable page addition is the extension-owned view root. There are no token globals, token DOM attributes, or page-rendered token values.

For future continuous page observation, add a dedicated content script and precise manifest matches only when needed. For lifecycle events, add a worker only when a feature needs it. CRXJS supports those manifest entries without prebuilt messaging infrastructure.

## Permissions and storage boundaries

The manifest retains `activeTab`, `scripting`, and `storage`. No host permissions or clipboard permission were added. Opening the popup grants temporary current-tab access where Chrome permits it. Non-HTTP(S) pages and the Chrome Web Store are rejected; Chrome policy, protected viewers, and user site restrictions can also block access.

Webpage `sessionStorage` belongs to the website and tab session. The token must be read inside an injected function; reading popup `sessionStorage` would access the extension origin instead. The previous local/session demo UI was replaced by the real feature; native Web Storage remains available inside injected functions when future page features need it.

`chrome.storage.local` belongs to the extension and stores the selected tab preference. The small `extensionStorage('local' | 'session')` helper remains available for other extension-owned primitive values. `chrome.storage.session` is not exposed to content scripts by default; this extension does not widen that access. Never use either extension storage area for the page token.

Production executable code is bundled locally under Chrome's default CSP. Tokens are sent only to the current page origin's `/graphql` endpoint and, when explicitly requested, copied to the user's clipboard. There is no arbitrary-code endpoint or webpage message bridge.

## Commands and development

The dependency set is intentionally small: React and React DOM at runtime; Vite, CRXJS, the React Vite plugin, TypeScript, and required type definitions for development. The project does not include linting, formatting, or test frameworks. Use npm and the committed lockfile.

Run inside `base-extension`:

| Command             | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `npm ci`            | Install the committed dependency graph                |
| `npm run dev`       | Start Vite / CRXJS development mode                   |
| `npm run typecheck` | Check TypeScript                                      |
| `npm run build`     | Type-check and build the production `dist/` extension |

For development, keep `npm run dev` running on port 5173 and load `dist/`. CRXJS supplies popup hot updates and development-only helpers. Reload the extension after manifest changes, and remove/re-enable a mounted Planning View after changing its renderer. Run `npm run build` before distribution or production checks. No release or publication is part of this feature.

## Browser verification

This minimal starter has no automated test framework. `npm run typecheck` and `npm run build` validate compilation and production bundling; browser behavior must be checked manually.

No manual Chrome testing or real authenticated GraphQL request has been performed. After selecting the real anchor, verify:

1. Load `dist/` in Chrome without manifest or missing-resource errors.
2. On a test webpage with the configured target and a mock or appropriate test account token, enable Planning. Verify one POST to that origin's `/graphql`, the expected headers/body, and a single placeholder beside the original element.
3. Close/reopen the popup: the switch reflects the existing root. Disable it: only the created root disappears. Reload the webpage: the view stays off.
4. Try ID, CSS, and XPath targets. Missing/invalid selectors should show an error without changing original content.
5. Open Token, select/copy the full value, refresh after changing or removing it, and test clipboard rejection. Confirm no token is written to extension storage or the webpage DOM.
6. Select a popup tab and reopen the popup to verify preference restoration.
7. Test absent/empty tokens, blocked storage, network failure, HTTP 401/403/500, and GraphQL errors. No failed new enable should leave a partial root or leak credentials into error text.
8. Navigate while enabling. The action must fail for the old document instead of requesting or mounting on the replacement page.
9. Try Chrome internal pages and the Chrome Web Store; errors should remain clear.

For blank popup or clipboard issues, right-click the popup and choose **Inspect**. For access errors, check Chrome site permissions and reopen the popup on an HTTP(S) page. For a missing target, edit the TODO in `planning.config.ts`; no business website or selector has been assumed. For GraphQL authentication errors, verify the test account's current page-origin session token and backend contract without logging credentials.

The lockfile was resolved with an exclusive October 1, 2026 publication cutoff for corporate package-maturity compatibility. All retained direct dependencies and every transitive lockfile entry were independently checked against public npm publication metadata. See the dependency cleanup report for the exact result and the security tradeoffs imposed by that historical cutoff.

The existing [license](LICENSE) is unchanged.
