/**
 * @@@PROJECT_NAME-tokens
 *
 * W3C DTCG design token extraction and export utilities for the design system
 * starter kit.
 *
 * @example
 * ```ts
 * import { extractTokensFromPen, exportToCSS, exportToTailwind } from '@@PROJECT_NAME-tokens';
 *
 * const { document, themes } = extractTokensFromPen(penDoc.variables, penDoc.themes);
 *
 * const { css }    = exportToCSS(document, { darkThemeStrategy: 'media' });
 * const { config } = exportToTailwind(document, { version: 'v3', wrapInConfig: true });
 * ```
 */

// Core DTCG types and utilities
export type {
  DTCGDocument,
  DTCGGroup,
  DTCGToken,
  DTCGTokenType,
  DTCGTokenValue,
  DTCGShadowValue,
  DTCGGradientStop,
  DTCGGradientValue,
  DTCGTypographyValue,
  DTCGBorderValue,
  DTCGTransitionValue,
  DTCGValidationError,
} from './dtcg.js';

export {
  isDTCGToken,
  isDTCGGroup,
  isDTCGReservedKey,
  validateDTCGDocument,
  walkTokens,
  pathToCSSVar,
  cssVarToPath,
  penVarToPath,
} from './dtcg.js';

// Extractor
export type {
  PenVariable,
  PenVariables,
  PenThemes,
  PenThemeValue,
  ExtractionOptions,
  ExtractionResult,
} from './extractor.js';

export { extractTokensFromPen } from './extractor.js';

// CSS exporter
export type { CSSExportOptions, CSSExportResult } from './exporters/css.js';

export { exportToCSS, exportGroupedToCSS, tokenValueToCSS } from './exporters/css.js';

// Tailwind exporter
export type {
  TailwindExportOptions,
  TailwindExportResult,
  TailwindTheme,
} from './exporters/tailwind.js';

export { exportToTailwind } from './exporters/tailwind.js';
