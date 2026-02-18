/**
 * ScrollArea Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollArea, ScrollBar } from './scroll-area';

const meta = {
  title: 'Atoms/ScrollArea',
  component: ScrollArea,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default vertical scroll
export const Default: Story = {
  render: () => (
    <ScrollArea className="h-72 w-48 rounded-md border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Tags</h4>
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="text-sm">
            Tag {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

// Vertical scroll with content
export const VerticalScroll: Story = {
  render: () => (
    <ScrollArea className="h-[400px] w-[350px] rounded-md border p-4">
      <h4 className="mb-4 text-sm font-medium leading-none">Project Updates</h4>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="mb-4 pb-4 border-b last:border-0">
          <h5 className="text-sm font-semibold mb-1">Update {i + 1}</h5>
          <p className="text-sm text-muted-foreground">
            This is an update about the project progress and recent changes that have been made to
            improve the overall functionality.
          </p>
        </div>
      ))}
    </ScrollArea>
  ),
};

// Horizontal scroll
export const HorizontalScroll: Story = {
  render: () => (
    <ScrollArea className="w-96 whitespace-nowrap rounded-md border">
      <div className="flex w-max space-x-4 p-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="shrink-0">
            <div className="overflow-hidden rounded-md">
              <div className="h-[150px] w-[150px] bg-muted flex items-center justify-center">
                <span className="text-sm font-semibold">Item {i + 1}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

// Both vertical and horizontal scroll
export const BothDirections: Story = {
  render: () => (
    <ScrollArea className="h-[400px] w-[400px] rounded-md border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Large Table</h4>
        <table className="w-full">
          <thead>
            <tr>
              {Array.from({ length: 10 }).map((_, i) => (
                <th key={i} className="text-left px-4 py-2 whitespace-nowrap text-sm font-medium">
                  Column {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 30 }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-t">
                {Array.from({ length: 10 }).map((_, colIndex) => (
                  <td key={colIndex} className="px-4 py-2 whitespace-nowrap text-sm">
                    Cell {rowIndex + 1},{colIndex + 1}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

// With images
export const WithImages: Story = {
  render: () => (
    <ScrollArea className="h-[400px] w-[350px] rounded-md border">
      <div className="p-4 space-y-4">
        <h4 className="text-sm font-medium leading-none mb-4">Gallery</h4>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-[200px] w-full bg-muted rounded-md flex items-center justify-center">
              <span className="text-sm text-muted-foreground">Image {i + 1}</span>
            </div>
            <p className="text-sm">Photo description for image {i + 1}</p>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

// Compact list
export const CompactList: Story = {
  render: () => (
    <ScrollArea className="h-48 w-64 rounded-md border">
      <div className="p-2">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer">
            Item {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

// Long text content
export const LongTextContent: Story = {
  render: () => (
    <ScrollArea className="h-[400px] w-[450px] rounded-md border p-6">
      <h4 className="mb-4 text-base font-semibold">Terms and Conditions</h4>
      <div className="text-sm text-muted-foreground space-y-4">
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt
          ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
          ullamco laboris nisi ut aliquip ex ea commodo consequat.
        </p>
        <p>
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat
          nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia
          deserunt mollit anim id est laborum.
        </p>
        <p>
          Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
          laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi
          architecto beatae vitae dicta sunt explicabo.
        </p>
        <p>
          Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia
          consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
        </p>
        <p>
          Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci
          velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam
          quaerat voluptatem.
        </p>
      </div>
    </ScrollArea>
  ),
};

// Card list
export const CardList: Story = {
  render: () => (
    <ScrollArea className="h-[450px] w-[350px] rounded-md border">
      <div className="p-4 space-y-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <h5 className="font-semibold text-sm">Card Title {i + 1}</h5>
            <p className="text-sm text-muted-foreground">
              This is some content for card number {i + 1}. It demonstrates how cards can be
              scrolled within the scroll area.
            </p>
            <div className="flex gap-2">
              <span className="text-xs bg-muted px-2 py-1 rounded">Tag 1</span>
              <span className="text-xs bg-muted px-2 py-1 rounded">Tag 2</span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};
