import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResearchStep } from './research-step';

const meta = {
  title: 'Projects/Steps/ResearchStep',
  component: ResearchStep,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-3xl mx-auto">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ResearchStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Test Project',
      goal: 'Test goal',
      status: 'drafting',
      milestones: [],
    } as never,
    onContinue: () => {},
    onSkip: () => {},
  },
};

export const Complete: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Test Project',
      goal: 'Test goal',
      status: 'drafting',
      researchStatus: 'complete',
      researchSummary: `## Summary\n\nThe codebase uses Express 5 with WebSocket streaming. Key patterns include...\n\n## Codebase Findings\n\n- Authentication middleware in \`src/middleware/auth.ts\`\n- Session management via Redis\n\n## Recommended Approach\n\nUse JWT with refresh tokens stored server-side.`,
      milestones: [],
    } as never,
    onContinue: () => {},
    onSkip: () => {},
  },
};

export const Failed: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Test Project',
      goal: 'Test goal',
      status: 'drafting',
      researchStatus: 'failed',
      milestones: [],
    } as never,
    onContinue: () => {},
    onSkip: () => {},
  },
};
