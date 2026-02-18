/**
 * Sheet Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from './sheet';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Atoms/Sheet',
  component: Sheet,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default sheet (right side)
export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input id="name" value="John Doe" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input id="username" value="@johndoe" className="col-span-3" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="submit">Save changes</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

// All sides showcase
export const AllSides: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Top</Button>
        </SheetTrigger>
        <SheetContent side="top">
          <SheetHeader>
            <SheetTitle>Top Sheet</SheetTitle>
            <SheetDescription>This sheet slides in from the top of the screen.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Right</Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Right Sheet</SheetTitle>
            <SheetDescription>
              This sheet slides in from the right side of the screen.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Bottom</Button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Bottom Sheet</SheetTitle>
            <SheetDescription>This sheet slides in from the bottom of the screen.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Left</Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Left Sheet</SheetTitle>
            <SheetDescription>
              This sheet slides in from the left side of the screen.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  ),
};

// With form
export const WithForm: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Create Account</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create a new account</SheetTitle>
          <SheetDescription>Fill in the information below to create your account.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="create-name">Full Name</Label>
            <Input id="create-name" placeholder="Enter your full name" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-email">Email</Label>
            <Input id="create-email" type="email" placeholder="you@example.com" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-password">Password</Label>
            <Input id="create-password" type="password" placeholder="••••••••" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input id="confirm-password" type="password" placeholder="••••••••" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button>Create Account</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

// Settings panel
export const SettingsPanel: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Settings</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Manage your application preferences.</SheetDescription>
        </SheetHeader>
        <div className="py-6 space-y-6">
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Appearance</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="dark-mode" className="font-normal">
                  Dark Mode
                </Label>
                <input type="checkbox" id="dark-mode" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="compact-view" className="font-normal">
                  Compact View
                </Label>
                <input type="checkbox" id="compact-view" />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Notifications</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-notif" className="font-normal">
                  Email Notifications
                </Label>
                <input type="checkbox" id="email-notif" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="push-notif" className="font-normal">
                  Push Notifications
                </Label>
                <input type="checkbox" id="push-notif" defaultChecked />
              </div>
            </div>
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button>Save Preferences</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

// Navigation menu
export const NavigationMenu: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Menu</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse through the app sections.</SheetDescription>
        </SheetHeader>
        <nav className="py-6">
          <ul className="space-y-2">
            <li>
              <Button variant="ghost" className="w-full justify-start">
                Home
              </Button>
            </li>
            <li>
              <Button variant="ghost" className="w-full justify-start">
                Dashboard
              </Button>
            </li>
            <li>
              <Button variant="ghost" className="w-full justify-start">
                Projects
              </Button>
            </li>
            <li>
              <Button variant="ghost" className="w-full justify-start">
                Team
              </Button>
            </li>
            <li>
              <Button variant="ghost" className="w-full justify-start">
                Settings
              </Button>
            </li>
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  ),
};

// Scrollable content
export const ScrollableContent: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">View Details</Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Product Details</SheetTitle>
          <SheetDescription>Complete information about this product.</SheetDescription>
        </SheetHeader>
        <div className="py-6 space-y-4">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <h4 className="text-sm font-medium">Section {i + 1}</h4>
              <p className="text-sm text-muted-foreground">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                incididunt ut labore et dolore magna aliqua.
              </p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  ),
};

// Bottom sheet (mobile style)
export const BottomSheet: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Share</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Share this page</SheetTitle>
          <SheetDescription>Choose how you want to share this content.</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-4 gap-4 py-6">
          <Button variant="ghost" className="flex flex-col h-auto py-4">
            <div className="w-12 h-12 bg-muted rounded-full mb-2" />
            <span className="text-xs">Email</span>
          </Button>
          <Button variant="ghost" className="flex flex-col h-auto py-4">
            <div className="w-12 h-12 bg-muted rounded-full mb-2" />
            <span className="text-xs">Message</span>
          </Button>
          <Button variant="ghost" className="flex flex-col h-auto py-4">
            <div className="w-12 h-12 bg-muted rounded-full mb-2" />
            <span className="text-xs">Copy Link</span>
          </Button>
          <Button variant="ghost" className="flex flex-col h-auto py-4">
            <div className="w-12 h-12 bg-muted rounded-full mb-2" />
            <span className="text-xs">More</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
};
