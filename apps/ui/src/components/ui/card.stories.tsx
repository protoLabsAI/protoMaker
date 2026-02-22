/**
 * Card Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
  Button,
  Badge,
} from '@protolabs/ui/atoms';

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    gradient: {
      control: 'boolean',
      description: 'Add gradient border effect',
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

// Simple card
export const Default: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>This is a basic card with a title and description.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          Cards are versatile containers for grouping related content and actions.
        </p>
      </CardContent>
    </Card>
  ),
};

// Card with all sections
export const Complete: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Complete Card</CardTitle>
        <CardDescription>Card with header, content, and footer sections.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This card demonstrates all available sections: header with title and description, content
          area, and footer with actions.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline">Cancel</Button>
        <Button>Confirm</Button>
      </CardFooter>
    </Card>
  ),
};

// Card with action button
export const WithAction: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Card with Action</CardTitle>
        <CardDescription>Action button positioned in the header.</CardDescription>
        <CardAction>
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          The CardAction component places an action button aligned to the right side of the header,
          spanning both title and description rows.
        </p>
      </CardContent>
    </Card>
  ),
};

// Card with gradient border
export const GradientBorder: Story = {
  render: () => (
    <Card className="w-96" gradient>
      <CardHeader>
        <CardTitle>Gradient Border Card</CardTitle>
        <CardDescription>Premium card with gradient border effect.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Enable the gradient prop to add a premium layered gradient border effect using
          pseudo-elements.
        </p>
      </CardContent>
    </Card>
  ),
};

// Card with badges
export const WithBadges: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Feature Card
          <Badge variant="brand">New</Badge>
        </CardTitle>
        <CardDescription>Card showcasing status badges.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Active</Badge>
          <Badge variant="info">Beta</Badge>
          <Badge variant="warning">Limited</Badge>
        </div>
      </CardContent>
    </Card>
  ),
};

// Multiple cards in grid
export const Grid: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Card 1</CardTitle>
          <CardDescription>First card in grid</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Content for the first card.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Card 2</CardTitle>
          <CardDescription>Second card in grid</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Content for the second card.</p>
        </CardContent>
      </Card>
      <Card gradient>
        <CardHeader>
          <CardTitle>Card 3</CardTitle>
          <CardDescription>Third card with gradient</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Content for the third card.</p>
        </CardContent>
      </Card>
      <Card gradient>
        <CardHeader>
          <CardTitle>Card 4</CardTitle>
          <CardDescription>Fourth card with gradient</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Content for the fourth card.</p>
        </CardContent>
      </Card>
    </div>
  ),
};

// Card with complex content
export const Complex: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Task Details</CardTitle>
        <CardDescription>View and manage task information</CardDescription>
        <CardAction>
          <Badge variant="success">Completed</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-1">Description</h4>
          <p className="text-sm text-muted-foreground">
            Implement the new authentication flow using OAuth 2.0 with PKCE extension for enhanced
            security.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-medium mb-1">Tags</h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" size="sm">
              Authentication
            </Badge>
            <Badge variant="outline" size="sm">
              Security
            </Badge>
            <Badge variant="outline" size="sm">
              Backend
            </Badge>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">
          Archive
        </Button>
        <Button size="sm">View Details</Button>
      </CardFooter>
    </Card>
  ),
};
