/**
 * Slider Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Slider } from './slider';
import { Label } from './label';

const meta = {
  title: 'Atoms/Slider',
  component: Slider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    min: {
      control: 'number',
      description: 'Minimum value',
    },
    max: {
      control: 'number',
      description: 'Maximum value',
    },
    step: {
      control: 'number',
      description: 'Step increment',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the slider is disabled',
    },
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default slider
export const Default: Story = {
  render: () => (
    <div className="w-[300px]">
      <Slider defaultValue={[50]} max={100} step={1} />
    </div>
  ),
};

// With label and value display
export const WithLabel: Story = {
  render: () => {
    const [value, setValue] = useState([50]);

    return (
      <div className="w-[300px] space-y-4">
        <div className="flex items-center justify-between">
          <Label>Volume</Label>
          <span className="text-sm text-muted-foreground">{value[0]}%</span>
        </div>
        <Slider value={value} onValueChange={setValue} max={100} step={1} />
      </div>
    );
  },
};

// Range slider (not supported by default but showing single value variants)
export const DifferentSteps: Story = {
  render: () => (
    <div className="w-[300px] space-y-6">
      <div className="space-y-2">
        <Label>Step: 1</Label>
        <Slider defaultValue={[25]} max={100} step={1} />
      </div>
      <div className="space-y-2">
        <Label>Step: 5</Label>
        <Slider defaultValue={[25]} max={100} step={5} />
      </div>
      <div className="space-y-2">
        <Label>Step: 10</Label>
        <Slider defaultValue={[50]} max={100} step={10} />
      </div>
    </div>
  ),
};

// Different ranges
export const DifferentRanges: Story = {
  render: () => (
    <div className="w-[300px] space-y-6">
      <div className="space-y-2">
        <Label>0-10</Label>
        <Slider defaultValue={[5]} min={0} max={10} step={1} />
      </div>
      <div className="space-y-2">
        <Label>0-100</Label>
        <Slider defaultValue={[50]} min={0} max={100} step={1} />
      </div>
      <div className="space-y-2">
        <Label>0-1000</Label>
        <Slider defaultValue={[500]} min={0} max={1000} step={10} />
      </div>
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <div className="w-[300px] space-y-4">
      <Label>Disabled Slider</Label>
      <Slider defaultValue={[50]} max={100} step={1} disabled />
    </div>
  ),
};

// With interactive value
export const InteractiveValue: Story = {
  render: () => {
    const [value, setValue] = useState([33]);

    return (
      <div className="w-[350px] space-y-4">
        <div className="flex items-center justify-between">
          <Label>Brightness</Label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={value[0]}
              onChange={(e) => setValue([Number(e.target.value)])}
              className="w-16 rounded-md border px-2 py-1 text-sm text-right"
              min={0}
              max={100}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
        <Slider value={value} onValueChange={setValue} max={100} step={1} />
      </div>
    );
  },
};

// Multiple sliders
export const MultipleSliders: Story = {
  render: () => {
    const [red, setRed] = useState([255]);
    const [green, setGreen] = useState([128]);
    const [blue, setBlue] = useState([64]);

    return (
      <div className="w-[350px] space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-red-500">Red</Label>
            <span className="text-sm text-muted-foreground">{red[0]}</span>
          </div>
          <Slider value={red} onValueChange={setRed} max={255} step={1} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-green-500">Green</Label>
            <span className="text-sm text-muted-foreground">{green[0]}</span>
          </div>
          <Slider value={green} onValueChange={setGreen} max={255} step={1} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-blue-500">Blue</Label>
            <span className="text-sm text-muted-foreground">{blue[0]}</span>
          </div>
          <Slider value={blue} onValueChange={setBlue} max={255} step={1} />
        </div>
        <div
          className="h-20 rounded-md border"
          style={{
            backgroundColor: `rgb(${red[0]}, ${green[0]}, ${blue[0]})`,
          }}
        />
      </div>
    );
  },
};

// Price range example
export const PriceRange: Story = {
  render: () => {
    const [price, setPrice] = useState([250]);

    return (
      <div className="w-[350px] space-y-4">
        <div className="flex items-center justify-between">
          <Label>Maximum Price</Label>
          <span className="text-sm font-medium">${price[0]}</span>
        </div>
        <Slider value={price} onValueChange={setPrice} min={0} max={1000} step={10} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>$0</span>
          <span>$1000</span>
        </div>
      </div>
    );
  },
};

// Volume control
export const VolumeControl: Story = {
  render: () => {
    const [volume, setVolume] = useState([70]);

    return (
      <div className="w-[300px] space-y-4">
        <div className="flex items-center justify-between">
          <Label>Volume</Label>
          <div className="flex items-center gap-2">
            {volume[0] === 0 ? (
              <span className="text-sm">🔇</span>
            ) : volume[0] < 33 ? (
              <span className="text-sm">🔈</span>
            ) : volume[0] < 66 ? (
              <span className="text-sm">🔉</span>
            ) : (
              <span className="text-sm">🔊</span>
            )}
            <span className="text-sm text-muted-foreground w-8 text-right">
              {volume[0]}%
            </span>
          </div>
        </div>
        <Slider value={volume} onValueChange={setVolume} max={100} step={1} />
      </div>
    );
  },
};

// Different widths
export const DifferentWidths: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="w-[200px] space-y-2">
        <Label>Small</Label>
        <Slider defaultValue={[50]} max={100} step={1} />
      </div>
      <div className="w-[350px] space-y-2">
        <Label>Medium</Label>
        <Slider defaultValue={[50]} max={100} step={1} />
      </div>
      <div className="w-[500px] space-y-2">
        <Label>Large</Label>
        <Slider defaultValue={[50]} max={100} step={1} />
      </div>
    </div>
  ),
};
