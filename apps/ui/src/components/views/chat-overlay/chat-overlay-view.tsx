/**
 * ChatOverlayView — previously the Electron global overlay.
 * Now unused (ChatModal provides the equivalent in web mode).
 * Kept as a route target to avoid broken imports.
 */

import { ChatOverlayContent } from './chat-overlay-content';

export function ChatOverlayView() {
  return (
    <div
      data-slot="chat-overlay"
      className="flex h-screen w-screen flex-col bg-background overflow-hidden rounded-xl border border-border"
    >
      <ChatOverlayContent onHide={() => {}} nativeTitlebar />
    </div>
  );
}
