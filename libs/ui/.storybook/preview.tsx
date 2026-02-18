/**
 * Storybook Preview Configuration
 *
 * Sets up global theme integration and accessibility auditing for all stories.
 * - Theme switcher toolbar addon cycles through all 6 themes
 * - Themes are applied as CSS classes on document root
 * - All theme CSS files are imported for proper styling
 */

import type { Preview } from '@storybook/react-vite';
import React from 'react';
import { themeOptions } from '../src/lib/theme-options';

// Import all theme CSS files
import '../src/themes/base.css';
import '../src/themes/catppuccin.css';
import '../src/themes/dracula.css';
import '../src/themes/monokai.css';
import '../src/themes/nord.css';
import '../src/themes/studio-dark.css';
import '../src/themes/studio-light.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Enable accessibility addon for all stories
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
  // Global decorators for theme switching
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      defaultValue: 'studio-dark',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: themeOptions.map((theme) => ({
          value: theme.value,
          title: theme.label,
          icon: theme.isDark ? 'moon' : 'sun',
        })),
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || 'studio-dark';

      // Apply theme class to document root
      React.useEffect(() => {
        const root = document.documentElement;
        // Remove all theme classes
        const themeClasses = themeOptions.map((t) => t.value);
        root.classList.remove(...themeClasses);
        // Add selected theme class
        root.classList.add(theme);
      }, [theme]);

      return (
        <div className="bg-background text-foreground min-h-screen p-8">
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
