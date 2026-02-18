/**
 * Kbd Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Command,
  ArrowBigUp,
  Option,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Kbd, KbdGroup } from './kbd';

const meta = {
  title: 'Atoms/Kbd',
  component: Kbd,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default single key
export const Default: Story = {
  args: {
    children: 'K',
  },
};

// Single keys
export const SingleKeys: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Kbd>A</Kbd>
      <Kbd>S</Kbd>
      <Kbd>D</Kbd>
      <Kbd>F</Kbd>
      <Kbd>Enter</Kbd>
      <Kbd>Esc</Kbd>
      <Kbd>Tab</Kbd>
      <Kbd>Space</Kbd>
    </div>
  ),
};

// Key combinations with KbdGroup
export const KeyCombinations: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>Shift</Kbd>
        <Kbd>P</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <Kbd>Alt</Kbd>
        <Kbd>Del</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>C</Kbd>
      </KbdGroup>
    </div>
  ),
};

// With icons
export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <KbdGroup>
        <Kbd>
          <Command className="h-3 w-3" />
        </Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd>
          <ArrowBigUp className="h-3 w-3" />
        </Kbd>
        <Kbd>
          <Command className="h-3 w-3" />
        </Kbd>
        <Kbd>P</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd>
          <Option className="h-3 w-3" />
        </Kbd>
        <Kbd>Tab</Kbd>
      </KbdGroup>
    </div>
  ),
};

// Arrow keys
export const ArrowKeys: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-2">
      <Kbd>
        <ArrowUp className="h-3 w-3" />
      </Kbd>
      <div className="flex gap-2">
        <Kbd>
          <ArrowLeft className="h-3 w-3" />
        </Kbd>
        <Kbd>
          <ArrowDown className="h-3 w-3" />
        </Kbd>
        <Kbd>
          <ArrowRight className="h-3 w-3" />
        </Kbd>
      </div>
    </div>
  ),
};

// Common shortcuts
export const CommonShortcuts: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-[300px]">
      <div className="flex items-center justify-between">
        <span className="text-sm">Open command palette</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Save</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>S</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Copy</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>C</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Paste</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>V</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Undo</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>Z</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Redo</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>Z</Kbd>
        </KbdGroup>
      </div>
    </div>
  ),
};

// Different modifiers
export const Modifiers: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Kbd>⌘</Kbd>
      <Kbd>Ctrl</Kbd>
      <Kbd>Alt</Kbd>
      <Kbd>Shift</Kbd>
      <Kbd>⌥</Kbd>
      <Kbd>^</Kbd>
      <Kbd>⇧</Kbd>
    </div>
  ),
};

// Function keys
export const FunctionKeys: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Kbd>F1</Kbd>
      <Kbd>F2</Kbd>
      <Kbd>F3</Kbd>
      <Kbd>F4</Kbd>
      <Kbd>F5</Kbd>
      <Kbd>F6</Kbd>
      <Kbd>F7</Kbd>
      <Kbd>F8</Kbd>
      <Kbd>F9</Kbd>
      <Kbd>F10</Kbd>
      <Kbd>F11</Kbd>
      <Kbd>F12</Kbd>
    </div>
  ),
};

// In context (documentation example)
export const InContext: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <div className="rounded-lg border p-4">
        <h3 className="font-semibold mb-2">Keyboard Shortcuts</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Use keyboard shortcuts to navigate quickly.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Search</span>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">New document</span>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>N</Kbd>
            </KbdGroup>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Settings</span>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>,</Kbd>
            </KbdGroup>
          </div>
        </div>
      </div>
    </div>
  ),
};
