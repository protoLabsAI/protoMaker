/**
 * Tabs Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@protolabs/ui/atoms';
import { Settings, User, Bell } from 'lucide-react';

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default tabs
export const Default: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-96">
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p className="text-sm text-muted-foreground">Content for Tab 1</p>
      </TabsContent>
      <TabsContent value="tab2">
        <p className="text-sm text-muted-foreground">Content for Tab 2</p>
      </TabsContent>
      <TabsContent value="tab3">
        <p className="text-sm text-muted-foreground">Content for Tab 3</p>
      </TabsContent>
    </Tabs>
  ),
};

// Tabs with icons
export const WithIcons: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-96">
      <TabsList>
        <TabsTrigger value="account">
          <User />
          Account
        </TabsTrigger>
        <TabsTrigger value="notifications">
          <Bell />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="settings">
          <Settings />
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <p className="text-sm text-muted-foreground">Manage your account settings and profile.</p>
      </TabsContent>
      <TabsContent value="notifications">
        <p className="text-sm text-muted-foreground">Configure your notification preferences.</p>
      </TabsContent>
      <TabsContent value="settings">
        <p className="text-sm text-muted-foreground">Customize application settings.</p>
      </TabsContent>
    </Tabs>
  ),
};

// Tabs with rich content (cards)
export const WithCards: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[600px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Get started with your dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This is the overview tab showing a summary of your project status.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="analytics" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>View performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Analytics data and charts would be displayed here.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="reports" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>Generate and view reports</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Report generation and viewing interface would go here.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

// Two tabs
export const TwoTabs: Story = {
  render: () => (
    <Tabs defaultValue="preview" className="w-96">
      <TabsList>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
      <TabsContent value="preview">
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-sm">Preview content goes here</p>
        </div>
      </TabsContent>
      <TabsContent value="code">
        <div className="border border-border rounded-lg p-4 bg-card font-mono text-sm">
          <code>{'<Component />'}</code>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

// Many tabs (horizontal scroll)
export const ManyTabs: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[600px]">
      <TabsList>
        <TabsTrigger value="tab1">Dashboard</TabsTrigger>
        <TabsTrigger value="tab2">Analytics</TabsTrigger>
        <TabsTrigger value="tab3">Reports</TabsTrigger>
        <TabsTrigger value="tab4">Settings</TabsTrigger>
        <TabsTrigger value="tab5">Users</TabsTrigger>
        <TabsTrigger value="tab6">Billing</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p className="text-sm text-muted-foreground">Dashboard content</p>
      </TabsContent>
      <TabsContent value="tab2">
        <p className="text-sm text-muted-foreground">Analytics content</p>
      </TabsContent>
      <TabsContent value="tab3">
        <p className="text-sm text-muted-foreground">Reports content</p>
      </TabsContent>
      <TabsContent value="tab4">
        <p className="text-sm text-muted-foreground">Settings content</p>
      </TabsContent>
      <TabsContent value="tab5">
        <p className="text-sm text-muted-foreground">Users content</p>
      </TabsContent>
      <TabsContent value="tab6">
        <p className="text-sm text-muted-foreground">Billing content</p>
      </TabsContent>
    </Tabs>
  ),
};

// Disabled tab
export const DisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-96">
      <TabsList>
        <TabsTrigger value="tab1">Active</TabsTrigger>
        <TabsTrigger value="tab2" disabled>
          Disabled
        </TabsTrigger>
        <TabsTrigger value="tab3">Available</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p className="text-sm text-muted-foreground">This tab is active</p>
      </TabsContent>
      <TabsContent value="tab2">
        <p className="text-sm text-muted-foreground">This tab is disabled</p>
      </TabsContent>
      <TabsContent value="tab3">
        <p className="text-sm text-muted-foreground">This tab is available</p>
      </TabsContent>
    </Tabs>
  ),
};
