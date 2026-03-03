import { Button } from '@protolabs-ai/ui/atoms';
import {
  HeaderActionsPanel,
  HeaderActionsPanelTrigger,
} from '@/components/shared/header-actions-panel';
import { PanelHeader } from '@/components/shared/panel-header';
import type { PanelHeaderAction } from '@/components/shared/panel-header';
import { Save, Sparkles, FileText, AlertCircle, ListPlus, RefreshCcw } from 'lucide-react';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { PHASE_LABELS } from '../constants';

interface SpecHeaderProps {
  projectPath: string;
  isRegenerating: boolean;
  isCreating: boolean;
  isGeneratingFeatures: boolean;
  isSyncing: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  currentPhase: string;
  errorMessage: string;
  onRegenerateClick: () => void;
  onGenerateFeaturesClick: () => void;
  onSyncClick: () => void;
  onSaveClick: () => void;
  showActionsPanel: boolean;
  onToggleActionsPanel: () => void;
  // Mode-related props for save button visibility
  showSaveButton: boolean;
}

export function SpecHeader({
  projectPath,
  isRegenerating,
  isCreating,
  isGeneratingFeatures,
  isSyncing,
  isSaving,
  hasChanges,
  currentPhase,
  errorMessage,
  onRegenerateClick,
  onGenerateFeaturesClick,
  onSyncClick,
  onSaveClick,
  showActionsPanel,
  onToggleActionsPanel,
  showSaveButton,
}: SpecHeaderProps) {
  const isProcessing = isRegenerating || isCreating || isGeneratingFeatures || isSyncing;
  const phaseLabel = PHASE_LABELS[currentPhase] || currentPhase;

  const specActions: PanelHeaderAction[] = isProcessing
    ? []
    : [
        {
          icon: RefreshCcw,
          label: 'Sync',
          onClick: onSyncClick,
          desktopOnly: true,
          testId: 'sync-spec',
        },
        {
          icon: Sparkles,
          label: 'Regenerate',
          onClick: onRegenerateClick,
          desktopOnly: true,
          testId: 'regenerate-spec',
        },
        {
          icon: ListPlus,
          label: 'Generate features',
          onClick: onGenerateFeaturesClick,
          desktopOnly: true,
          testId: 'generate-features',
        },
        ...(showSaveButton
          ? [
              {
                icon: Save,
                label: 'Save',
                onClick: onSaveClick,
                disabled: !hasChanges || isSaving,
                desktopOnly: true,
                testId: 'save-spec',
              } as PanelHeaderAction,
            ]
          : []),
      ];

  return (
    <>
      <PanelHeader
        icon={FileText}
        title="App Specification"
        actions={specActions}
        extra={
          <div className="flex items-center gap-2">
            {isProcessing && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-primary/10 border border-primary/20">
                <Spinner size="sm" />
                <span className="text-xs font-medium text-primary">
                  {isSyncing
                    ? 'Syncing...'
                    : isGeneratingFeatures
                      ? 'Generating...'
                      : isCreating
                        ? 'Creating...'
                        : 'Regenerating...'}
                </span>
              </div>
            )}
            {errorMessage && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs font-medium text-destructive truncate max-w-[200px]">
                  {errorMessage}
                </span>
              </div>
            )}
            <HeaderActionsPanelTrigger isOpen={showActionsPanel} onToggle={onToggleActionsPanel} />
          </div>
        }
      />

      {/* Actions Panel (tablet/mobile) */}
      <HeaderActionsPanel
        isOpen={showActionsPanel}
        onClose={onToggleActionsPanel}
        title="Specification Actions"
      >
        {/* Status messages in panel */}
        {isProcessing && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Spinner size="sm" className="shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-primary">
                {isSyncing
                  ? 'Syncing Specification'
                  : isGeneratingFeatures
                    ? 'Generating Features'
                    : isCreating
                      ? 'Generating Specification'
                      : 'Regenerating Specification'}
              </span>
              {currentPhase && <span className="text-xs text-muted-foreground">{phaseLabel}</span>}
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-destructive">Error</span>
              <span className="text-xs text-destructive/80">{errorMessage}</span>
            </div>
          </div>
        )}
        {/* Hide action buttons when processing - status card shows progress */}
        {!isProcessing && (
          <>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onSyncClick}
              data-testid="sync-spec-mobile"
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              Sync
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onRegenerateClick}
              data-testid="regenerate-spec-mobile"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Regenerate
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onGenerateFeaturesClick}
              data-testid="generate-features-mobile"
            >
              <ListPlus className="w-4 h-4 mr-2" />
              Generate Features
            </Button>
            {showSaveButton && (
              <Button
                className="w-full justify-start"
                onClick={onSaveClick}
                disabled={!hasChanges || isSaving}
                data-testid="save-spec-mobile"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Saved'}
              </Button>
            )}
          </>
        )}
      </HeaderActionsPanel>
    </>
  );
}
