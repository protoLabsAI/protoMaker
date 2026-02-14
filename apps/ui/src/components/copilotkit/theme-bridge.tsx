/**
 * Theme bridge for CopilotKit - maps Automaker CSS variables to CopilotKit CSS variables
 *
 * CopilotKit has its own dark mode support via .dark class detection,
 * but we override specific variables to match Automaker's custom themes.
 */

import type { CSSProperties } from 'react';

/**
 * Returns CopilotKit CSS custom properties that map to the current Automaker theme.
 * Applied via a wrapper div's style prop around the CopilotSidebar.
 */
export function getCopilotKitThemeStyles(): CSSProperties {
  return {
    '--copilot-kit-primary-color': 'hsl(var(--primary))',
    '--copilot-kit-contrast-color': 'hsl(var(--primary-foreground))',
    '--copilot-kit-background-color': 'hsl(var(--background))',
    '--copilot-kit-secondary-color': 'hsl(var(--card))',
    '--copilot-kit-secondary-contrast-color': 'hsl(var(--card-foreground))',
    '--copilot-kit-separator-color': 'hsl(var(--border))',
    '--copilot-kit-muted-color': 'hsl(var(--muted))',
  } as CSSProperties;
}
