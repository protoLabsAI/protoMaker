import type { ResolvedStyles } from '@automaker/pen-renderer';

/**
 * Convert ResolvedStyles to React.CSSProperties.
 *
 * ResolvedStyles uses `string | undefined` for all CSS properties,
 * while React.CSSProperties uses specific string literal types.
 * The actual values produced by the pen-renderer are valid CSS values,
 * so this cast is safe.
 */
export function toCSS(styles: ResolvedStyles): React.CSSProperties {
  return styles as unknown as React.CSSProperties;
}
