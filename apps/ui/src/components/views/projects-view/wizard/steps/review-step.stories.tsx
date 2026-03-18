import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewStep } from './review-step';

const meta = {
  title: 'Projects/Steps/ReviewStep',
  component: ReviewStep,
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
} satisfies Meta<typeof ReviewStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PendingApproval: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Auth Overhaul',
      goal: 'Replace auth middleware',
      status: 'reviewing',
      prd: {
        situation: 'Current auth is non-compliant.',
        problem: 'Session tokens stored insecurely.',
        approach: 'JWT with refresh rotation.',
        results: 'Compliant, scalable auth.',
        constraints: '2-week migration window.',
      },
      milestones: [
        {
          number: 1,
          slug: 'foundation',
          title: 'Foundation',
          description: 'Core types and JWT',
          status: 'planned',
          phases: [
            {
              number: 1,
              name: 'types',
              title: 'Types',
              description: 'JWT types',
              complexity: 'small',
            },
            {
              number: 2,
              name: 'jwt',
              title: 'JWT Service',
              description: 'JWT impl',
              complexity: 'medium',
            },
          ],
        },
        {
          number: 2,
          slug: 'migration',
          title: 'Migration',
          description: 'Dual auth migration',
          status: 'planned',
          phases: [
            {
              number: 1,
              name: 'dual',
              title: 'Dual Auth',
              description: 'Both cookie and JWT',
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

export const Approved: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Auth Overhaul',
      goal: 'Replace auth middleware',
      status: 'approved',
      prd: {
        situation: 'Current auth is non-compliant.',
        problem: 'Session tokens stored insecurely.',
        approach: 'JWT with refresh rotation.',
        results: 'Compliant, scalable auth.',
        constraints: '2-week migration window.',
      },
      milestones: [
        {
          number: 1,
          slug: 'foundation',
          title: 'Foundation',
          description: 'Core types',
          status: 'planned',
          phases: [
            { number: 1, name: 'types', title: 'Types', description: 'Types', complexity: 'small' },
          ],
        },
      ],
    } as never,
    projectSlug: 'test-project',
    onContinue: () => {},
  },
};
