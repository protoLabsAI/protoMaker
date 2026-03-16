/**
 * Tool-Calling Agent Example
 *
 * Demonstrates a LangGraph flow with tool execution using:
 * - Binary router for tool-call detection
 * - createEndRouter for loop termination
 * - XML parser for structured output extraction
 */

import { z } from 'zod';
import { Annotation, END } from '@langchain/langgraph';
import { GraphBuilder } from '../builder.js';
import { createBinaryRouter, createEndRouter } from '../routers.js';
import { appendReducer, counterReducer } from '../reducers.js';
import { extractTag, extractAllTags } from '../xml-parser.js';

// --- Types ---

type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

type ToolResult = {
  id: string;
  name: string;
  result: string;
  error?: string;
};

type AgentMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
};

// Derive state type from annotation (LangGraph pattern)
type AgentState = typeof AgentAnnotation.State;

// --- State Annotation ---

const AgentAnnotation = Annotation.Root({
  messages: Annotation<AgentMessage[]>({
    value: appendReducer,
    default: () => [],
  }),
  pendingToolCalls: Annotation<ToolCall[]>,
  toolResults: Annotation<ToolResult[]>({
    value: appendReducer,
    default: () => [],
  }),
  finalResponse: Annotation<string | undefined>,
  iterationCount: Annotation<number>({
    value: counterReducer,
    default: () => 0,
  }),
  maxIterations: Annotation<number>,
});

// --- Available Tools ---

const TOOLS: Record<string, (args: Record<string, unknown>) => string> = {
  get_weather: (args) => {
    const location = String(args['location'] ?? 'Unknown');
    return `Weather in ${location}: 72°F, partly cloudy`;
  },
  search_web: (args) => {
    const query = String(args['query'] ?? '');
    return `Search results for "${query}": [result1, result2, result3]`;
  },
};

// --- XML-Based Tool Call Parsing ---
//
// Prompt the model to output tool calls in XML format:
//   <tool_calls>
//     <tool_call>
//       <name>get_weather</name>
//       <id>call_001</id>
//       <args>{"location": "New York"}</args>
//     </tool_call>
//   </tool_calls>
//
// Or a final answer:
//   <final_answer>The weather in New York is 72°F.</final_answer>

function parseToolCallsFromOutput(output: string): ToolCall[] {
  const toolCallBlocks = extractAllTags(output, 'tool_call');
  return toolCallBlocks.map((block, index) => {
    const name = extractTag(block, 'name') ?? 'unknown';
    const id = extractTag(block, 'id') ?? `call_${index}`;
    const argsStr = extractTag(block, 'args') ?? '{}';
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsStr) as Record<string, unknown>;
    } catch {
      args = { raw: argsStr };
    }
    return { id, name, args };
  });
}

// --- Node Functions ---

async function callModelNode(state: AgentState): Promise<Partial<AgentState>> {
  // In a real agent, call your LLM API here.
  // For this example, we simulate tool use on the first iteration.

  let simulatedOutput: string;

  if (state.iterationCount === 0) {
    simulatedOutput = `
      I need to check the weather for you.
      <tool_calls>
        <tool_call>
          <name>get_weather</name>
          <id>call_001</id>
          <args>{"location": "San Francisco"}</args>
        </tool_call>
      </tool_calls>
    `;
  } else {
    const results = state.toolResults.map((r) => `${r.name}: ${r.result}`).join(', ');
    simulatedOutput = `
      Based on the tool results: ${results}
      <final_answer>The weather in San Francisco is 72°F and partly cloudy.</final_answer>
    `;
  }

  const toolCalls = parseToolCallsFromOutput(simulatedOutput);
  const finalResponse = extractTag(simulatedOutput, 'final_answer');

  const message: AgentMessage = {
    role: 'assistant',
    content: simulatedOutput,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };

  return {
    messages: [message],
    pendingToolCalls: toolCalls,
    finalResponse,
    iterationCount: 1, // counterReducer adds this to current value
  };
}

async function executeToolsNode(state: AgentState): Promise<Partial<AgentState>> {
  const results: ToolResult[] = [];

  for (const toolCall of state.pendingToolCalls) {
    const toolFn = TOOLS[toolCall.name];
    if (toolFn) {
      try {
        const result = toolFn(toolCall.args);
        results.push({ id: toolCall.id, name: toolCall.name, result });
      } catch (err) {
        results.push({
          id: toolCall.id,
          name: toolCall.name,
          result: '',
          error: String(err),
        });
      }
    } else {
      results.push({
        id: toolCall.id,
        name: toolCall.name,
        result: '',
        error: `Tool not found: ${toolCall.name}`,
      });
    }
  }

  const toolMessage: AgentMessage = {
    role: 'tool',
    content: results.map((r) => `${r.name}: ${r.result}`).join('\n'),
    toolResults: results,
  };

  return {
    messages: [toolMessage],
    toolResults: results,
    pendingToolCalls: [],
  };
}

// --- Routers ---

const shouldExecuteTools = createBinaryRouter<AgentState>(
  (state) => state.pendingToolCalls.length > 0 && !state.finalResponse,
  'execute_tools',
  'call_model'
);

const shouldContinue = createEndRouter<AgentState>(
  (state) => !!state.finalResponse || state.iterationCount >= state.maxIterations,
  'route_tools',
  END
);

// --- Build Graph ---

export function buildToolCallingAgent() {
  const builder = new GraphBuilder<AgentState>({
    stateAnnotation: AgentAnnotation,
    flowId: 'tool-calling-agent',
    enableCheckpointing: true,
  });

  builder
    .addNode('call_model', callModelNode)
    .addNode('route_tools', async (state) => state)
    .addNode('execute_tools', executeToolsNode)
    .setEntryPoint('call_model')
    .addConditionalEdge('call_model', shouldContinue)
    .addConditionalEdge('route_tools', shouldExecuteTools)
    .addEdge('execute_tools', 'call_model');

  return builder.compile();
}

// --- Usage Example ---

export async function runToolCallingExample() {
  const graph = buildToolCallingAgent();

  const result = await graph.invoke({
    messages: [{ role: 'user', content: "What's the weather in San Francisco?" }],
    pendingToolCalls: [],
    toolResults: [],
    finalResponse: undefined,
    iterationCount: 0,
    maxIterations: 5,
  });

  console.log('Final response:', result.finalResponse);
  console.log('Tool results:', result.toolResults);
  return result;
}

// Schema validation helper
const AgentInputSchema = z.object({
  query: z.string().min(1),
  maxIterations: z.number().int().min(1).max(20).default(5),
});

export function validateAgentInput(input: unknown) {
  return AgentInputSchema.safeParse(input);
}
