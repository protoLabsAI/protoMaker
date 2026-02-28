import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@protolabs-ai/ui/atoms';
import { AnthropicIcon, CursorIcon, OpenAIIcon } from '@/components/shared/provider-icon';
import { Cpu, Zap } from 'lucide-react';
import { CursorSettingsTab } from './cursor-settings-tab';
import { ClaudeSettingsTab } from './claude-settings-tab';
import { CodexSettingsTab } from './codex-settings-tab';
import { OpencodeSettingsTab } from './opencode-settings-tab';
import { GroqSettingsTab } from './groq-settings-tab';

interface ProviderTabsProps {
  defaultTab?: 'claude' | 'cursor' | 'codex' | 'opencode' | 'groq';
}

export function ProviderTabs({ defaultTab = 'claude' }: ProviderTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-5 mb-6">
        <TabsTrigger value="claude" className="flex items-center gap-2">
          <AnthropicIcon className="w-4 h-4" />
          Claude
        </TabsTrigger>
        <TabsTrigger value="cursor" className="flex items-center gap-2">
          <CursorIcon className="w-4 h-4" />
          Cursor
        </TabsTrigger>
        <TabsTrigger value="codex" className="flex items-center gap-2">
          <OpenAIIcon className="w-4 h-4" />
          Codex
        </TabsTrigger>
        <TabsTrigger value="opencode" className="flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          OpenCode
        </TabsTrigger>
        <TabsTrigger value="groq" className="flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Groq
        </TabsTrigger>
      </TabsList>

      <TabsContent value="claude">
        <ClaudeSettingsTab />
      </TabsContent>

      <TabsContent value="cursor">
        <CursorSettingsTab />
      </TabsContent>

      <TabsContent value="codex">
        <CodexSettingsTab />
      </TabsContent>

      <TabsContent value="opencode">
        <OpencodeSettingsTab />
      </TabsContent>

      <TabsContent value="groq">
        <GroqSettingsTab />
      </TabsContent>
    </Tabs>
  );
}

export default ProviderTabs;
