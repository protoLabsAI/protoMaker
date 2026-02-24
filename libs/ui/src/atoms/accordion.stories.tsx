/**
 * Accordion Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion';

const meta = {
  title: 'Atoms/Accordion',
  component: Accordion,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['single', 'multiple'],
      description: 'Whether only one or multiple items can be open at once',
    },
    collapsible: {
      control: 'boolean',
      description: 'Whether an open item can be collapsed (only for single type)',
    },
  },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default accordion (single type, collapsible)
export const Default: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>Yes. It adheres to the WAI-ARIA design pattern.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionContent>
          Yes. It comes with default styles that matches the other components aesthetic.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Is it animated?</AccordionTrigger>
        <AccordionContent>
          Yes. It's animated by default, but you can disable it if you prefer.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

// Single type (only one item open at a time)
export const SingleType: Story = {
  render: () => (
    <Accordion type="single" collapsible defaultValue="item-1" className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>What is React?</AccordionTrigger>
        <AccordionContent>
          React is a JavaScript library for building user interfaces. It lets you compose complex
          UIs from small and isolated pieces of code called components.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>What is TypeScript?</AccordionTrigger>
        <AccordionContent>
          TypeScript is a strongly typed programming language that builds on JavaScript, giving you
          better tooling at any scale.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>What is Tailwind CSS?</AccordionTrigger>
        <AccordionContent>
          Tailwind CSS is a utility-first CSS framework packed with classes that can be composed to
          build any design, directly in your markup.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

// Multiple type (multiple items can be open)
export const MultipleType: Story = {
  render: () => (
    <Accordion type="multiple" defaultValue={['item-1', 'item-2']} className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>Features</AccordionTrigger>
        <AccordionContent>
          <ul className="list-disc pl-4 space-y-1">
            <li>Fully accessible</li>
            <li>Keyboard navigation</li>
            <li>Smooth animations</li>
            <li>Customizable styling</li>
          </ul>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Use Cases</AccordionTrigger>
        <AccordionContent>
          <ul className="list-disc pl-4 space-y-1">
            <li>FAQ sections</li>
            <li>Product details</li>
            <li>Settings panels</li>
            <li>Documentation</li>
          </ul>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Best Practices</AccordionTrigger>
        <AccordionContent>
          Keep content concise and scannable. Use clear, descriptive trigger text. Consider the
          user's workflow when choosing single vs multiple mode.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

// Non-collapsible (single type, one must always be open)
export const NonCollapsible: Story = {
  render: () => (
    <Accordion type="single" collapsible={false} defaultValue="item-1" className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>Account Settings</AccordionTrigger>
        <AccordionContent>
          Manage your account preferences and personal information.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Privacy Settings</AccordionTrigger>
        <AccordionContent>
          Control your privacy settings and data sharing preferences.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Notification Settings</AccordionTrigger>
        <AccordionContent>Configure how and when you receive notifications.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

// With rich content
export const RichContent: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>Installation</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2">
            <p>Install the package using your preferred package manager:</p>
            <pre className="bg-muted p-2 rounded text-xs">npm install @protolabs-ai/ui</pre>
          </div>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Usage</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2">
            <p>Import and use the component in your application:</p>
            <pre className="bg-muted p-2 rounded text-xs">
              {`import { Accordion } from '@protolabs-ai/ui';`}
            </pre>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
