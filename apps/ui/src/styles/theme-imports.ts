/**
 * Bundles all individual theme styles so the build pipeline
 * doesn't tree-shake their CSS when imported dynamically.
 */

// Curated themes (default)
import './themes/studio-dark.css';
import './themes/studio-light.css';

// Community presets
import './themes/nord.css';
import './themes/catppuccin.css';
import './themes/dracula.css';
import './themes/monokai.css';
