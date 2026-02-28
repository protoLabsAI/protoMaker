# Browser extension template

A WXT + React + TypeScript + Tailwind CSS starter for Chrome and Firefox MV3 extensions. Ships with messaging, storage, and permissions modules pre-wired, plus a Vitest test setup.

Repository: [proto-labs-ai/browser-extension-template](https://github.com/proto-labs-ai/browser-extension-template)

Example project built from this template: [proto-labs-ai/protoExtension](https://github.com/proto-labs-ai/protoExtension)

## Quick start

```bash
git clone https://github.com/proto-labs-ai/browser-extension-template.git my-extension
cd my-extension
npm install
npm run dev        # hot-reloading dev build
npm run build      # production build
```

After `npm run build`, load the `dist/` directory in Chrome via `chrome://extensions` with **Developer mode** enabled.

## What is included

### Core modules

| Module      | Location                 | Description                                                                       |
| ----------- | ------------------------ | --------------------------------------------------------------------------------- |
| Messaging   | `src/lib/messaging.ts`   | Type-safe message passing between extension contexts (background, content, popup) |
| Storage     | `src/lib/storage.ts`     | Typed wrapper around `browser.storage.local` with schema validation               |
| Permissions | `src/lib/permissions.ts` | Runtime permission request helpers with user-facing prompts                       |

### Entrypoints

WXT uses an entrypoints directory pattern. The template includes:

| Entrypoint     | Location                        | Description                   |
| -------------- | ------------------------------- | ----------------------------- |
| Background     | `src/entrypoints/background.ts` | Service worker for MV3        |
| Content script | `src/entrypoints/content.ts`    | Injected into matching pages  |
| Popup          | `src/entrypoints/popup/`        | Browser action popup (React)  |
| Options page   | `src/entrypoints/options/`      | Full-page settings UI (React) |

### Test setup

Vitest is pre-configured with `@webext-core/fake-browser` for unit testing browser APIs without a real browser. Test files live next to source files using the `.test.ts` naming convention.

```bash
npm run test        # run tests once
npm run test:watch  # watch mode
```

## WXT gotchas

### Typecheck requires `wxt prepare`

WXT generates type declarations for entrypoints and the `browser` namespace during the `prepare` step. Running `tsc` without first running `wxt prepare` (which `npm run dev` and `npm run build` call automatically) will produce errors about missing module declarations.

Before running `npm run typecheck` in CI or from a cold clone:

```bash
npx wxt prepare
npm run typecheck
```

### `tsconfig.json` include behavior

WXT manages `tsconfig.json` entries for generated types. Do not manually add generated paths like `.wxt/` to your `tsconfig.json` include array — WXT writes them automatically and manual additions can create duplicate or conflicting entries after regeneration.

### Browser namespace casing

WXT re-exports the `browser` namespace from `webextension-polyfill`. Import it from `wxt/browser`, not from `webextension-polyfill` directly, to get the types WXT has already resolved:

```typescript
// Correct
import { browser } from 'wxt/browser';

// Incorrect — bypasses WXT's type resolution
import browser from 'webextension-polyfill';
```

### Chrome-only API patterns

Some Chrome APIs (for example `chrome.sidePanel`) have no cross-browser equivalent. When you need a Chrome-only API:

1. Gate the call behind a runtime check: `if (typeof chrome !== 'undefined' && chrome.sidePanel)`
2. Do not import from `wxt/browser` for these — use the global `chrome` object directly
3. Note the Chrome-only restriction in a comment so agents do not attempt to port it to Firefox

## Architecture patterns

### Content script isolation

Content scripts share the page DOM but run in an isolated JavaScript context. To communicate with the background service worker or popup, use the messaging module rather than direct function calls:

```typescript
// content.ts — send a message
import { sendMessage } from '@/lib/messaging';

const response = await sendMessage('getFeatureStatus', { featureId: '123' });
```

```typescript
// background.ts — handle the message
import { onMessage } from '@/lib/messaging';

onMessage('getFeatureStatus', async ({ featureId }) => {
  return fetchStatus(featureId);
});
```

### Message passing

Define all message types in a single schema file to keep the content script, background, and popup in sync:

```typescript
// src/lib/messaging.ts
export type MessageSchema = {
  getFeatureStatus: [{ featureId: string }, { status: string }];
  openSidePanel: [void, void];
};
```

### Side panel timing gap

`chrome.sidePanel.open()` must be called in response to a user gesture (click). There is a short window after the gesture event where the call is valid. If you need to perform async work before opening the panel, do it before calling `open()`, not after:

```typescript
// Correct — open first, load data inside the panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id! });
});

// Incorrect — async work before open() risks missing the gesture window
chrome.action.onClicked.addListener(async (tab) => {
  await fetchSomething(); // gesture window may have expired
  chrome.sidePanel.open({ tabId: tab.id! });
});
```

## Customization

### Adding a new entrypoint

Create a file or directory under `src/entrypoints/`. WXT auto-discovers entrypoints by filename convention:

| Filename pattern       | Type                         |
| ---------------------- | ---------------------------- |
| `background.ts`        | Background service worker    |
| `content.ts`           | Content script (all URLs)    |
| `content/index.ts`     | Content script with React UI |
| `popup/index.html`     | Browser action popup         |
| `sidepanel/index.html` | Side panel                   |
| `options/index.html`   | Options page                 |
| `devtools/index.html`  | DevTools panel               |

### Adding permissions

Declare static permissions in `wxt.config.ts` under `manifest.permissions`. For permissions that must be requested at runtime, use the `permissions` module:

```typescript
// wxt.config.ts — static permissions
export default defineConfig({
  manifest: {
    permissions: ['storage', 'activeTab'],
  },
});
```

```typescript
// runtime request
import { requestPermission } from '@/lib/permissions';

const granted = await requestPermission('tabs');
```

### Adding a content script for specific URLs

To inject a content script only on certain pages, add a `matches` property in the entrypoint definition:

```typescript
// src/entrypoints/github.content.ts
export default defineContentScript({
  matches: ['https://github.com/*'],
  main() {
    // runs only on GitHub pages
  },
});
```

## Related documentation

- [Browser extension integration](/integrations/browser-extension) — Installing and using the protoExtension Chrome extension
- [Templates overview](./index) — All available project templates
