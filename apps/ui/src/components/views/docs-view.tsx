import { useEffect, useState } from 'react';
import { Library, FolderOpen, FolderX, Settings } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { PanelHeader } from '@/components/shared/panel-header';
import { DocsFileTree } from './docs-view/docs-file-tree';
import { DocsContentPanel } from './docs-view/docs-content-panel';
import { getApiKey, getSessionToken } from '@/lib/http-api-client';

function getAuthHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  if (apiKey) return { 'X-API-Key': apiKey };
  const sessionToken = getSessionToken();
  return sessionToken ? { 'X-Session-Token': sessionToken } : {};
}

interface DocsConfig {
  docsPath?: string;
  resolvedPath: string | null;
  exists: boolean;
  disabled: boolean;
}

function useDocsConfig(projectPath: string | undefined) {
  const [config, setConfig] = useState<DocsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!projectPath) {
      setConfig(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/docs/config?projectPath=${encodeURIComponent(projectPath)}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return { config, isLoading };
}

export function DocsView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const navigate = useNavigate();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const { config, isLoading: isLoadingConfig } = useDocsConfig(currentProject?.path);

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Select a project to view docs</p>
      </div>
    );
  }

  if (isLoadingConfig) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader icon={Library} title="Docs" />
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <p className="text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Disabled or directory not found — point to project settings
  if (config?.disabled || !config?.exists) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader icon={Library} title="Docs" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          {config?.disabled ? (
            <FolderX className="size-10 text-muted-foreground/30" />
          ) : (
            <FolderOpen className="size-10 text-muted-foreground/30" />
          )}
          <p className="text-sm text-muted-foreground">
            {config?.disabled ? (
              'Docs viewer is disabled for this project.'
            ) : config?.resolvedPath ? (
              <>
                Docs folder <code className="rounded bg-muted px-1">{config.resolvedPath}</code> was
                not found.
              </>
            ) : (
              'No docs folder configured for this project.'
            )}
          </p>
          <button
            onClick={() => navigate({ to: '/project-settings' })}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Settings className="size-3" />
            Configure in Project Settings
          </button>
        </div>
      </div>
    );
  }

  // Normal docs view
  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={Library} title="Docs" />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 shrink-0 overflow-y-auto border-r border-border">
          <DocsFileTree
            projectPath={currentProject.path}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <DocsContentPanel projectPath={currentProject.path} selectedPath={selectedPath} />
        </div>
      </div>
    </div>
  );
}
