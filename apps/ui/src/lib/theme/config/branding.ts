/**
 * Optional branding metadata for theme configs.
 * Used by the AI palette generator (future) and theme marketplace.
 */

export interface ThemeBranding {
  /** Author name */
  author?: string;
  /** Description of the theme's design intent */
  description?: string;
  /** Tags for searchability */
  tags?: string[];
  /** URL to a preview image */
  previewUrl?: string;
}
