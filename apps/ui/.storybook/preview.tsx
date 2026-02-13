/**
 * Storybook Preview Configuration
 *
 * Sets up global theme integration and accessibility auditing for all stories.
 * - Theme switcher toolbar addon cycles through all 40 themes
 * - Themes are applied as CSS classes on document root
 * - All theme CSS files are imported for proper styling
 */

import type { Preview } from '@storybook/react-vite';
import React from 'react';
import { themeOptions } from '../src/config/theme-options';

// Import global styles and all theme CSS files
import '../src/styles/global.css';
import '../src/styles/themes/ayu-dark.css';
import '../src/styles/themes/ayu-light.css';
import '../src/styles/themes/ayu-mirage.css';
import '../src/styles/themes/blossom.css';
import '../src/styles/themes/bluloco.css';
import '../src/styles/themes/catppuccin.css';
import '../src/styles/themes/cream.css';
import '../src/styles/themes/dark.css';
import '../src/styles/themes/dracula.css';
import '../src/styles/themes/ember.css';
import '../src/styles/themes/feather.css';
import '../src/styles/themes/forest.css';
import '../src/styles/themes/github.css';
import '../src/styles/themes/gray.css';
import '../src/styles/themes/gruvbox.css';
import '../src/styles/themes/gruvboxlight.css';
import '../src/styles/themes/lavender.css';
import '../src/styles/themes/light.css';
import '../src/styles/themes/matcha.css';
import '../src/styles/themes/mint.css';
import '../src/styles/themes/monokai.css';
import '../src/styles/themes/nord.css';
import '../src/styles/themes/nordlight.css';
import '../src/styles/themes/ocean.css';
import '../src/styles/themes/onedark.css';
import '../src/styles/themes/onelight.css';
import '../src/styles/themes/paper.css';
import '../src/styles/themes/peach.css';
import '../src/styles/themes/red.css';
import '../src/styles/themes/retro.css';
import '../src/styles/themes/rose.css';
import '../src/styles/themes/sand.css';
import '../src/styles/themes/sepia.css';
import '../src/styles/themes/sky.css';
import '../src/styles/themes/snow.css';
import '../src/styles/themes/solarized.css';
import '../src/styles/themes/solarizedlight.css';
import '../src/styles/themes/sunset.css';
import '../src/styles/themes/synthwave.css';
import '../src/styles/themes/tokyonight.css';

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
