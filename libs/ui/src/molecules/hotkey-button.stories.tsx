/**
 * HotkeyButton Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Save, Send, Search } from 'lucide-react';
import { HotkeyButton } from './hotkey-button';

const meta = {
  title: 'Molecules/HotkeyButton',
  component: HotkeyButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      description: 'Visual style variant of the button',
    },
    showHotkeyIndicator: {
      control: 'boolean',
      description: 'Show or hide the hotkey indicator badge',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the button and hotkey',
    },
  },
} satisfies Meta<typeof HotkeyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default hotkey button with Enter key
export const Default: Story = {
  args: {
    children: 'Submit',
    hotkey: { key: 'Enter', cmdCtrl: true },
    hotkeyActive: true,
  },
};

// With Cmd/Ctrl + S shortcut
export const SaveShortcut: Story = {
  render: () => (
    <HotkeyButton hotkey={{ key: 's', cmdCtrl: true }} onClick={() => alert('Saved!')}>
      <Save className="w-4 h-4 mr-2" />
      Save
    </HotkeyButton>
  ),
};

// With a simple key (no modifier)
export const SimpleKey: Story = {
  args: {
    children: 'Search',
    hotkey: { key: '/', label: '/' },
    variant: 'outline',
  },
};

// With shift modifier
export const WithShift: Story = {
  render: () => (
    <HotkeyButton hotkey={{ key: 'Enter', cmdCtrl: true, shift: true }} variant="secondary">
      <Send className="w-4 h-4 mr-2" />
      Send Draft
    </HotkeyButton>
  ),
};

// Hotkey indicator hidden
export const NoIndicator: Story = {
  args: {
    children: 'Search',
    hotkey: { key: 'k', cmdCtrl: true },
    showHotkeyIndicator: false,
    variant: 'outline',
  },
};

// Multiple variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <HotkeyButton hotkey={{ key: 'Enter', cmdCtrl: true }} variant="default">
        Confirm
      </HotkeyButton>
      <HotkeyButton hotkey={{ key: 'Delete' }} variant="destructive">
        Delete
      </HotkeyButton>
      <HotkeyButton hotkey={{ key: 's', cmdCtrl: true }} variant="outline">
        <Save className="w-4 h-4 mr-2" />
        Save
      </HotkeyButton>
      <HotkeyButton hotkey={{ key: 'k', cmdCtrl: true }} variant="secondary">
        <Search className="w-4 h-4 mr-2" />
        Search
      </HotkeyButton>
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  args: {
    children: 'Submit',
    hotkey: { key: 'Enter', cmdCtrl: true },
    disabled: true,
  },
};

// Custom label
export const CustomLabel: Story = {
  args: {
    children: 'Open Palette',
    hotkey: { key: 'p', cmdCtrl: true, label: '⌘P' },
    variant: 'outline',
  },
};
