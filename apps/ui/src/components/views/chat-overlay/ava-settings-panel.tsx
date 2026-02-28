/**
 * AvaSettingsPanel — Settings popover for the Ava chat overlay.
 *
 * Provides project-scoped configuration options for the Ava assistant.
 * Displayed when the user clicks the gear icon in the chat overlay header.
 */

import { Settings } from 'lucide-react';

export interface AvaSettingsPanelProps {
  /** Absolute path of the current project */
  projectPath?: string;
}

export function AvaSettingsPanel({ projectPath }: AvaSettingsPanelProps) {
  return (
    <div data-slot="ava-settings-panel" className="p-4 space-y-3">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Settings className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Ava Settings</span>
      </div>

      {projectPath ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Project
          </p>
          <p className="text-xs text-foreground truncate" title={projectPath}>
            {projectPath}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No project selected.</p>
      )}
    </div>
  );
}
