/**
 * Drop zone visual indicator for valid drop targets
 */

interface DropZoneProps {
  isOver: boolean;
  children: React.ReactNode;
}

export function DropZone({ isOver, children }: DropZoneProps) {
  return (
    <div
      className="relative"
      style={{
        outline: isOver ? '2px solid hsl(var(--primary))' : undefined,
        outlineOffset: isOver ? '2px' : undefined,
      }}
    >
      {children}
    </div>
  );
}
