/**
 * Typography section for editing text content and properties
 */

import type { PenText } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';
import { Input } from '@protolabs-ai/ui/atoms';
import { Textarea } from '@protolabs-ai/ui/atoms';
import { Button } from '@protolabs-ai/ui/atoms';

interface TypographySectionProps {
  node: PenText;
}

export function TypographySection({ node }: TypographySectionProps) {
  const updateNode = useDesignsStore((state) => state.updateNode);

  const handleContentChange = (content: string) => {
    updateNode(node.id, { content });
  };

  const handleFontSizeChange = (fontSize: number) => {
    updateNode(node.id, { fontSize });
  };

  const handleFontWeightChange = (fontWeight: number) => {
    updateNode(node.id, { fontWeight });
  };

  const handleTextAlignChange = (textAlign: PenText['textAlign']) => {
    updateNode(node.id, { textAlign });
  };

  return (
    <div className="rounded-lg bg-card p-3 shadow-sm space-y-3">
      <div className="text-sm font-semibold">Typography</div>

      {/* Content */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Content</div>
        <Textarea
          value={node.content || ''}
          onChange={(e) => handleContentChange(e.target.value)}
          className="w-full text-sm resize-none"
          rows={3}
          aria-label="Text content"
        />
      </div>

      {/* Font Size */}
      {node.fontSize !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Font Size</div>
          <Input
            type="number"
            value={node.fontSize}
            onChange={(e) => handleFontSizeChange(Number(e.target.value))}
            className="w-full text-sm"
            min="1"
            aria-label="Font size"
          />
        </div>
      )}

      {/* Font Weight */}
      {node.fontWeight !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Font Weight</div>
          <select
            value={node.fontWeight}
            onChange={(e) => handleFontWeightChange(Number(e.target.value))}
            className="w-full rounded border border-border bg-card px-2 py-1 text-sm"
            aria-label="Font weight"
          >
            <option value={100}>Thin (100)</option>
            <option value={200}>Extra Light (200)</option>
            <option value={300}>Light (300)</option>
            <option value={400}>Regular (400)</option>
            <option value={500}>Medium (500)</option>
            <option value={600}>Semi Bold (600)</option>
            <option value={700}>Bold (700)</option>
            <option value={800}>Extra Bold (800)</option>
            <option value={900}>Black (900)</option>
          </select>
        </div>
      )}

      {/* Text Align */}
      {node.textAlign !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Text Align</div>
          <div className="flex gap-1">
            {(['left', 'center', 'right', 'justify'] as const).map((align) => (
              <Button
                key={align}
                onClick={() => handleTextAlignChange(align)}
                variant={node.textAlign === align ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs capitalize"
                aria-label={`Align text ${align}`}
              >
                {align}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
