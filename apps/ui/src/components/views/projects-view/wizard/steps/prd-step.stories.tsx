import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrdStep } from './prd-step';

const meta = {
  title: 'Projects/Steps/PrdStep',
  component: PrdStep,
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
} satisfies Meta<typeof PrdStep>;

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

export const WithPrd: Story = {
  args: {
    project: {
      slug: 'test-project',
      title: 'Auth System Overhaul',
      goal: 'Replace auth middleware',
      status: 'reviewing',
      prd: {
        situation:
          'The current authentication system uses cookie-based sessions with an in-memory store. This works for single-server deployments but breaks under horizontal scaling.',
        problem:
          'Session tokens are stored in a format that does not meet the new compliance requirements. Additionally, the session store is not distributed.',
        approach:
          'Implement JWT-based authentication with refresh token rotation. Use Redis as the session store for distributed access.',
        results:
          'All sessions will be compliant with the new requirements. Horizontal scaling will work out of the box.',
        constraints:
          'Must maintain backward compatibility with existing API clients during a 2-week migration window.',
        generatedAt: '2026-03-15T10:00:00Z',
      },
      milestones: [],
    } as never,
    projectSlug: 'test-project',
    onContinue: () => {},
  },
};
