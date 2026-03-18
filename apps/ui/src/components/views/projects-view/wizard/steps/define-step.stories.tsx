import type { Meta, StoryObj } from '@storybook/react-vite';
import { DefineStep } from './define-step';

const meta = {
  title: 'Projects/Steps/DefineStep',
  component: DefineStep,
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
} satisfies Meta<typeof DefineStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewProject: Story = {
  args: {
    project: undefined,
    projectSlug: null,
    onCreated: () => {},
    onContinue: () => {},
  },
};

export const ExistingProject: Story = {
  args: {
    project: {
      slug: 'auth-overhaul',
      title: 'Auth System Overhaul',
      goal: 'Replace the existing auth middleware with a compliant session management system',
      description: 'The current auth system stores tokens in a non-compliant way.',
      color: '#8b5cf6',
      priority: 'high',
      status: 'drafting',
      milestones: [],
    } as never,
    projectSlug: 'auth-overhaul',
    onCreated: () => {},
    onContinue: () => {},
  },
};
