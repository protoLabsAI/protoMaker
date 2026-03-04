/**
 * Storybook Preview Configuration
 *
 * Sets up global theme integration and accessibility auditing for all stories.
 * - Theme switcher toolbar addon cycles through all 6 themes
 * - Themes are applied as CSS classes on document root
 * - @storybook/addon-a11y wired via main.ts; a11y panel active for all stories
 */

import type { Preview } from '@storybook/react-vite';
import React from 'react';
import { themeOptions } from '../src/config/theme-options';

// Import global styles (theme CSS files loaded when themes are implemented)
import '../src/styles/global.css';

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
      defaultValue: 'dark',
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
      const theme = context.globals.theme || 'dark';

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
