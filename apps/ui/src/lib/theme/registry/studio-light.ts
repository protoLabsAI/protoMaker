/**
 * Studio Light — the default protoMaker light theme.
 *
 * Linear-inspired: warm gray canvas, pure white cards,
 * same violet accent as Studio Dark. Clean, readable, professional.
 */

import { Sparkles } from 'lucide-react';
import { generateOklchScale, oklchString } from '../config/color-scales';
import type { AutomakerThemeConfig } from '../config/theme-config';

const gray = generateOklchScale(260, 0.02);
const violet = generateOklchScale(275, 0.18);

export const studioLight: AutomakerThemeConfig = {
  name: 'studio-light',
  displayName: 'Studio Light',
  isDark: false,
  category: 'curated',
  icon: Sparkles,
  iconColor: '#8b5cf6',

  colors: {
    primary: violet,
    gray,
  },

  status: {
    success: oklchString(0.55, 0.15, 145),
    warning: oklchString(0.65, 0.12, 75),
    error: oklchString(0.55, 0.16, 25),
    info: oklchString(0.55, 0.14, 230),
  },

  surfaces: {
    background: oklchString(0.965, 0.002, 260),
    card: oklchString(1, 0, 0),
    popover: oklchString(1, 0, 0),
    sidebar: oklchString(0.975, 0.002, 260),
    input: oklchString(1, 0, 0),
    muted: oklchString(0.95, 0.003, 260),
    secondary: oklchString(0.97, 0.002, 260),
  },

  foreground: {
    default: oklchString(0.15, 0.01, 260),
    secondary: oklchString(0.4, 0.01, 260),
    muted: oklchString(0.55, 0.005, 260),
  },

  borders: {
    default: oklchString(0.9, 0.005, 260),
    glass: oklchString(0.15, 0, 0, 0.08),
    ring: violet[500],
  },

  brand: {
    400: violet[400],
    500: violet[500],
    600: violet[600],
  },
};
