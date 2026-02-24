/**
 * PEN file format types for Penpot design files
 */

export interface PenDocument {
  version: string;
  children: PenNode[];
}

export type PenNode =
  | FrameNode
  | TextNode
  | IconFontNode
  | RefNode
  | RectangleNode
  | EllipseNode
  | PathNode;

export interface BaseNode {
  id: string;
  type: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number | 'fill_container';
  height?: number | 'fill_container';
}

export interface FrameNode extends BaseNode {
  type: 'frame';
  reusable?: boolean;
  clip?: boolean;
  fill?: string;
  cornerRadius?: number;
  stroke?: Stroke;
  layout?: 'none' | 'vertical' | 'horizontal';
  gap?: number;
  padding?: number | Padding;
  justifyContent?: 'flex_start' | 'flex_end' | 'center' | 'space_between' | 'space_around';
  alignItems?: 'flex_start' | 'flex_end' | 'center' | 'stretch';
  children?: PenNode[];
  slot?: string[];
  theme?: Theme;
}

export interface TextNode extends BaseNode {
  type: 'text';
  content: string;
  fill?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  lineHeight?: number;
  textAlignVertical?: 'top' | 'middle' | 'bottom';
}

export interface IconFontNode extends BaseNode {
  type: 'icon_font';
  iconFontName: string;
  iconFontFamily: string;
  fill?: string;
}

export interface RefNode extends BaseNode {
  type: 'ref';
  ref: string;
}

export interface RectangleNode extends BaseNode {
  type: 'rectangle';
  fill?: string;
  cornerRadius?: number;
  stroke?: Stroke;
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse';
  fill?: string;
  stroke?: Stroke;
}

export interface PathNode extends BaseNode {
  type: 'path';
  fill?: string;
  stroke?: Stroke;
  path?: string;
}

export interface Stroke {
  align: 'inside' | 'outside' | 'center';
  thickness: number | StrokeThickness;
  fill?: string;
}

export interface StrokeThickness {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface Padding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface Theme {
  Mode?: string;
  Base?: string;
  Accent?: string;
  [key: string]: string | undefined;
}

export interface Variables {
  [key: string]: string | number | undefined;
}

/**
 * Visitor function for traversing nodes
 */
export type NodeVisitor = (node: PenNode, parent?: PenNode, depth?: number) => void | boolean;
