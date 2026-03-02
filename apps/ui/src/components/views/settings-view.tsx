import { useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { useThemeStore } from '@/store/theme-store';
import { useAIModelsStore } from '@/store/ai-models-store';
import { useWorktreeStore } from '@/store/worktree-store';
import { Cog, FileJson } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
import { useSettingsNavigation } from '@/components/shared/settings';

import { useSettingsView, type SettingsViewId } from './settings-view/hooks';
import { SettingsHeader } from './settings-view/components/settings-header';
import { KeyboardMapDialog } from './settings-view/components/keyboard-map-dialog';
import { SettingsNavigation } from './settings-view/components/settings-navigation';
import { ApiKeysSection } from './settings-view/api-keys/api-keys-section';
import { ModelDefaultsSection } from './settings-view/model-defaults';
import { AppearanceSection } from './settings-view/appearance/appearance-section';
import { TerminalSection } from './settings-view/terminal/terminal-section';
import { AudioSection } from './settings-view/audio/audio-section';
import { KeyboardShortcutsSection } from './settings-view/keyboard-shortcuts/keyboard-shortcuts-section';
import { FeatureDefaultsSection } from './settings-view/feature-defaults/feature-defaults-section';
import { WorktreesSection } from './settings-view/worktrees';
import { AccountSection } from './settings-view/account';
import { SecuritySection } from './settings-view/security';
import { DeveloperSection } from './settings-view/developer/developer-section';
import { HealthSection } from './settings-view/health';
import {
  ClaudeSettingsTab,
  CursorSettingsTab,
  CodexSettingsTab,
  OpencodeSettingsTab,
  GroqSettingsTab,
  OpenAICompatibleTab,
} from './settings-view/providers';
import { MCPServersSection } from './settings-view/mcp-servers';
import { PromptCustomizationSection } from './settings-view/prompts';
import { EventHooksSection } from './settings-view/event-hooks';
import { IntegrationsSection } from './settings-view/integrations';
import { ProfileSection } from './settings-view/profile';
import { PersonasSection } from './settings-view/personas';
import { WorkflowSettingsPanel } from './settings-view/workflow/workflow-settings-panel';
import { MaintenanceSection } from './settings-view/maintenance';
import { AutomationsSection } from './settings-view/automations/automations-section';
import { SensorsSection } from './settings-view/sensors/sensors-section';
import { ImportExportDialog } from './settings-view/components/import-export-dialog';
import { SettingsScopeToggle } from './settings-view/components/settings-scope-toggle';
import type { Theme } from './settings-view/shared/types';

export function SettingsView() {
  const navigate = useNavigate();
  const {
    defaultSkipTests,
    setDefaultSkipTests,
    enableDependencyBlocking,
    setEnableDependencyBlocking,
    skipVerificationInAutoMode,
    setSkipVerificationInAutoMode,
    enableAiCommitMessages,
    setEnableAiCommitMessages,
    muteDoneSound,
    setMuteDoneSound,
    defaultPlanningMode,
    setDefaultPlanningMode,
    defaultRequirePlanApproval,
    setDefaultRequirePlanApproval,
    defaultFeatureModel,
    setDefaultFeatureModel,
    promptCustomization,
    setPromptCustomization,
  } = useAppStore();
  const { skipSandboxWarning, setSkipSandboxWarning } = useAIModelsStore();
  const { theme, setTheme } = useThemeStore();
  const { useWorktrees, setUseWorktrees } = useWorktreeStore();

  // Global theme (project-specific themes are managed in Project Settings)
  const globalTheme = theme as Theme;

  // Get initial view from URL search params
  const { view: initialView } = useSearch({ from: '/settings' });

  // Use settings view navigation hook
  const { activeView, navigateTo } = useSettingsView({ initialView });

  // Handle navigation - if navigating to 'providers', default to 'claude-provider'
  const handleNavigate = (viewId: SettingsViewId) => {
    if (viewId === 'providers') {
      navigateTo('claude-provider');
    } else {
      navigateTo(viewId);
    }
  };

  const [showKeyboardMapDialog, setShowKeyboardMapDialog] = useState(false);
  const [showImportExportDialog, setShowImportExportDialog] = useState(false);

  // Shared mobile navigation state
  const { showNavigation, setShowNavigation, toggleNavigation } = useSettingsNavigation(activeView);

  // Render the active section based on current view
  const renderActiveSection = () => {
    switch (activeView) {
      case 'claude-provider':
        return <ClaudeSettingsTab />;
      case 'cursor-provider':
        return <CursorSettingsTab />;
      case 'codex-provider':
        return <CodexSettingsTab />;
      case 'opencode-provider':
        return <OpencodeSettingsTab />;
      case 'groq-provider':
        return <GroqSettingsTab />;
      case 'openai-compatible-provider':
        return <OpenAICompatibleTab />;
      case 'providers':
      case 'claude': // Backwards compatibility - redirect to claude-provider
        return <ClaudeSettingsTab />;
      case 'mcp-servers':
        return <MCPServersSection />;
      case 'prompts':
        return (
          <PromptCustomizationSection
            promptCustomization={promptCustomization}
            onPromptCustomizationChange={setPromptCustomization}
          />
        );
      case 'model-defaults':
        return <ModelDefaultsSection />;
      case 'appearance':
        return (
          <AppearanceSection
            effectiveTheme={globalTheme}
            onThemeChange={(newTheme) => setTheme(newTheme as typeof theme)}
          />
        );
      case 'terminal':
        return <TerminalSection />;
      case 'keyboard':
        return (
          <KeyboardShortcutsSection onOpenKeyboardMap={() => setShowKeyboardMapDialog(true)} />
        );
      case 'audio':
        return (
          <AudioSection muteDoneSound={muteDoneSound} onMuteDoneSoundChange={setMuteDoneSound} />
        );
      case 'event-hooks':
        return <EventHooksSection />;
      case 'integrations':
        return <IntegrationsSection />;
      case 'defaults':
        return (
          <FeatureDefaultsSection
            defaultSkipTests={defaultSkipTests}
            enableDependencyBlocking={enableDependencyBlocking}
            skipVerificationInAutoMode={skipVerificationInAutoMode}
            defaultPlanningMode={defaultPlanningMode}
            defaultRequirePlanApproval={defaultRequirePlanApproval}
            enableAiCommitMessages={enableAiCommitMessages}
            defaultFeatureModel={defaultFeatureModel}
            onDefaultSkipTestsChange={setDefaultSkipTests}
            onEnableDependencyBlockingChange={setEnableDependencyBlocking}
            onSkipVerificationInAutoModeChange={setSkipVerificationInAutoMode}
            onDefaultPlanningModeChange={setDefaultPlanningMode}
            onDefaultRequirePlanApprovalChange={setDefaultRequirePlanApproval}
            onEnableAiCommitMessagesChange={setEnableAiCommitMessages}
            onDefaultFeatureModelChange={setDefaultFeatureModel}
          />
        );
      case 'worktrees':
        return (
          <WorktreesSection useWorktrees={useWorktrees} onUseWorktreesChange={setUseWorktrees} />
        );
      case 'account':
        return <AccountSection />;
      case 'profile':
        return <ProfileSection />;
      case 'personas':
        return <PersonasSection />;
      case 'security':
        return (
          <SecuritySection
            skipSandboxWarning={skipSandboxWarning}
            onSkipSandboxWarningChange={setSkipSandboxWarning}
          />
        );
      case 'health':
        return <HealthSection />;
      case 'workflow':
        return <WorkflowSettingsPanel />;
      case 'maintenance':
        return <MaintenanceSection />;
      case 'automations':
        return <AutomationsSection />;
      case 'sensors':
        return <SensorsSection />;
      case 'developer':
        return <DeveloperSection />;
      default:
        return <ApiKeysSection />;
    }
  };

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-hidden content-bg"
      data-testid="settings-view"
    >
      {/* Header Section */}
      <SettingsHeader
        icon={Cog}
        title="Global Settings"
        showNavigation={showNavigation}
        onToggleNavigation={toggleNavigation}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportExportDialog(true)}
            className="gap-2"
          >
            <FileJson className="w-4 h-4" />
            <span className="hidden sm:inline">Import / Export</span>
          </Button>
        }
      />

      {/* Scope Toggle */}
      <div className="shrink-0 px-4 py-2 border-b border-border/30">
        <SettingsScopeToggle
          active="global"
          onSwitch={(scope) => {
            if (scope === 'project') navigate({ to: '/project-settings' });
          }}
        />
      </div>

      {/* Content Area with Sidebar */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Side Navigation - Overlay on mobile, sidebar on desktop */}
        <SettingsNavigation
          activeSection={activeView}
          onNavigate={handleNavigate}
          isOpen={showNavigation}
          onClose={() => setShowNavigation(false)}
        />

        {/* Content Panel - Shows only the active section */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-4xl mx-auto">{renderActiveSection()}</div>
        </div>
      </div>

      {/* Keyboard Map Dialog */}
      <KeyboardMapDialog open={showKeyboardMapDialog} onOpenChange={setShowKeyboardMapDialog} />

      {/* Import/Export Settings Dialog */}
      <ImportExportDialog open={showImportExportDialog} onOpenChange={setShowImportExportDialog} />
    </div>
  );
}
