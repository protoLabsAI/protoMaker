/**
 * Zoomable and pannable canvas for rendering Pen designs
 */

import { useState, useRef, useEffect, useMemo, type MouseEvent } from 'react';
import type { PenDocument as PenDocumentParsed } from '@protolabs-ai/types';
import type { PenDocument } from '@/store/designs-store';
import { PenNodeRenderer } from './renderer';
import { PenThemeProvider } from './renderer/pen-theme-context';
import { DesignsToolbar } from './designs-toolbar';

interface DesignsCanvasProps {
  penFile: PenDocument | null;
}

export function DesignsCanvas({ penFile }: DesignsCanvasProps) {
  // Parse the raw PEN content into a structured document
  const document = useMemo<PenDocumentParsed | null>(() => {
    if (!penFile?.content) return null;
    try {
      const parsed = JSON.parse(penFile.content);
      if (parsed.version && Array.isArray(parsed.children)) {
        return parsed as PenDocumentParsed;
      }
      return null;
    } catch {
      return null;
    }
  }, [penFile]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Handle mouse wheel for zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom((prev) => Math.max(0.1, Math.min(5, prev * delta)));
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, []);

  // Handle pan start
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  };

  // Handle pan move
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  // Handle pan end
  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Handle zoom controls
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(5, prev * 1.2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.1, prev / 1.2));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (!document || !document.children || document.children.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>No design to display</p>
      </div>
    );
  }

  return (
    <PenThemeProvider themes={document.themes || []} variables={document.variables || []}>
      {({ selectedTheme, onThemeChange }) => (
        <div className="relative h-full w-full overflow-hidden bg-gray-50 flex flex-col">
          {/* Theme switcher toolbar */}
          {document.themes && document.themes.length > 0 && (
            <div className="absolute left-4 top-4 z-20">
              <DesignsToolbar
                themes={document.themes}
                selectedTheme={selectedTheme}
                onThemeChange={onThemeChange}
              />
            </div>
          )}

          <div
            ref={canvasRef}
            className="relative h-full w-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isPanning ? 'grabbing' : 'default' }}
          >
            {/* Zoom controls */}
            <div className="absolute right-4 top-4 z-10 flex flex-col gap-2 rounded-lg bg-white p-2 shadow-md">
              <button
                onClick={handleZoomIn}
                className="rounded px-3 py-1 hover:bg-gray-100"
                title="Zoom in (Ctrl + scroll)"
              >
                +
              </button>
              <div className="px-3 py-1 text-center text-sm">{Math.round(zoom * 100)}%</div>
              <button
                onClick={handleZoomOut}
                className="rounded px-3 py-1 hover:bg-gray-100"
                title="Zoom out (Ctrl + scroll)"
              >
                −
              </button>
              <button
                onClick={handleResetView}
                className="rounded px-3 py-1 hover:bg-gray-100"
                title="Reset view"
              >
                ⟲
              </button>
            </div>

            {/* Instructions */}
            <div className="absolute left-4 bottom-4 z-10 rounded-lg bg-white p-3 text-sm shadow-md">
              <div className="font-semibold">Controls:</div>
              <div className="text-xs text-gray-600">
                <div>Ctrl/Cmd + Scroll: Zoom</div>
                <div>Ctrl/Cmd + Drag: Pan</div>
              </div>
            </div>

            {/* Canvas content */}
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center',
              }}
            >
              <div className="rounded-lg bg-white p-8 shadow-lg">
                {document.children.map((node) => (
                  <PenNodeRenderer key={node.id} node={node} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </PenThemeProvider>
  );
}
