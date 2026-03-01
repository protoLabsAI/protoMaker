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
  Timer,
  UserCog,
  Users,
  Zap,
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
  subItems?: (SettingsNavigationItem & { id: SettingsViewId })[];
};

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

// Global settings organized into groups
export const GLOBAL_NAV_GROUPS: NavigationGroup[] = [
  {
    label: 'Model & Prompts',
    items: [
      { id: 'defaults', label: 'Feature Defaults', icon: FlaskConical },
      { id: 'model-defaults', label: 'Model Defaults', icon: Workflow },
      { id: 'worktrees', label: 'Worktrees', icon: GitBranch },
      { id: 'prompts', label: 'Prompt Customization', icon: MessageSquareText },
      { id: 'api-keys', label: 'API Keys', icon: Key },
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
        ],
      },
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
      { id: 'event-hooks', label: 'Event Hooks', icon: Webhook },
      { id: 'integrations', label: 'Integrations', icon: Plug },
    ],
  },
  {
    label: 'Account & Security',
    items: [
      { id: 'account', label: 'Account', icon: User },
      { id: 'profile', label: 'User Profile', icon: UserCog },
      { id: 'security', label: 'Security', icon: Shield },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'health', label: 'Health', icon: Activity },
      { id: 'personas', label: 'Personas', icon: Users },
      { id: 'workflow', label: 'Workflow', icon: Cog },
      { id: 'maintenance', label: 'Maintenance', icon: Timer },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { id: 'automations', label: 'Automations', icon: Zap },
      { id: 'developer', label: 'Developer', icon: Code2 },
    ],
  },
];

// Flat list of all global nav items for backwards compatibility
export const GLOBAL_NAV_ITEMS: NavigationItem[] = GLOBAL_NAV_GROUPS.flatMap((group) => group.items);

// Legacy export for backwards compatibility
export const NAV_ITEMS: NavigationItem[] = GLOBAL_NAV_ITEMS;
