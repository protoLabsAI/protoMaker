/**
 * @@@PROJECT_NAME-pen
 *
 * Parser, traversal, and style utilities for the .pen design file format
 * (pencil.dev v2.8). Zero external dependencies — drop this package into any
 * React, Node.js, or edge project.
 */

// Types (re-exported for convenience)
export type {
  // Document root
  PenDocument,
  PenNode,

  // Node types (all 15)
  FrameNode,
  GroupNode,
  TextNode,
  IconFontNode,
  RefNode,
  RectangleNode,
  EllipseNode,
  LineNode,
  PolygonNode,
  PathNode,
  NoteNode,
  PromptNode,
  ContextNode,
  VectorNode,
  InstanceNode,

  // Structural sub-types
  BaseNode,
  TextStyle,
  Stroke,
  StrokeThickness,

  // Variable / theme helpers
  Theme,
  Variables,
  ThemeDependent,
  PenVariable,
  NodeVisitor,

  // Complex fill / stroke (for style-utils)
  PenFill,
  PenSolidFill,
  PenGradientFill,
  PenImageFill,
  PenStroke,
  PenColor,
  PenVector,
  PenGradientStop,
} from './types.js';

// Parser
export { parsePenFile, parsePenFileFromPath } from './parser.js';

// Traversal
export { traverseNodes, findNodeById, findNodes, findReusableComponents } from './traversal.js';

// Variables & theme
export { resolveVariable, resolveRef, extractTheme, buildComponentMap } from './variables.js';

// Style utilities
export {
  colorToCSS,
  fillToCSS,
  strokeToCSS,
  sizeToCSS,
  paddingToCSS,
  layoutToFlexDirection,
} from './style-utils.js';
export type { VariableResolver } from './style-utils.js';
