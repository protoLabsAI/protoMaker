/**
 * Input Component Stories
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './input';
import { Search, Mail, Lock } from 'lucide-react';

const meta = {
  title: 'Atoms/Input',
  component: Input,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'search'],
      description: 'Input type',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable input',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input placeholder="Default input" />
      <Input placeholder="With value" defaultValue="Some text" />
      <Input placeholder="Disabled" disabled />
      <Input placeholder="Read only" readOnly defaultValue="Read only text" />
    </div>
  ),
};

export const InputTypes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input type="text" placeholder="Text input" />
      <Input type="email" placeholder="Email input" />
      <Input type="password" placeholder="Password input" />
      <Input type="number" placeholder="Number input" />
      <Input type="search" placeholder="Search input" />
    </div>
  ),
};

export const WithStartAddon: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input startAddon={<Search className="size-4" />} placeholder="Search..." />
      <Input startAddon={<Mail className="size-4" />} placeholder="Email address" />
      <Input startAddon={<Lock className="size-4" />} type="password" placeholder="Password" />
      <Input startAddon="$" type="number" placeholder="0.00" />
    </div>
  ),
};

export const WithEndAddon: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input endAddon=".com" placeholder="domain" />
      <Input endAddon="kg" type="number" placeholder="Weight" />
      <Input endAddon={<Search className="size-4" />} placeholder="Search..." />
    </div>
  ),
};

export const WithBothAddons: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input startAddon="$" endAddon=".00" type="number" placeholder="0" />
      <Input startAddon="https://" endAddon=".com" placeholder="domain" />
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input placeholder="Default state" />
      <Input placeholder="Focused (click to focus)" autoFocus />
      <Input placeholder="Disabled state" disabled />
      <Input placeholder="Invalid state" aria-invalid defaultValue="invalid@" />
    </div>
  ),
};
