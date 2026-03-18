import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlanStep } from './plan-step';

const meta = {
  title: 'Projects/Steps/PlanStep',
  component: PlanStep,
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
} satisfies Meta<typeof PlanStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Test Project',
      goal: 'Test goal',
      status: 'drafting',
      milestones: [],
    } as never,
    projectSlug: 'test-project',
    onContinue: () => {},
  },
};

export const WithMilestones: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Auth System Overhaul',
      goal: 'Replace auth middleware',
      status: 'reviewing',
      milestones: [
        {
          number: 1,
          slug: 'foundation',
          title: 'Foundation',
          description: 'Core types and JWT infrastructure',
          status: 'planned',
          phases: [
            {
              number: 1,
              name: 'types',
              title: 'Core Type Definitions',
              description: 'Define JWT payload, session, and token types',
              complexity: 'small',
              acceptanceCriteria: ['Types compile', 'Exported from @protolabsai/types'],
              filesToModify: ['libs/types/src/auth.ts'],
            },
            {
              number: 2,
              name: 'jwt-service',
              title: 'JWT Service',
              description: 'Sign, verify, and refresh JWT tokens',
              complexity: 'medium',
              acceptanceCriteria: ['Sign/verify works', 'Refresh rotation works'],
            },
          ],
        },
        {
          number: 2,
          slug: 'migration',
          title: 'Migration Layer',
          description: 'Backward-compatible migration from cookies to JWT',
          status: 'planned',
          phases: [
            {
              number: 1,
              name: 'dual-auth',
              title: 'Dual Auth Middleware',
              description: 'Accept both cookie and JWT auth during migration',
              complexity: 'large',
            },
          ],
        },
      ],
    } as never,
    projectSlug: 'test-project',
    onContinue: () => {},
  },
};
