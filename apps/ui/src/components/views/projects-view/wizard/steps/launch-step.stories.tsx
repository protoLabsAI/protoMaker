import type { Meta, StoryObj } from '@storybook/react-vite';
import { LaunchStep } from './launch-step';

const meta = {
  title: 'Projects/Steps/LaunchStep',
  component: LaunchStep,
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
} satisfies Meta<typeof LaunchStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToLaunch: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Auth Overhaul',
      goal: 'Replace auth middleware',
      status: 'approved',
      milestones: [
        {
          number: 1,
          slug: 'foundation',
          title: 'Foundation',
          description: 'Core infrastructure',
          status: 'planned',
          phases: [
            { number: 1, name: 'types', title: 'Types', description: 'Types', complexity: 'small' },
            {
              number: 2,
              name: 'jwt',
              title: 'JWT Service',
              description: 'JWT',
              complexity: 'medium',
            },
          ],
        },
        {
          number: 2,
          slug: 'migration',
          title: 'Migration',
          description: 'Migration layer',
          status: 'planned',
          phases: [
            {
              number: 1,
              name: 'dual',
              title: 'Dual Auth',
              description: 'Dual',
              complexity: 'large',
            },
          ],
        },
      ],
    } as never,
    projectSlug: 'test-project',
  },
};

export const AlreadyLaunched: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Auth Overhaul',
      goal: 'Replace auth middleware',
      status: 'active',
      milestones: [
        {
          number: 1,
          slug: 'foundation',
          title: 'Foundation',
          description: 'Core',
          status: 'in-progress',
          phases: [
            { number: 1, name: 'types', title: 'Types', description: 'Types', complexity: 'small' },
          ],
        },
      ],
    } as never,
    projectSlug: 'test-project',
  },
};
