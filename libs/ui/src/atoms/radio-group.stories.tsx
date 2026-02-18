/**
 * RadioGroup Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Label } from './label';

const meta = {
  title: 'Atoms/RadioGroup',
  component: RadioGroup,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    disabled: {
      control: 'boolean',
      description: 'Whether the radio group is disabled',
    },
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default radio group
export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="option-one" />
        <Label htmlFor="option-one">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="option-two" />
        <Label htmlFor="option-two">Option Two</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-three" id="option-three" />
        <Label htmlFor="option-three">Option Three</Label>
      </div>
    </RadioGroup>
  ),
};

// With descriptions
export const WithDescriptions: Story = {
  render: () => (
    <RadioGroup defaultValue="comfortable">
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="default" id="r1" className="mt-1" />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="r1">Default</Label>
          <p className="text-sm text-muted-foreground">
            The default spacing and sizing for all components.
          </p>
        </div>
      </div>
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="comfortable" id="r2" className="mt-1" />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="r2">Comfortable</Label>
          <p className="text-sm text-muted-foreground">
            More spacing for better readability and touch targets.
          </p>
        </div>
      </div>
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="compact" id="r3" className="mt-1" />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="r3">Compact</Label>
          <p className="text-sm text-muted-foreground">
            Reduced spacing to fit more content on screen.
          </p>
        </div>
      </div>
    </RadioGroup>
  ),
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="option-one" disabled>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="disabled-one" />
        <Label htmlFor="disabled-one">Disabled Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="disabled-two" />
        <Label htmlFor="disabled-two">Disabled Option Two</Label>
      </div>
    </RadioGroup>
  ),
};

// Individual disabled items
export const IndividualDisabled: Story = {
  render: () => (
    <RadioGroup defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="ind-one" />
        <Label htmlFor="ind-one">Available Option</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="ind-two" disabled />
        <Label htmlFor="ind-two">Unavailable Option</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-three" id="ind-three" />
        <Label htmlFor="ind-three">Another Available Option</Label>
      </div>
    </RadioGroup>
  ),
};

// Form example
export const FormExample: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <div className="space-y-2">
        <Label>Select your plan</Label>
        <RadioGroup defaultValue="pro">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="free" id="plan-free" />
            <Label htmlFor="plan-free" className="font-normal">
              Free - $0/month
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="pro" id="plan-pro" />
            <Label htmlFor="plan-pro" className="font-normal">
              Pro - $10/month
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="enterprise" id="plan-enterprise" />
            <Label htmlFor="plan-enterprise" className="font-normal">
              Enterprise - $50/month
            </Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  ),
};

// Horizontal layout
export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue="yes" className="flex gap-4">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="yes" id="h-yes" />
        <Label htmlFor="h-yes">Yes</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="no" id="h-no" />
        <Label htmlFor="h-no">No</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="maybe" id="h-maybe" />
        <Label htmlFor="h-maybe">Maybe</Label>
      </div>
    </RadioGroup>
  ),
};

// Card style options
export const CardStyle: Story = {
  render: () => (
    <RadioGroup defaultValue="card-1" className="grid gap-3">
      <div>
        <RadioGroupItem value="card-1" id="card-1" className="peer sr-only" />
        <Label
          htmlFor="card-1"
          className="flex items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
        >
          <div>
            <p className="font-semibold">Starter</p>
            <p className="text-sm text-muted-foreground">Perfect for small projects</p>
          </div>
        </Label>
      </div>
      <div>
        <RadioGroupItem value="card-2" id="card-2" className="peer sr-only" />
        <Label
          htmlFor="card-2"
          className="flex items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
        >
          <div>
            <p className="font-semibold">Professional</p>
            <p className="text-sm text-muted-foreground">Best for growing teams</p>
          </div>
        </Label>
      </div>
      <div>
        <RadioGroupItem value="card-3" id="card-3" className="peer sr-only" />
        <Label
          htmlFor="card-3"
          className="flex items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
        >
          <div>
            <p className="font-semibold">Enterprise</p>
            <p className="text-sm text-muted-foreground">For large organizations</p>
          </div>
        </Label>
      </div>
    </RadioGroup>
  ),
};

// Many options
export const ManyOptions: Story = {
  render: () => (
    <RadioGroup defaultValue="option-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center space-x-2">
          <RadioGroupItem value={`option-${i + 1}`} id={`many-${i + 1}`} />
          <Label htmlFor={`many-${i + 1}`}>Option {i + 1}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};
