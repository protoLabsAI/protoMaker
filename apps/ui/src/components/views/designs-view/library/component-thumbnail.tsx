/**
 * Component thumbnail renderer
 * Renders a scaled-down preview of a reusable component
 */

import type { PenNode, PenDocument } from '@protolabs-ai/types';
import { PenNodeRenderer } from '../renderer/pen-node-renderer';
import { PenThemeProvider } from '../renderer/pen-theme-context';

interface ComponentThumbnailProps {
  node: PenNode;
  document: PenDocument | null;
  onClick?: () => void;
}

/**
 * Renders a thumbnail preview of a component at reduced scale
 */
export function ComponentThumbnail({ node, document, onClick }: ComponentThumbnailProps) {
  return (
    <button
      onClick={onClick}
      className="group relative h-16 w-full overflow-hidden rounded-lg border border-border bg-muted/30 hover:border-primary hover:bg-muted/50 transition-colors"
      title={node.name || node.id}
      aria-label={`Select component: ${node.name || node.id}`}
    >
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div
          className="origin-center"
          style={{
            transform: 'scale(0.5)',
          }}
        >
          <PenThemeProvider document={document}>
            <PenNodeRenderer node={node} />
          </PenThemeProvider>
        </div>
      </div>
    </button>
  );
}
