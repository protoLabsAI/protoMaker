/**
 * ToolResultRegistry — Maps tool names to custom renderer components.
 *
 * Allows registering custom React components to render tool results
 * with rich UI instead of raw JSON. Falls back to the default JSON view
 * when no renderer is registered for a given tool name.
 */

import type { ComponentType } from 'react';

export type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

export interface ToolResultRendererProps {
  /** The tool result output data */
  output: unknown;
  /** Current state of the tool invocation */
  state: ToolState;
  /** The tool name */
  toolName: string;
}

export type ToolResultRenderer = ComponentType<ToolResultRendererProps>;

class ToolResultRegistry {
  private readonly renderers = new Map<string, ToolResultRenderer>();

  /**
   * Register a custom renderer for a tool name.
   * @param toolName - The exact tool name (e.g. "get_feature")
   * @param renderer - A React component that renders the tool result
   */
  register(toolName: string, renderer: ToolResultRenderer): void {
    this.renderers.set(toolName, renderer);
  }

  /**
   * Get the renderer for a tool name, if one is registered.
   * @returns The renderer component or undefined if none is registered
   */
  get(toolName: string): ToolResultRenderer | undefined {
    return this.renderers.get(toolName);
  }

  /**
   * Check if a renderer is registered for a tool name.
   */
  has(toolName: string): boolean {
    return this.renderers.has(toolName);
  }
}

/** Singleton registry instance */
export const toolResultRegistry = new ToolResultRegistry();
