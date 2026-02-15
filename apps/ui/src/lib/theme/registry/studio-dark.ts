/**
 * Studio Dark — the default protoMaker dark theme.
 *
 * Linear-inspired: neutral grays with subtle cool undertone,
 * refined violet accent, solid surfaces, clean borders.
 * No glass morphism. No high-chroma neutrals. No neon.
 */

import { Sparkles } from 'lucide-react';
import { generateOklchScale, oklchString } from '../config/color-scales';
import type { AutomakerThemeConfig } from '../config/theme-config';

const gray = generateOklchScale(260, 0.02);
const violet = generateOklchScale(275, 0.18);

export const studioDark: AutomakerThemeConfig = {
  name: 'studio-dark',
  displayName: 'Studio Dark',
  isDark: true,
  category: 'curated',
  icon: Sparkles,
  iconColor: '#8b5cf6',

  colors: {
    primary: violet,
    gray,
  },

  status: {
    success: oklchString(0.65, 0.14, 145),
    warning: oklchString(0.75, 0.12, 75),
    error: oklchString(0.65, 0.16, 25),
    info: oklchString(0.65, 0.14, 230),
  },

  surfaces: {
    background: oklchString(0.13, 0.005, 260),
    card: oklchString(0.16, 0.005, 260),
    popover: oklchString(0.19, 0.005, 260),
    sidebar: oklchString(0.11, 0.005, 260),
    input: oklchString(0.14, 0.005, 260),
    muted: oklchString(0.2, 0.005, 260),
    secondary: oklchString(0.17, 0.005, 260),
  },

  foreground: {
    default: oklchString(0.93, 0, 0),
    secondary: oklchString(0.65, 0.005, 260),
    muted: oklchString(0.5, 0.005, 260),
  },

  borders: {
    default: oklchString(0.22, 0.005, 260),
    glass: oklchString(0.93, 0, 0, 0.08),
    ring: violet[500],
  },

  brand: {
    400: violet[400],
    500: violet[500],
    600: violet[600],
  },
};
