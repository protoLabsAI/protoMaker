import type { Meta, StoryObj } from '@storybook/react-vite';
import { WizardStepIndicator } from './wizard-step-indicator';
import type { WizardStep } from '@/store/project-wizard-store';

const meta = {
  title: 'Projects/WizardStepIndicator',
  component: WizardStepIndicator,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    currentStep: {
      control: 'select',
      options: ['define', 'research', 'prd', 'plan', 'review', 'launch'],
    },
    accentColor: {
      control: 'color',
    },
  },
} satisfies Meta<typeof WizardStepIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AtDefineStep: Story = {
  args: {
    currentStep: 'define',
    completedSteps: new Set<WizardStep>(),
    onStepClick: () => {},
  },
};

export const AtPrdStep: Story = {
  args: {
    currentStep: 'prd',
    completedSteps: new Set<WizardStep>(['define', 'research']),
    onStepClick: () => {},
  },
};

export const AtReviewStep: Story = {
  args: {
    currentStep: 'review',
    completedSteps: new Set<WizardStep>(['define', 'research', 'prd', 'plan']),
    onStepClick: () => {},
  },
};

export const AllComplete: Story = {
  args: {
    currentStep: 'launch',
    completedSteps: new Set<WizardStep>(['define', 'research', 'prd', 'plan', 'review', 'launch']),
    onStepClick: () => {},
  },
};

export const WithAccentColor: Story = {
  args: {
    currentStep: 'plan',
    completedSteps: new Set<WizardStep>(['define', 'research', 'prd']),
    onStepClick: () => {},
    accentColor: '#ec4899',
  },
};

export const SkippedResearch: Story = {
  args: {
    currentStep: 'prd',
    completedSteps: new Set<WizardStep>(['define']),
    onStepClick: () => {},
  },
};
