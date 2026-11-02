# Base extension

This directory is the runnable starter. The popup uses `src/page.ts` to execute DOM and webpage storage actions directly with `chrome.scripting.executeScript()`; no persistent content script or messaging setup is needed. See the [root README](../README.md) for architecture, storage examples, permissions, customization, debugging, and browser verification.

Use Node 22.12+ (22.x), Node 24.x (recommended), or Node 26+ and npm:

```sh
npm ci
npm run dev     # development extension; keep the Vite server running
npm run check   # lint, types, tests, production build, artifact checks, formatting
```

Load this directory's `dist/` folder through `chrome://extensions/` → Developer mode → Load unpacked. Use `npm run build` for a production extension.
