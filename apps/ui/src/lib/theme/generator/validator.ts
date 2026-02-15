/**
 * Theme config validation.
 *
 * Checks structural correctness and runs contrast validation.
 */

import type { AutomakerThemeConfig } from '../config/theme-config';
import { parseOklch, SHADE_KEYS } from '../config/color-scales';
import { validateThemeContrast, type ContrastReport } from './contrast-checker';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  contrast: ContrastReport;
}

/**
 * Validate a theme configuration for completeness and correctness.
 */
export function validateThemeConfig(config: AutomakerThemeConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required string fields
  if (!config.name || !/^[a-z][a-z0-9-]*$/.test(config.name)) {
    errors.push(`name must be lowercase kebab-case, got "${config.name}"`);
  }
  if (!config.displayName) {
    errors.push('displayName is required');
  }

  // Check color scales have all shades
  for (const scaleName of ['primary', 'gray'] as const) {
    const scale = config.colors[scaleName];
    if (!scale) {
      errors.push(`colors.${scaleName} is required`);
      continue;
    }
    for (const shade of SHADE_KEYS) {
      const value = scale[shade];
      if (!value) {
        errors.push(`colors.${scaleName}.${shade} is missing`);
      } else if (!parseOklch(value)) {
        errors.push(`colors.${scaleName}.${shade} is not valid OKLCH: "${value}"`);
      }
    }
  }

  // Check OKLCH values in surfaces, foreground, borders, status
  const oklchFields: [string, Record<string, string>][] = [
    ['surfaces', config.surfaces],
    ['foreground', config.foreground],
    ['borders', config.borders],
    ['status', config.status],
  ];

  for (const [group, obj] of oklchFields) {
    if (!obj) {
      errors.push(`${group} is required`);
      continue;
    }
    for (const [key, value] of Object.entries(obj)) {
      if (!value) {
        errors.push(`${group}.${key} is missing`);
      } else if (!parseOklch(value)) {
        errors.push(`${group}.${key} is not valid OKLCH: "${value}"`);
      }
    }
  }

  // Run contrast validation
  const contrast = validateThemeContrast(config);

  // Add warnings for contrast issues
  for (const result of contrast.warnings) {
    warnings.push(`Low contrast (${result.ratio}:1) for ${result.label} — below AA 4.5:1`);
  }
  for (const result of contrast.failures) {
    warnings.push(`FAIL contrast (${result.ratio}:1) for ${result.label} — below 3:1 minimum`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    contrast,
  };
}
