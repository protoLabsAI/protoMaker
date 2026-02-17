# Stream Overlay Testing Guide

## Overview

The `/stream-overlay` route provides an OBS-optimized view for Twitch streaming with:

- Compact board state (4 columns: Backlog, Building, Review, Done)
- "Now Building" banner with current feature
- Suggestion queue (top 5 Twitch chat suggestions)
- Activity feed (last 10 system events)

## Testing Locally

1. **Start the development server:**

   ```bash
   pnpm dev
   ```

2. **Navigate to the stream overlay:**
   Open your browser to: `http://localhost:5173/stream-overlay`

3. **Configure for OBS:**
   - Add a Browser Source in OBS
   - Set URL to: `http://localhost:5173/stream-overlay`
   - Set Width: 1920
   - Set Height: 1080
   - Check "Shutdown source when not visible"
   - Check "Refresh browser when scene becomes active"

## Features to Verify

### Board View

- ✓ Shows features organized in 4 columns
- ✓ Displays up to 5 cards per column
- ✓ Shows "+N more" indicator when > 5 features
- ✓ Shows category and priority indicators

### Now Building Banner

- ✓ Appears when a feature is in `in_progress` status
- ✓ Shows green pulse indicator
- ✓ Displays feature description and category

### Suggestion Queue

- ✓ Shows "No suggestions yet" when empty
- ✓ Displays top 5 Twitch chat suggestions
- ✓ Shows submitter username for each suggestion

### Activity Feed

- ✓ Shows "No activity yet" when empty
- ✓ Displays last 10 events in ring buffer
- ✓ Auto-updates via WebSocket
- ✓ Shows timestamp for each event

## Chat Bot Commands

The Twitch bot (when enabled) responds to:

- `!help` - Lists available commands
- `!queue` - Shows top 5 suggestions
- `!status` - Shows current build status

Feature completions are announced automatically with PR links.

## Styling Notes

- Dark theme hardcoded for OBS overlay
- Large fonts (optimized for 1080p stream)
- No scrollbars (overflow hidden)
- No interactive elements (view-only)
- WebSocket-driven auto-refresh

## Troubleshooting

**Overlay not showing features:**

- Ensure you have a project selected in the app
- Check that features exist in your project
- Verify WebSocket connection in browser console

**Chat bot not responding:**

- Set `TWITCH_ENABLED=true` in environment
- Provide `TWITCH_CLIENT_ID` and `TWITCH_ACCESS_TOKEN`
- Check bot username and channel name in settings

**Activity feed not updating:**

- Check browser console for WebSocket errors
- Verify backend server is running
- Check for CORS issues in browser console
