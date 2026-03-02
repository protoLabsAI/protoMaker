import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ConfirmationCard } from './confirmation-card.js';

const meta = {
  title: 'AI/ConfirmationCard',
  component: ConfirmationCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Inline confirmation card for destructive tool calls. Renders in the chat message stream when a tool call requires human approval. Three states: approval-requested, approval-responded, output-denied.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md space-y-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfirmationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── States ─────────────────────────────────────────────────────────────────

export const ApprovalRequested: Story = {
  args: {
    toolName: 'delete_feature',
    input: { featureId: 'feature-abc123' },
    state: 'approval-requested',
  },
};

export const ApprovalResponded: Story = {
  args: {
    toolName: 'delete_feature',
    input: { featureId: 'feature-abc123' },
    state: 'approval-responded',
  },
};

export const OutputDenied: Story = {
  args: {
    toolName: 'delete_feature',
    input: { featureId: 'feature-abc123' },
    state: 'output-denied',
  },
};

// ── Tool Variants ──────────────────────────────────────────────────────────

export const StopAgent: Story = {
  args: {
    toolName: 'stop_agent',
    input: { sessionId: 'session-xyz789' },
    state: 'approval-requested',
  },
};

export const StartAutoMode: Story = {
  args: {
    toolName: 'start_auto_mode',
    input: { maxConcurrency: 3 },
    state: 'approval-requested',
  },
};

export const UpdateSpec: Story = {
  args: {
    toolName: 'update_project_spec',
    state: 'approval-requested',
  },
};

export const CustomSummary: Story = {
  args: {
    toolName: 'custom_tool',
    summary: 'Deploy 5 features to production',
    state: 'approval-requested',
  },
};

export const UnknownTool: Story = {
  args: {
    toolName: 'some_unknown_destructive_tool',
    state: 'approval-requested',
  },
};

// ── Interactive ────────────────────────────────────────────────────────────

export const Interactive: Story = {
  render: () => {
    const [state, setState] = useState<
      'approval-requested' | 'approval-responded' | 'output-denied'
    >('approval-requested');

    const handleReset = () => setState('approval-requested');

    return (
      <div className="space-y-4">
        <ConfirmationCard
          toolName="delete_feature"
          input={{ featureId: 'feature-important-123' }}
          state={state}
          onApprove={() => setState('approval-responded')}
          onReject={() => setState('output-denied')}
        />
        {state !== 'approval-requested' && (
          <button
            onClick={handleReset}
            className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-muted/80"
          >
            Reset
          </button>
        )}
      </div>
    );
  },
};

// ── In Context ─────────────────────────────────────────────────────────────

export const InChatStream: Story = {
  render: () => (
    <div className="space-y-2">
      <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
        I need to delete the stale feature blocking the pipeline.
      </div>
      <ConfirmationCard
        toolName="delete_feature"
        input={{ featureId: 'feature-stale-456' }}
        state="approval-requested"
      />
      <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        Waiting for approval...
      </div>
    </div>
  ),
};
