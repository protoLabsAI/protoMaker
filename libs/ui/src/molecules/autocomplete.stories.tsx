/**
 * Autocomplete Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Folder, Tag } from 'lucide-react';
import { Autocomplete } from './autocomplete';

const meta = {
  title: 'Molecules/Autocomplete',
  component: Autocomplete,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: 'text',
      description: 'Placeholder text shown when no value is selected',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the autocomplete',
    },
    error: {
      control: 'boolean',
      description: 'Show error styling',
    },
    allowCreate: {
      control: 'boolean',
      description: 'Allow creating new options',
    },
  },
} satisfies Meta<typeof Autocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

const basicOptions = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape'];

// Default autocomplete
export const Default: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [value, setValue] = useState('');
    return (
      <div className="w-64">
        <Autocomplete
          value={value}
          onChange={setValue}
          options={basicOptions}
          placeholder="Select a fruit..."
        />
      </div>
    );
  },
};

// With a pre-selected value
export const WithValue: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [value, setValue] = useState('banana');
    return (
      <div className="w-64">
        <Autocomplete
          value={value}
          onChange={setValue}
          options={basicOptions}
          placeholder="Select a fruit..."
        />
      </div>
    );
  },
};

// With object options (label/value pairs)
export const WithObjectOptions: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [value, setValue] = useState('');
    const options = [
      { value: 'react', label: 'React', badge: 'v18' },
      { value: 'vue', label: 'Vue.js', badge: 'v3' },
      { value: 'angular', label: 'Angular', badge: 'v17' },
      { value: 'svelte', label: 'Svelte', badge: 'v4', isDefault: true },
    ];
    return (
      <div className="w-72">
        <Autocomplete
          value={value}
          onChange={setValue}
          options={options}
          placeholder="Select a framework..."
        />
      </div>
    );
  },
};

// With icon
export const WithIcon: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [value, setValue] = useState('');
    return (
      <div className="w-64">
        <Autocomplete
          value={value}
          onChange={setValue}
          options={['src', 'lib', 'dist', 'node_modules', 'public']}
          placeholder="Select folder..."
          icon={Folder}
        />
      </div>
    );
  },
};

// Allow creating new options
export const AllowCreate: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [value, setValue] = useState('');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [options, setOptions] = useState(['feature', 'bug', 'improvement', 'docs']);
    const handleChange = (v: string) => {
      if (!options.includes(v)) {
        setOptions((prev) => [...prev, v]);
      }
      setValue(v);
    };
    return (
      <div className="w-64">
        <Autocomplete
          value={value}
          onChange={handleChange}
          options={options}
          placeholder="Select or create tag..."
          icon={Tag}
          allowCreate
          createLabel={(v: string) => `Create tag "${v}"`}
        />
      </div>
    );
  },
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <div className="w-64">
      <Autocomplete
        value="apple"
        onChange={() => {}}
        options={basicOptions}
        placeholder="Select a fruit..."
        disabled
      />
    </div>
  ),
};

// Error state
export const WithError: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [value, setValue] = useState('');
    return (
      <div className="w-64 space-y-1">
        <Autocomplete
          value={value}
          onChange={setValue}
          options={basicOptions}
          placeholder="Select a fruit..."
          error
        />
        <p className="text-xs text-destructive">Please select a valid option.</p>
      </div>
    );
  },
};
