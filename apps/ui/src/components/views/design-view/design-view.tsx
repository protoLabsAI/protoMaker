import { useState, useCallback } from 'react';
import { Palette } from 'lucide-react';
import type { PenThemeSelection } from '@automaker/pen-renderer';
import { useDesignFileList, useDesignFile } from '@/hooks/queries/use-design-files';
import { useAppStore } from '@/store/app-store';
import { FileBrowser } from './components/file-browser';
import { ThemePicker } from './components/theme-picker';
import { CanvasViewport } from './components/canvas-viewport';
import { PropsPanel } from './components/props-panel';

export function DesignView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const projectPath = currentProject?.path;

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [theme, setTheme] = useState<PenThemeSelection>({
    Mode: 'Dark',
    Base: 'Zinc',
    Accent: 'Violet',
  });

  const { data: files, isLoading: isLoadingFiles } = useDesignFileList(projectPath);
  const { data: fileContent, isLoading: isLoadingFile } = useDesignFile(projectPath, selectedFile);

  const handleFileSelect = useCallback((filePath: string) => {
    setSelectedFile(filePath);
    setSelectedNodeId(null);
  }, []);

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  return (
    <div className="flex h-full">
      {/* Left panel — file browser */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Palette className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Designs</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoadingFiles ? (
            <div className="p-4 text-sm text-muted-foreground">Loading...</div>
          ) : (
            <FileBrowser
              files={files ?? []}
              selectedPath={selectedFile}
              onSelect={handleFileSelect}
            />
          )}
        </div>
      </div>

      {/* Main area — canvas + toolbar */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-sm text-muted-foreground">
            {selectedFile ? selectedFile.replace('.pen', '') : 'Select a design file'}
          </span>
          <ThemePicker theme={theme} onChange={setTheme} />
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden">
          {!selectedFile && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Palette className="mx-auto mb-3 size-12 opacity-20" />
                <p className="text-sm">Select a .pen file to preview</p>
              </div>
            </div>
          )}

          {selectedFile && isLoadingFile && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p className="text-sm">Loading design...</p>
            </div>
          )}

          {selectedFile && fileContent && (
            <CanvasViewport json={fileContent} theme={theme} onNodeSelect={handleNodeSelect} />
          )}
        </div>
      </div>

      {/* Right panel — props inspector */}
      {selectedFile && fileContent && selectedNodeId && (
        <PropsPanel
          json={fileContent}
          theme={theme}
          selectedNodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
