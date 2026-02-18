/**
 * Textarea Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from './textarea';
import { Label } from './label';
import { Button } from './button';

const meta = {
  title: 'Atoms/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    disabled: {
      control: 'boolean',
      description: 'Whether the textarea is disabled',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default textarea
export const Default: Story = {
  args: {
    placeholder: 'Type your message here...',
  },
};

// With label
export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label htmlFor="message">Your message</Label>
      <Textarea id="message" placeholder="Type your message here..." />
    </div>
  ),
};

// With text
export const WithText: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label htmlFor="message-2">Your message</Label>
      <Textarea
        id="message-2"
        placeholder="Type your message here..."
        defaultValue="This is some example text that has been pre-filled in the textarea."
      />
    </div>
  ),
};

// With helper text
export const WithHelperText: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label htmlFor="message-3">Bio</Label>
      <Textarea id="message-3" placeholder="Tell us about yourself..." />
      <p className="text-xs text-muted-foreground">
        Your bio will be displayed on your public profile.
      </p>
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label htmlFor="message-disabled">Message</Label>
      <Textarea
        id="message-disabled"
        placeholder="Type your message here..."
        disabled
        defaultValue="This textarea is disabled and cannot be edited."
      />
    </div>
  ),
};

// With error state
export const WithError: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label htmlFor="message-error" className="text-destructive">
        Message
      </Label>
      <Textarea
        id="message-error"
        placeholder="Type your message here..."
        className="border-destructive"
        aria-invalid="true"
        defaultValue="This message is too short."
      />
      <p className="text-xs text-destructive">Message must be at least 10 characters long.</p>
    </div>
  ),
};

// Different sizes (via min-height)
export const DifferentSizes: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="grid w-full max-w-sm gap-1.5">
        <Label htmlFor="small">Small (2 rows)</Label>
        <Textarea id="small" placeholder="Small textarea..." className="min-h-[60px]" />
      </div>
      <div className="grid w-full max-w-sm gap-1.5">
        <Label htmlFor="medium">Medium (default)</Label>
        <Textarea id="medium" placeholder="Medium textarea..." />
      </div>
      <div className="grid w-full max-w-sm gap-1.5">
        <Label htmlFor="large">Large (8 rows)</Label>
        <Textarea id="large" placeholder="Large textarea..." className="min-h-[200px]" />
      </div>
    </div>
  ),
};

// Form example
export const FormExample: Story = {
  render: () => (
    <div className="w-full max-w-sm space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <input
          type="text"
          id="subject"
          placeholder="Brief subject line"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="feedback">Feedback</Label>
        <Textarea id="feedback" placeholder="Share your thoughts..." className="min-h-[120px]" />
      </div>
      <Button className="w-full">Submit Feedback</Button>
    </div>
  ),
};

// With character count
export const WithCharacterCount: Story = {
  render: () => {
    const maxChars = 200;
    const [value, setValue] = React.useState('');

    return (
      <div className="grid w-full max-w-sm gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="char-count">Description</Label>
          <span className="text-xs text-muted-foreground">
            {value.length}/{maxChars}
          </span>
        </div>
        <Textarea
          id="char-count"
          placeholder="Enter a description..."
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxChars))}
          maxLength={maxChars}
        />
      </div>
    );
  },
};

// Required field
export const RequiredField: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label htmlFor="required">
        Comments <span className="text-destructive">*</span>
      </Label>
      <Textarea id="required" placeholder="Please provide your comments..." required />
      <p className="text-xs text-muted-foreground">This field is required.</p>
    </div>
  ),
};

// Multiple textareas
export const MultipleTextareas: Story = {
  render: () => (
    <div className="w-full max-w-sm space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="problem">Describe the problem</Label>
        <Textarea
          id="problem"
          placeholder="What issue are you experiencing?"
          className="min-h-[100px]"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="solution">Proposed solution</Label>
        <Textarea
          id="solution"
          placeholder="How would you like this to be resolved?"
          className="min-h-[100px]"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="additional">Additional context</Label>
        <Textarea
          id="additional"
          placeholder="Any other relevant information..."
          className="min-h-[80px]"
        />
      </div>
    </div>
  ),
};

// Auto-resize (controlled)
export const AutoResize: Story = {
  render: () => {
    const [value, setValue] = React.useState('');
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }, [value]);

    return (
      <div className="grid w-full max-w-sm gap-1.5">
        <Label htmlFor="auto-resize">Auto-resizing textarea</Label>
        <Textarea
          ref={textareaRef}
          id="auto-resize"
          placeholder="Type to see it grow..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-[80px] max-h-[300px] overflow-y-auto"
        />
        <p className="text-xs text-muted-foreground">This textarea grows as you type.</p>
      </div>
    );
  },
};
