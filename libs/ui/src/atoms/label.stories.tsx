/**
 * Label Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from './label';
import { Input } from './input';
import { Checkbox } from './checkbox';

const meta = {
  title: 'Atoms/Label',
  component: Label,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default label
export const Default: Story = {
  args: {
    children: 'Label',
  },
};

// With input field
export const WithInput: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="Email" />
    </div>
  ),
};

// With required indicator
export const WithRequired: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="username">
        Username <span className="text-destructive">*</span>
      </Label>
      <Input type="text" id="username" placeholder="Enter username" />
    </div>
  ),
};

// With checkbox
export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

// Multiple form fields
export const FormFields: Story = {
  render: () => (
    <div className="w-full max-w-sm space-y-4">
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input type="text" id="name" placeholder="Your name" />
      </div>
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="email-form">Email</Label>
        <Input type="email" id="email-form" placeholder="you@example.com" />
      </div>
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input type="password" id="password" placeholder="••••••••" />
      </div>
    </div>
  ),
};

// With helper text
export const WithHelperText: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email-help">Email</Label>
      <Input type="email" id="email-help" placeholder="Email" />
      <p className="text-xs text-muted-foreground">
        We'll never share your email with anyone else.
      </p>
    </div>
  ),
};

// With error state
export const WithError: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email-error" className="text-destructive">
        Email
      </Label>
      <Input
        type="email"
        id="email-error"
        placeholder="Email"
        className="border-destructive"
        aria-invalid="true"
      />
      <p className="text-xs text-destructive">Please enter a valid email address.</p>
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="disabled-input">Disabled Field</Label>
      <Input type="text" id="disabled-input" placeholder="Disabled" disabled />
    </div>
  ),
};

// With optional indicator
export const WithOptional: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="phone">
        Phone Number <span className="text-muted-foreground text-xs">(optional)</span>
      </Label>
      <Input type="tel" id="phone" placeholder="+1 (555) 000-0000" />
    </div>
  ),
};

// Multiple checkboxes
export const CheckboxGroup: Story = {
  render: () => (
    <div className="space-y-3">
      <Label>Preferences</Label>
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox id="newsletter" />
          <Label htmlFor="newsletter" className="font-normal">
            Subscribe to newsletter
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="updates" />
          <Label htmlFor="updates" className="font-normal">
            Receive product updates
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="marketing" />
          <Label htmlFor="marketing" className="font-normal">
            Marketing communications
          </Label>
        </div>
      </div>
    </div>
  ),
};

// Dense layout
export const Dense: Story = {
  render: () => (
    <div className="w-full max-w-sm space-y-2">
      <div className="grid w-full items-center gap-1">
        <Label htmlFor="compact-1" className="text-xs">
          First Name
        </Label>
        <Input type="text" id="compact-1" className="h-8 text-sm" />
      </div>
      <div className="grid w-full items-center gap-1">
        <Label htmlFor="compact-2" className="text-xs">
          Last Name
        </Label>
        <Input type="text" id="compact-2" className="h-8 text-sm" />
      </div>
    </div>
  ),
};
