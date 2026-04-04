import {
  Key,
  Bot,
  SquareTerminal,
  Palette,
  Settings2,
  Volume2,
  FlaskConical,
  Workflow,
  Plug,
  Server,
  MessageSquareText,
  User,
  Shield,
  GitBranch,
  Code2,
  Webhook,
  Activity,
  Cog,
  UserCog,
  Zap,
  Radio,
  GitMerge,
  Network,
} from 'lucide-react';
import {
  AnthropicIcon,
  CursorIcon,
  OpenAIIcon,
  OpenCodeIcon,
} from '@/components/shared/provider-icon';
import type { SettingsNavigationItem } from '@/components/shared/settings';
import type { SettingsViewId } from '../hooks/use-settings-view';

export type { SettingsNavigationItem };

export type NavigationItem = SettingsNavigationItem & {
  id: SettingsViewId;
  description?: string;
  subItems?: (SettingsNavigationItem & { id: SettingsViewId })[];
};

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

// Global settings organized into groups
export const GLOBAL_NAV_GROUPS: NavigationGroup[] = [
  {
    label: 'AI and Models',
    items: [
      { id: 'model-defaults', label: 'Model Defaults', icon: Workflow },
      {
        id: 'providers',
        label: 'AI Providers',
        icon: Bot,
        subItems: [
          { id: 'claude-provider', label: 'Claude', icon: AnthropicIcon },
          { id: 'cursor-provider', label: 'Cursor', icon: CursorIcon },
          { id: 'codex-provider', label: 'Codex', icon: OpenAIIcon },
          { id: 'opencode-provider', label: 'OpenCode', icon: OpenCodeIcon },
          { id: 'groq-provider', label: 'Groq', icon: Zap },
          { id: 'openai-compatible-provider', label: 'OpenAI-Compatible', icon: Server },
          { id: 'litellm-gateway-provider', label: 'LiteLLM Gateway', icon: Network },
        ],
      },
      { id: 'api-keys', label: 'API Keys', icon: Key },
      { id: 'prompts', label: 'Prompt Customization', icon: MessageSquareText },
      { id: 'mcp-servers', label: 'MCP Servers', icon: Server },
    ],
  },
  {
    label: 'Interface',
    items: [
      { id: 'appearance', label: 'Appearance', icon: Palette },
      { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
      { id: 'keyboard', label: 'Keyboard Shortcuts', icon: Settings2 },
      { id: 'audio', label: 'Audio', icon: Volume2 },
    ],
  },
  {
    label: 'Pipeline and Automation',
    items: [
      { id: 'defaults', label: 'Feature Defaults', icon: FlaskConical },
      { id: 'worktrees', label: 'Worktrees', icon: GitBranch },
      {
        id: 'workflow',
        label: 'Workflow',
        icon: Cog,
        description: 'Per-project pipeline settings',
      },
      { id: 'automations', label: 'Automations', icon: Zap },
      { id: 'sensors', label: 'Sensors', icon: Radio },
      { id: 'event-hooks', label: 'Event Hooks', icon: Webhook },
    ],
  },
  {
    label: 'Integrations',
    items: [{ id: 'integrations', label: 'Integrations', icon: Plug }],
  },
  {
    label: 'System',
    items: [
      { id: 'health', label: 'Health', icon: Activity },
      { id: 'account', label: 'Account', icon: User },
      { id: 'profile', label: 'User Profile', icon: UserCog },
      { id: 'security', label: 'Security', icon: Shield },
      {
        id: 'git-workflow-defaults',
        label: 'Git Workflow Defaults',
        icon: GitMerge,
        description: 'Global git automation defaults',
      },
      { id: 'developer', label: 'Developer', icon: Code2 },
    ],
  },
];

// Flat list of all global nav items for backwards compatibility
export const GLOBAL_NAV_ITEMS: NavigationItem[] = GLOBAL_NAV_GROUPS.flatMap((group) => group.items);

// Legacy export for backwards compatibility
export const NAV_ITEMS: NavigationItem[] = GLOBAL_NAV_ITEMS;
