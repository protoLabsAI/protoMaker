import type { Meta, StoryObj } from '@storybook/react-vite';
import { GlowCard, StaggerContainer } from './glow-card';

const meta = {
  title: 'Dashboard/GlowCard',
  component: GlowCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GlowCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className="p-6">
        <h3 className="text-sm font-semibold mb-2">Glassmorphic Card</h3>
        <p className="text-xs text-muted-foreground">
          Frosted glass effect with backdrop blur, subtle border, and hover lift animation.
        </p>
      </div>
    ),
  },
};

export const WithOrb: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 w-[500px]">
      <GlowCard orb="top-right" orbColor="#8b5cf6" className="p-6">
        <h3 className="text-sm font-semibold">Top Right</h3>
        <p className="text-xs text-muted-foreground mt-1">Purple orb glow</p>
      </GlowCard>
      <GlowCard orb="bottom-left" orbColor="#10b981" className="p-6">
        <h3 className="text-sm font-semibold">Bottom Left</h3>
        <p className="text-xs text-muted-foreground mt-1">Emerald orb glow</p>
      </GlowCard>
      <GlowCard orb="center" orbColor="#f59e0b" className="p-6">
        <h3 className="text-sm font-semibold">Center</h3>
        <p className="text-xs text-muted-foreground mt-1">Amber orb glow</p>
      </GlowCard>
      <GlowCard orb="none" className="p-6">
        <h3 className="text-sm font-semibold">No Orb</h3>
        <p className="text-xs text-muted-foreground mt-1">Clean card</p>
      </GlowCard>
    </div>
  ),
};

export const GradientBorder: Story = {
  args: {
    gradientBorder: true,
    glowColor: '#8b5cf6',
    orb: 'top-right',
    orbColor: '#8b5cf6',
    children: (
      <div className="p-6">
        <h3 className="text-sm font-semibold mb-2">Gradient Border</h3>
        <p className="text-xs text-muted-foreground">
          Subtle diagonal gradient border from white/20 to white/5.
        </p>
      </div>
    ),
  },
};

export const StaggeredGrid: StoryObj = {
  render: () => (
    <StaggerContainer className="grid grid-cols-3 gap-4 w-[600px]">
      {Array.from({ length: 6 }, (_, i) => (
        <GlowCard key={i} orb="top-right" orbColor={`hsl(${i * 60}, 70%, 60%)`} className="p-5">
          <h3 className="text-sm font-semibold">Card {i + 1}</h3>
          <p className="text-2xl font-bold mt-2">{Math.floor(Math.random() * 100)}</p>
          <p className="text-xs text-muted-foreground mt-1">Staggered entrance</p>
        </GlowCard>
      ))}
    </StaggerContainer>
  ),
};
