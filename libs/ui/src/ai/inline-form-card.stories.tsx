import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { InlineFormCard } from './inline-form-card.js';

const meta = {
  title: 'AI/InlineFormCard',
  component: InlineFormCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Chat-stream-sized card for collecting structured input inline. Wraps arbitrary form content (e.g. RJSF) with title, description, and submit/cancel actions. Three states: pending, submitted, cancelled.',
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
} satisfies Meta<typeof InlineFormCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── States ─────────────────────────────────────────────────────────────────

export const Pending: Story = {
  args: {
    title: 'Choose deployment target',
    description: 'Select where this feature should be deployed.',
    state: 'pending',
    children: (
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="target" value="staging" defaultChecked />
          <span>Staging</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="target" value="production" />
          <span>Production</span>
        </label>
      </div>
    ),
  },
};

export const Submitted: Story = {
  args: {
    title: 'Choose deployment target',
    state: 'submitted',
  },
};

export const Cancelled: Story = {
  args: {
    title: 'Choose deployment target',
    state: 'cancelled',
  },
};

export const Submitting: Story = {
  args: {
    title: 'Confirm feature priority',
    description: 'Set the priority level for this feature.',
    state: 'pending',
    isSubmitting: true,
    children: (
      <select className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
        <option>Urgent</option>
        <option>High</option>
        <option selected>Normal</option>
        <option>Low</option>
      </select>
    ),
  },
};

// ── Variants ───────────────────────────────────────────────────────────────

export const WithTextInput: Story = {
  args: {
    title: 'Provide additional context',
    description: 'Help the agent understand the requirement better.',
    state: 'pending',
    children: (
      <textarea
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground"
        rows={3}
        placeholder="Describe what you need..."
      />
    ),
  },
};

export const WithMultipleFields: Story = {
  args: {
    title: 'Feature configuration',
    description: 'Set up the feature before the agent starts.',
    state: 'pending',
    submitLabel: 'Start Agent',
    children: (
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Feature name</label>
          <input
            type="text"
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            defaultValue="Add search bar"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Complexity</label>
          <select className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
            <option>Small (Haiku)</option>
            <option selected>Medium (Sonnet)</option>
            <option>Large (Sonnet)</option>
            <option>Architectural (Opus)</option>
          </select>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked />
            <span>Auto-create PR on completion</span>
          </label>
        </div>
      </div>
    ),
  },
};

export const CustomSubmitLabel: Story = {
  args: {
    title: 'Approve deployment',
    description: 'Review and approve the staging deployment.',
    state: 'pending',
    submitLabel: 'Approve',
    children: (
      <div className="rounded bg-muted/50 p-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Deployment summary:</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>3 features merged</li>
          <li>12 files changed</li>
          <li>All CI checks passing</li>
        </ul>
      </div>
    ),
  },
};

export const NoDescription: Story = {
  args: {
    title: 'Quick confirmation',
    state: 'pending',
    children: (
      <p className="text-sm text-muted-foreground">
        Are you sure you want to reset the board to its default state?
      </p>
    ),
  },
};

// ── Interactive ────────────────────────────────────────────────────────────

export const Interactive: Story = {
  render: () => {
    const [state, setState] = useState<'pending' | 'submitted' | 'cancelled'>('pending');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = () => {
      setSubmitting(true);
      setTimeout(() => {
        setSubmitting(false);
        setState('submitted');
      }, 1500);
    };

    const handleReset = () => {
      setState('pending');
      setSubmitting(false);
    };

    return (
      <div className="space-y-4">
        <InlineFormCard
          title="Select resolution"
          description="How should we handle this blocked feature?"
          state={state}
          isSubmitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => setState('cancelled')}
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="resolution" value="retry" defaultChecked />
              <div>
                <span className="font-medium">Retry</span>
                <p className="text-xs text-muted-foreground">Reset and re-run the agent</p>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="resolution" value="skip" />
              <div>
                <span className="font-medium">Skip</span>
                <p className="text-xs text-muted-foreground">Mark as done without implementing</p>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="resolution" value="escalate" />
              <div>
                <span className="font-medium">Escalate</span>
                <p className="text-xs text-muted-foreground">Flag for manual review</p>
              </div>
            </label>
          </div>
        </InlineFormCard>
        {state !== 'pending' && (
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
        I found a blocked feature that needs your input to proceed.
      </div>
      <InlineFormCard
        title="Feature blocked: Authentication flow"
        description="The agent encountered an error and needs guidance."
        state="pending"
      >
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="action" value="retry" defaultChecked />
            <span>Retry with more context</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="action" value="skip" />
            <span>Skip this feature</span>
          </label>
        </div>
      </InlineFormCard>
      <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        Waiting for your response before continuing...
      </div>
    </div>
  ),
};
