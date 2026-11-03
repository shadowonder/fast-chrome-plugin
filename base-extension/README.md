# Base extension

A small React popup with **Planning** and **Token** tabs. It uses direct isolated-world `chrome.scripting.executeScript()` calls; no application worker or persistent message listener is needed.

**Configure the TODO selector in `src/planning.config.ts` before using Planning on a real website.** The GraphQL query remains a temporary `query { __typename }`. See the [root README](../README.md) for target modes, authentication behavior, token handling, commands, and browser verification.

Use Node 22.12+ within 22.x, Node 24.x (recommended), or Node 26+:

```sh
npm ci
npm run dev
npm run typecheck
npm run build
```

Load `dist/` through `chrome://extensions/` → Developer mode → Load unpacked. Use `npm run build` for production output.
