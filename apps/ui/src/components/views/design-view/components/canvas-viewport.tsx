import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Maximize } from 'lucide-react';
import type { PenThemeSelection } from '@automaker/pen-renderer';
import { PenRenderer } from '@/components/pen-renderer';

interface CanvasViewportProps {
  json: string;
  theme: PenThemeSelection;
  onNodeSelect?: (nodeId: string | null) => void;
}

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const FIT_PADDING = 40;

/** Extract the root frame dimensions from raw .pen JSON */
function getCanvasSize(json: string): { width: number; height: number } | null {
  try {
    const doc = JSON.parse(json);
    const children = doc.children ?? [];
    if (children.length === 0) return null;

    // Find bounds across all top-level children
    let maxRight = 0;
    let maxBottom = 0;
    for (const child of children) {
      const x = child.x ?? 0;
      const y = child.y ?? 0;
      const w = typeof child.width === 'number' ? child.width : 0;
      const h = typeof child.height === 'number' ? child.height : 0;
      maxRight = Math.max(maxRight, x + w);
      maxBottom = Math.max(maxBottom, y + h);
    }

    // If root has explicit dimensions, use those
    const rootW = typeof doc.width === 'number' ? doc.width : maxRight;
    const rootH = typeof doc.height === 'number' ? doc.height : maxBottom;

    return rootW > 0 && rootH > 0 ? { width: rootW, height: rootH } : null;
  } catch {
    return null;
  }
}

export function CanvasViewport({ json, theme, onNodeSelect }: CanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const hasAutoFitted = useRef(false);

  const canvasSize = useMemo(() => getCanvasSize(json), [json]);

  // Track container size via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Calculate fit-to-view zoom and pan
  const fitToView = useCallback(() => {
    if (!canvasSize || containerSize.width === 0 || containerSize.height === 0) return;

    const scaleX = (containerSize.width - FIT_PADDING * 2) / canvasSize.width;
    const scaleY = (containerSize.height - FIT_PADDING * 2) / canvasSize.height;
    const fitZoom = Math.min(scaleX, scaleY, MAX_ZOOM);
    const clampedZoom = Math.max(MIN_ZOOM, fitZoom);

    // Center the canvas in the viewport
    const scaledW = canvasSize.width * clampedZoom;
    const scaledH = canvasSize.height * clampedZoom;
    const panX = (containerSize.width - scaledW) / 2;
    const panY = (containerSize.height - scaledH) / 2;

    setZoom(clampedZoom);
    setPan({ x: panX, y: panY });
  }, [canvasSize, containerSize]);

  // Auto-fit on first render when container size is known
  useEffect(() => {
    if (hasAutoFitted.current) return;
    if (containerSize.width > 0 && containerSize.height > 0 && canvasSize) {
      fitToView();
      hasAutoFitted.current = true;
    }
  }, [containerSize, canvasSize, fitToView]);

  // Reset auto-fit flag when json changes (new file loaded)
  useEffect(() => {
    hasAutoFitted.current = false;
  }, [json]);

  // Use non-passive wheel listener so preventDefault works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle mouse button or alt+click for panning
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    },
    [isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm">
        <button
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
          className="px-1 hover:text-foreground"
          title="Zoom out"
        >
          -
        </button>
        <span className="min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
          className="px-1 hover:text-foreground"
          title="Zoom in"
        >
          +
        </button>
        <div className="mx-1 h-3 w-px bg-border" />
        <button onClick={fitToView} className="px-1 hover:text-foreground" title="Fit to view">
          <Maximize className="size-3" />
        </button>
      </div>

      {/* Canvas area — neutral gray background like Figma */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{
          cursor: isPanning ? 'grabbing' : 'default',
          backgroundColor: '#1a1a1e',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: 'fit-content',
          }}
        >
          <PenRenderer json={json} theme={theme} showDefinitions onNodeSelect={onNodeSelect} />
        </div>
      </div>
    </div>
  );
}
