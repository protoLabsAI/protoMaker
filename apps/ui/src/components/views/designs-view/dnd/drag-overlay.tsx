/**
 * Drag overlay ghost preview
 * Shows a preview of the component being dragged
 */

import type { PenNode, PenDocument } from '@protolabs-ai/types';
import { PenNodeRenderer } from '../renderer/pen-node-renderer';
import { PenThemeProvider } from '../renderer/pen-theme-context';

interface DragOverlayContentProps {
  node: PenNode | null;
  document: PenDocument | null;
}

/**
 * Renders the ghost preview during drag
 */
export function DragOverlayContent({ node, document }: DragOverlayContentProps) {
  if (!node) return null;

  return (
    <div
      className="pointer-events-none rounded-lg border-2 border-primary bg-background/90 shadow-lg"
      style={{
        width: '120px',
        height: '80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
      }}
    >
      <div
        style={{
          transform: 'scale(0.4)',
          transformOrigin: 'center',
        }}
      >
        <PenThemeProvider document={document}>
          <PenNodeRenderer node={node} />
        </PenThemeProvider>
      </div>
    </div>
  );
}
