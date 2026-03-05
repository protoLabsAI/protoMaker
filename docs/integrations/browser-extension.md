# Browser Extension

The protoLabs.studio browser extension brings protoLabs Studio into any browser tab. Chat with Ava, monitor agent status, and extract context from GitHub pages -- all from Chrome's side panel.

**Status:** Optional
**Repository:** [protoLabsAI/protoExtension](https://github.com/protoLabsAI/protoExtension)
**Targets:** Chrome (primary), Firefox (secondary)

## What It Does

- **Side panel chat** -- Talk to Ava from any tab via streaming chat
- **Context menu** -- Select text, right-click "Ask Ava about this", and the selection is sent to the chat
- **Agent badge** -- Toolbar icon shows active (blue) and blocked (red) agent counts in real-time
- **GitHub extraction** -- On GitHub pages, the extension extracts repo metadata, PR diffs, issue details, and file contents as context for Ava
- **Project picker** -- Switch between protoLabs Studio projects without leaving the browser

## Prerequisites

- A running protoLabs Studio server (default `http://localhost:3008`)
- An API key (`AUTOMAKER_API_KEY` from your server `.env`)
- Chrome 114+ (for side panel support) or Firefox

## Quick Setup

### From Source (Development)

```bash
git clone https://github.com/protoLabsAI/protoExtension.git
cd protoExtension
pnpm install
pnpm dev
```

Load the unpacked extension from `.output/chrome-mv3/` in `chrome://extensions` (Developer mode enabled).

See the full [Developer Quickstart](https://github.com/protoLabsAI/protoExtension/blob/main/docs/dev-quickstart.md) for detailed instructions.

### Configuration

1. Open the extension options page (right-click extension icon > Options)
2. Enter your protoLabs Studio server URL (default: `http://localhost:3008`)
3. Enter your API key
4. Click **Test Connection** to verify, then **Save**

## How It Connects

The extension communicates with the protoLabs Studio server via two channels:

### HTTP API

All requests include an `X-API-Key` header for authentication.

| Endpoint         | Purpose                       |
| ---------------- | ----------------------------- |
| `/api/health`    | Connection validation         |
| `/api/workspace` | List available projects       |
| `/api/features`  | Feature list for badge        |
| `/api/auto-mode` | Auto-mode status for badge    |
| `/api/chat`      | Chat with Ava (SSE streaming) |

### WebSocket Events

Real-time updates flow through `/api/events`:

1. Extension requests a one-time token from `GET /api/auth/token`
2. Connects to `ws://localhost:3008/api/events?wsToken=<token>&projectPath=<path>`
3. Receives `feature:started`, `feature:completed`, `feature:error`, `auto-mode:started`, `auto-mode:stopped` events
4. Reconnects with exponential backoff (1s base, 30s cap) on disconnection

## Server Requirements

The extension works with the standard protoLabs Studio server. No additional configuration is needed on the server side -- the existing `/api/health`, `/api/chat`, `/api/events`, and `/api/auth/token` endpoints are all it uses.

If your server runs on a non-default port or host, update the Server URL in the extension options.

### CORS

If the extension makes requests from a content script context (rather than the background service worker), the server may need CORS headers. The default protoLabs Studio server configuration handles this. If you encounter CORS errors, ensure the server's CORS middleware allows the extension's origin.

## Badge Reference

| Badge  | Color            | Meaning                       |
| ------ | ---------------- | ----------------------------- |
| Number | Blue (`#1D6AE5`) | Active agents running         |
| Number | Red (`#DC2626`)  | At least one agent is blocked |
| (none) | --               | No agents running             |

Updates via WebSocket when the side panel is open, with 5-minute alarm polling as a fallback.

## Permissions

| Permission     | Why                                                  |
| -------------- | ---------------------------------------------------- |
| `storage`      | Persist credentials, chat sessions, and project path |
| `activeTab`    | Read current tab URL and title for context           |
| `sidePanel`    | Chrome side panel API for the chat UI                |
| `contextMenus` | Right-click "Ask Ava about this" menu item           |
| `alarms`       | 5-minute polling interval for badge updates          |

No host permissions are required at install time. Runtime permissions are requested as needed.

## Troubleshooting

### Extension Can't Connect

1. Verify the server is running: `curl http://localhost:3008/api/health`
2. Check the API key in the extension options matches `AUTOMAKER_API_KEY` in the server's `.env`
3. Open the service worker console (Chrome > Extensions > protoLabs.studio > Details > Inspect views: service worker)

### Badge Not Updating

The side panel must be opened at least once to establish the WebSocket connection. Without it, the extension falls back to 5-minute alarm polling.

### Firefox Limitations

- Side panel API is not available -- use the popup instead
- Host permissions require explicit user grant at runtime
- `chrome.sidePanel.open()` calls will silently fail
