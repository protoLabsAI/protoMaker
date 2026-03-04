/**
 * ConfirmDialog Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Trash2, AlertTriangle, LogOut } from 'lucide-react';
import { ConfirmDialog } from './confirm-dialog';
import { Button } from '../atoms/button';

const meta = {
  title: 'Molecules/ConfirmDialog',
  component: ConfirmDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default confirm dialog
export const Default: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Dialog</Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          onConfirm={() => {}}
          title="Confirm Action"
          description="Are you sure you want to perform this action? This cannot be undone."
        />
      </>
    );
  },
};

// Destructive confirm dialog
export const Destructive: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete Item
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          onConfirm={() => {}}
          title="Delete Item"
          description="This action cannot be undone. The item will be permanently deleted."
          icon={Trash2}
          iconClassName="text-destructive"
          confirmText="Delete"
          cancelText="Cancel"
          confirmVariant="destructive"
        />
      </>
    );
  },
};

// With warning icon
export const WithWarningIcon: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <AlertTriangle className="w-4 h-4 mr-2" />
          Risky Action
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          onConfirm={() => {}}
          title="Proceed with Caution"
          description="This operation may affect other parts of the system. Please review before confirming."
          icon={AlertTriangle}
          iconClassName="text-yellow-500"
          confirmText="Proceed"
        />
      </>
    );
  },
};

// With children content
export const WithChildren: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open with Details</Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          onConfirm={() => {}}
          title="Sign Out"
          description="Are you sure you want to sign out of your account?"
          icon={LogOut}
          confirmText="Sign Out"
          cancelText="Stay"
        >
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            You will be redirected to the login page and any unsaved changes will be lost.
          </div>
        </ConfirmDialog>
      </>
    );
  },
};

// Custom button labels
export const CustomLabels: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Archive Project
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          onConfirm={() => {}}
          title="Archive Project"
          description="The project will be archived and removed from your active list."
          confirmText="Yes, Archive It"
          cancelText="Keep Active"
          confirmVariant="secondary"
        />
      </>
    );
  },
};
