/**
 * Collapsible Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible';
import { Button } from './button';

const meta = {
  title: 'Atoms/Collapsible',
  component: Collapsible,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the collapsible is open',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the collapsible is disabled',
    },
  },
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default collapsible
export const Default: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-[350px] space-y-2">
        <div className="flex items-center justify-between space-x-4 px-4">
          <h4 className="text-sm font-semibold">@peduarte starred 3 repositories</h4>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              <ChevronsUpDown className="h-4 w-4" />
              <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className="rounded-md border px-4 py-3 text-sm">
          @radix-ui/primitives
        </div>
        <CollapsibleContent className="space-y-2">
          <div className="rounded-md border px-4 py-3 text-sm">
            @radix-ui/colors
          </div>
          <div className="rounded-md border px-4 py-3 text-sm">
            @stitches/react
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  },
};

// Controlled collapsible
export const Controlled: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(true);

    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setIsOpen(true)}>
            Open
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setIsOpen(!isOpen)}>
            Toggle
          </Button>
        </div>
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-[350px] space-y-2">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              Settings
              <ChevronsUpDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Enable notifications</span>
                <input type="checkbox" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Auto-save</span>
                <input type="checkbox" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Dark mode</span>
                <input type="checkbox" />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  },
};

// With default open
export const DefaultOpen: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(true);

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-[350px] space-y-2">
        <div className="flex items-center justify-between space-x-4">
          <h4 className="text-sm font-semibold">Project Files</h4>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <ChevronsUpDown className="h-4 w-4" />
              <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="space-y-2">
          <div className="rounded-md border px-4 py-2 text-sm">src/components/</div>
          <div className="rounded-md border px-4 py-2 text-sm">src/lib/</div>
          <div className="rounded-md border px-4 py-2 text-sm">src/utils/</div>
          <div className="rounded-md border px-4 py-2 text-sm">src/types/</div>
        </CollapsibleContent>
      </Collapsible>
    );
  },
};

// Multiple collapsibles
export const Multiple: Story = {
  render: () => {
    const [openItems, setOpenItems] = useState<string[]>(['item-1']);

    const toggleItem = (item: string) => {
      setOpenItems((prev) =>
        prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
      );
    };

    return (
      <div className="w-[350px] space-y-4">
        <Collapsible
          open={openItems.includes('item-1')}
          onOpenChange={() => toggleItem('item-1')}
        >
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              Account Settings
              <ChevronsUpDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="rounded-md border p-4 text-sm">
              Manage your account preferences and profile information.
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          open={openItems.includes('item-2')}
          onOpenChange={() => toggleItem('item-2')}
        >
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              Privacy
              <ChevronsUpDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="rounded-md border p-4 text-sm">
              Control your privacy settings and data sharing preferences.
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          open={openItems.includes('item-3')}
          onOpenChange={() => toggleItem('item-3')}
        >
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              Notifications
              <ChevronsUpDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="rounded-md border p-4 text-sm">
              Configure how and when you receive notifications.
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  },
};

// Disabled state
export const Disabled: Story = {
  render: () => {
    return (
      <Collapsible disabled className="w-[350px] space-y-2">
        <div className="flex items-center justify-between space-x-4 px-4 opacity-50">
          <h4 className="text-sm font-semibold">Disabled Section</h4>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" disabled>
              <ChevronsUpDown className="h-4 w-4" />
              <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className="rounded-md border px-4 py-3 text-sm opacity-50">
          This content cannot be toggled
        </div>
      </Collapsible>
    );
  },
};
