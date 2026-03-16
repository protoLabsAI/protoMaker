/**
 * Design Agent
 *
 * An AI agent that makes principled design decisions: layout, spacing,
 * typography, and responsive breakpoints. Uses Pencil MCP tools to
 * manipulate .pen design files based on natural-language requests.
 *
 * ## Pencil MCP tools used
 *   - batch_design      — apply multiple design operations atomically
 *   - set_variables     — update design token variables
 *   - get_screenshot    — capture visual verification screenshot
 *   - snapshot_layout   — capture layout tree for analysis
 *
 * ## Usage
 *   const agent = createDesignAgent({ filePath: 'designs/components.pen' });
 *   const result = await agent.run('Make the primary button corners rounded');
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DesignAgentConfig {
  /** Path to the .pen file to manipulate (default: "designs/components.pen") */
  filePath?: string;
  /** Anthropic model to use (default: "claude-opus-4-6") */
  model?: string;
  /** Maximum agentic loop iterations (default: 10) */
  maxIterations?: number;
  /** Anthropic API key (default: ANTHROPIC_API_KEY env var) */
  apiKey?: string;
}

export interface DesignAgentResult {
  /** The agent's final response text */
  response: string;
  /** Operations applied to the .pen file */
  operations: AppliedOperation[];
  /** Variable changes made */
  variableChanges: Record<string, string>;
  /** Screenshots captured during the session */
  screenshots: string[];
  /** Number of agentic loop iterations used */
  iterations: number;
}

export interface AppliedOperation {
  type: 'batch_design' | 'set_variables' | 'get_screenshot' | 'snapshot_layout';
  input: Record<string, unknown>;
  output: unknown;
}

// ─── MCP tool definitions ─────────────────────────────────────────────────────

const PENCIL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'batch_design',
    description:
      'Apply one or more design operations to a .pen file atomically. ' +
      'Use this to set node properties (fill, stroke, cornerRadius, width, height, x, y, gap, padding, layout, etc.), ' +
      'add new child nodes, remove nodes, or move nodes to a different parent.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the .pen file to modify',
        },
        operations: {
          type: 'array',
          description: 'List of design operations to apply',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['set_property', 'add_child', 'remove_node', 'move_node'],
                description: 'Operation type',
              },
              nodeId: {
                type: 'string',
                description: 'Target node ID (required for set_property, remove_node, move_node)',
              },
              parentId: {
                type: 'string',
                description: 'Parent node ID (required for add_child, move_node)',
              },
              property: {
                type: 'string',
                description: 'Property name to set (required for set_property)',
              },
              value: {
                description: 'Property value (required for set_property)',
              },
              node: {
                type: 'object',
                description: 'Node definition to add (required for add_child)',
              },
            },
            required: ['type'],
          },
        },
      },
      required: ['filePath', 'operations'],
    },
  },
  {
    name: 'set_variables',
    description:
      'Update design token CSS custom properties (variables) in a .pen file. ' +
      'Use this to change colors, spacing tokens, or any design variable. ' +
      'Variable names must start with "--" (e.g. "--primary", "--spacing-4").',
    input_schema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the .pen file to modify',
        },
        variables: {
          type: 'object',
          description: 'Map of CSS variable name → value',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['filePath', 'variables'],
    },
  },
  {
    name: 'get_screenshot',
    description:
      'Capture a screenshot of a specific frame or the full canvas in a .pen file. ' +
      'Use this to visually verify changes after applying design operations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the .pen file',
        },
        nodeId: {
          type: 'string',
          description: 'ID of the node to screenshot. Omit for full canvas.',
        },
        width: {
          type: 'number',
          description: 'Screenshot width in pixels (default: 800)',
        },
        height: {
          type: 'number',
          description: 'Screenshot height in pixels (default: 600)',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'snapshot_layout',
    description:
      'Capture the structural layout tree (node hierarchy + computed positions) of a .pen file. ' +
      'Use this to analyze the current state of the design before making changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the .pen file',
        },
        nodeId: {
          type: 'string',
          description: 'Root node ID to snapshot. Omit for the full document.',
        },
      },
      required: ['filePath'],
    },
  },
];

// ─── System prompt loader ─────────────────────────────────────────────────────

function loadSystemPrompt(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dir = dirname(__filename);
  const promptPath = join(__dir, 'prompts', 'design.md');
  const raw = readFileSync(promptPath, 'utf-8');

  // Strip YAML frontmatter (--- ... ---)
  const frontmatterMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
  return frontmatterMatch ? raw.slice(frontmatterMatch[0].length).trim() : raw.trim();
}

// ─── Mock tool executor ───────────────────────────────────────────────────────
//
// In a real deployment these functions communicate with the Pencil MCP server
// (e.g. via @modelcontextprotocol/sdk or a local HTTP bridge).  The stubs
// below return realistic responses so the agent can be tested locally without
// a running Pencil instance.

async function executeBatchDesign(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const ops = (input['operations'] as unknown[]) ?? [];
  return {
    success: true,
    appliedCount: ops.length,
    filePath: input['filePath'],
    message: `Applied ${ops.length} design operation(s) to ${input['filePath']}`,
  };
}

async function executeSetVariables(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const variables = (input['variables'] as Record<string, string>) ?? {};
  const count = Object.keys(variables).length;
  return {
    success: true,
    updatedCount: count,
    filePath: input['filePath'],
    message: `Updated ${count} design variable(s) in ${input['filePath']}`,
  };
}

async function executeGetScreenshot(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return {
    success: true,
    filePath: input['filePath'],
    nodeId: input['nodeId'] ?? 'root',
    width: input['width'] ?? 800,
    height: input['height'] ?? 600,
    // In a real implementation this would be a base64-encoded PNG
    screenshot: '<base64-png-data>',
    message: `Screenshot captured for ${input['nodeId'] ?? 'full canvas'} in ${input['filePath']}`,
  };
}

async function executeSnapshotLayout(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return {
    success: true,
    filePath: input['filePath'],
    nodeId: input['nodeId'] ?? 'root',
    layout: {
      id: input['nodeId'] ?? 'root',
      type: 'frame',
      x: 0,
      y: 0,
      width: 1440,
      height: 900,
      children: [],
    },
    message: `Layout snapshot captured for ${input['nodeId'] ?? 'full document'} in ${input['filePath']}`,
  };
}

async function executeTool(toolName: string, toolInput: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'batch_design':
      return executeBatchDesign(toolInput);
    case 'set_variables':
      return executeSetVariables(toolInput);
    case 'get_screenshot':
      return executeGetScreenshot(toolInput);
    case 'snapshot_layout':
      return executeSnapshotLayout(toolInput);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Agent factory ────────────────────────────────────────────────────────────

/**
 * Create a design agent instance.
 *
 * @example
 * const agent = createDesignAgent({ filePath: 'designs/components.pen' });
 * const result = await agent.run('Make the primary button have 8px corner radius');
 */
export function createDesignAgent(config: DesignAgentConfig = {}) {
  const {
    filePath = 'designs/components.pen',
    model = 'claude-opus-4-6',
    maxIterations = 10,
    apiKey = process.env['ANTHROPIC_API_KEY'],
  } = config;

  const client = new Anthropic({ apiKey });

  /**
   * Run the design agent with a natural-language design request.
   *
   * @param request - Natural language design request (e.g. "Add a card component with 24px padding")
   * @returns DesignAgentResult with response text and operation audit trail
   */
  async function run(request: string): Promise<DesignAgentResult> {
    const systemPrompt = loadSystemPrompt();

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Design request for \`${filePath}\`:\n\n${request}`,
      },
    ];

    const result: DesignAgentResult = {
      response: '',
      operations: [],
      variableChanges: {},
      screenshots: [],
      iterations: 0,
    };

    // Agentic loop
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      result.iterations = iteration + 1;

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: PENCIL_TOOLS,
        messages,
      });

      // Collect assistant message
      messages.push({ role: 'assistant', content: response.content });

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        // Extract final text response
        result.response = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        break;
      }

      if (response.stop_reason !== 'tool_use') {
        // Unexpected stop — surface the text and exit
        result.response = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        break;
      }

      // Execute tool calls
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolInput = toolUse.input as Record<string, unknown>;
        const output = await executeTool(toolUse.name, toolInput);

        // Track operations for the audit trail
        const operation: AppliedOperation = {
          type: toolUse.name as AppliedOperation['type'],
          input: toolInput,
          output,
        };
        result.operations.push(operation);

        // Collect variable changes
        if (toolUse.name === 'set_variables') {
          const vars = (toolInput['variables'] as Record<string, string>) ?? {};
          Object.assign(result.variableChanges, vars);
        }

        // Collect screenshots
        if (toolUse.name === 'get_screenshot') {
          const screenshotOutput = output as Record<string, unknown>;
          if (screenshotOutput['screenshot']) {
            result.screenshots.push(screenshotOutput['screenshot'] as string);
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(output),
        });
      }

      // Feed tool results back to the model
      messages.push({ role: 'user', content: toolResults });
    }

    if (!result.response) {
      result.response = 'Design operations completed. Check the operations list for details.';
    }

    return result;
  }

  return { run };
}
