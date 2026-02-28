# Browser extension

The protoExtension Chrome extension brings the protoLabs AI server directly into your browser. It provides a side panel chat interface, a right-click context menu for sending selected text to protoLabs, a GitHub PR integration that surfaces protoLabs tools on pull request pages, and a badge indicator showing server connection status.

## Prerequisites

- Chrome or Chromium 114 or later
- A running protoLabs server (see [Installation](/getting-started/installation))
- Node.js 18 or later (required for building from source)
- pnpm 8 or later (required for building from source)

## Installation

### Option 1: Chrome Web Store

Coming soon — the extension will be available on the Chrome Web Store. When published, installation steps will appear here. Until then, use Option 2 to install from source.

### Option 2: Install from source

1. Clone the repository

   ```bash
   git clone https://github.com/proto-labs-ai/protoExtension.git
   cd protoExtension
   ```

2. Install dependencies

   ```bash
   pnpm install
   ```

3. Build the extension

   ```bash
   pnpm build
   ```

4. Load in Chrome
   - Open Chrome and navigate to `chrome://extensions`
   - Enable **Developer mode** using the toggle in the top-right corner
   - Click **Load unpacked**
   - Select the `dist/` directory inside the cloned repository

   The protoLabs extension icon appears in your Chrome toolbar when the extension loads successfully.

## Configuration

Open the extension settings by clicking the protoLabs icon in the Chrome toolbar and selecting **Settings**.

| Setting    | Description                                                   | Example                 |
| ---------- | ------------------------------------------------------------- | ----------------------- |
| Server URL | The base URL of your running protoLabs server, including port | `http://localhost:3008` |
| API key    | Your protoLabs API key, generated in server settings          | `your-api-key-here`     |

To generate an API key, open the protoLabs UI, go to **Settings > API Keys**, and create a new key. See [API reference](/reference/api) for details.

## Usage guide

### Side panel chat

The side panel provides a persistent chat interface connected to your protoLabs server without leaving your current browser tab.

1. Click the protoLabs icon in the Chrome toolbar
2. Select **Open side panel** (or use the keyboard shortcut shown in the popup)
3. Type a message and press **Enter** to send it to the protoLabs AI

The side panel retains conversation history for the current session. To start a new conversation, click **New chat** at the top of the panel.

### Context menu

Select any text on a webpage, right-click, and choose **Send to protoLabs** to pass the selected content directly into the chat.

This is useful for asking questions about code snippets, documentation passages, or error messages you encounter while browsing.

### GitHub integration

When you open a GitHub pull request or issue page, protoLabs adds a panel in the sidebar that surfaces relevant context from your protoLabs board.

Features available on GitHub pages:

- Link a GitHub PR to a protoLabs feature
- View the feature description and status alongside the PR
- Send PR diff context to the protoLabs chat

The GitHub integration activates automatically on `github.com` pages when the extension has the required site permissions. No additional OAuth setup is needed beyond the server API key.

### Badge indicator

The extension icon in the Chrome toolbar displays a colored badge reflecting the protoLabs server connection status:

| Badge | Meaning                                    |
| ----- | ------------------------------------------ |
| Green | Connected to the protoLabs server          |
| Red   | Cannot reach the server (check server URL) |
| Gray  | Extension is idle or Server URL is not set |

## Permissions explained

The extension requests the following Chrome permissions:

| Permission                    | Why it is required                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `sidePanel`                   | Enables the persistent side panel chat interface                                            |
| `contextMenus`                | Adds the **Send to protoLabs** right-click menu item                                        |
| `storage`                     | Saves your server URL and API key locally so you do not need to re-enter them               |
| `activeTab`                   | Reads the current page URL so the extension can activate the GitHub integration on PR pages |
| `scripting`                   | Injects the GitHub sidebar panel into pull request and issue pages                          |
| `host_permission: github.com` | Required for the GitHub PR integration to access page content                               |

No page content is sent to any server other than your configured protoLabs instance. All data stays within your local network unless your server is hosted remotely.

## Troubleshooting

### Extension fails to load in Chrome

**Symptom:** After clicking **Load unpacked**, Chrome shows an error such as "Manifest file is missing or unreadable" or the extension does not appear in the list.

**Fix:**

1. Confirm the build completed without errors — check the terminal output from `pnpm build`
2. Verify you selected the `dist/` directory, not the repository root
3. Confirm **Developer mode** is enabled (the toggle in the top-right of `chrome://extensions`)
4. If the build failed, delete `dist/`, run `pnpm install` again, then `pnpm build`
5. Reload the extension by clicking the refresh icon next to it in `chrome://extensions`

---

### Cannot connect to protoLabs server

**Symptom:** The badge shows red, or side panel messages return a connection error.

**Fix:**

1. Confirm the protoLabs server is running: open `http://localhost:3008/api/health` in your browser (substitute your actual host and port)
2. Open the extension settings and verify the **Server URL** matches exactly, including the port number (e.g., `http://localhost:3008` — no trailing slash)
3. If the server is on a remote host, ensure your firewall allows connections on that port
4. Check that your **API key** is correct and has not been rotated
5. If you changed the server URL, click **Save** in the extension settings and reload the extension

---

### GitHub integration not appearing on GitHub pages

**Symptom:** No protoLabs panel appears when viewing a GitHub pull request or issue.

**Fix:**

1. Open `chrome://extensions`, find protoLabs, and click **Details**
2. Scroll to **Site access** and confirm `github.com` is listed as an allowed site
3. If it is not listed, click **Allow on specific sites** and add `https://github.com/*`
4. Reload the GitHub page after granting permissions
5. Confirm your protoLabs server is reachable (see the previous troubleshooting entry)

## Related documentation

- [Installation](/getting-started/installation) — Set up your protoLabs server
- [GitHub integration](./github) — Native GitHub integration for PR automation
- [API reference](/reference/api) — Generate API keys for the extension
