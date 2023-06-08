# Base extension

This is a simple Chrome extension, mainly designed for quickly building Chrome extension plugins.

This extension consists of multiple components, including frontend page injection and backend display pages. This project uses React for basic rendering. You can use npm run build to generate the "build" folder, which can be directly called in Chrome.

PageScript.tsx: Frontend page injection. Used for JavaScript operations on the frontend page.
Popup.tsx: Panel operations for the Chrome extension.

Please note that all the code will be bundled into JavaScript, which may make it appear bloated. If needed, modifications can be made to the packaging tool in script/updateManifest.js.