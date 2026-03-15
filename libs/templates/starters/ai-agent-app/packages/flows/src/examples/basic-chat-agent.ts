/**
 * Basic Chat Agent Example
 *
 * Demonstrates a simple linear LangGraph flow with:
 * - LangGraph Annotation.Root state definition
 * - GraphBuilder with OTel tracing
 * - createLinearGraph factory
 */

import { Annotation } from '@langchain/langgraph';
import { GraphBuilder, createLinearGraph } from '../builder.js';
import { appendReducer } from '../reducers.js';

// --- Types ---

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

// Derive state type from annotation (LangGraph pattern)
type ChatState = typeof ChatAnnotation.State;

// --- LangGraph State Annotation ---
// Use Annotation<T> for simple replace-semantics fields.
// Use Annotation<T>({ value: reducerFn }) for fields with custom merge semantics.

const ChatAnnotation = Annotation.Root({
  // Append-semantics: new messages are concatenated via appendReducer
  messages: Annotation<ChatMessage[]>({
    value: appendReducer,
    default: () => [],
  }),
  // Replace-semantics (default for all other fields)
  userInput: Annotation<string>,
  response: Annotation<string | undefined>,
  iteration: Annotation<number>,
});

// --- Node Functions ---

async function preprocessNode(state: ChatState): Promise<Partial<ChatState>> {
  const userMessage: ChatMessage = { role: 'user', content: state.userInput };
  return {
    messages: [userMessage],
    iteration: (state.iteration ?? 0) + 1,
  };
}

async function generateResponseNode(state: ChatState): Promise<Partial<ChatState>> {
  // In a real agent, call your LLM here:
  // const result = await anthropic.messages.create({ messages: state.messages, ... })
  const response = `Echo: ${state.userInput} (turn ${state.iteration})`;
  return { response };
}

async function postprocessNode(state: ChatState): Promise<Partial<ChatState>> {
  if (state.response) {
    const assistantMessage: ChatMessage = { role: 'assistant', content: state.response };
    return { messages: [assistantMessage] };
  }
  return {};
}

// --- Build Graph with GraphBuilder (low-level API) ---

export function buildChatGraph() {
  const builder = new GraphBuilder<ChatState>({
    stateAnnotation: ChatAnnotation,
    flowId: 'basic-chat-agent',
    enableCheckpointing: true,
  });

  builder
    .addNode('preprocess', preprocessNode)
    .addNode('generate', generateResponseNode)
    .addNode('postprocess', postprocessNode)
    .setEntryPoint('preprocess')
    .addEdge('preprocess', 'generate')
    .addEdge('generate', 'postprocess')
    .setFinishPoint('postprocess');

  return builder.compile();
}

// --- Build Graph with createLinearGraph (factory API) ---

export function buildChatGraphLinear() {
  return createLinearGraph<ChatState>(
    {
      stateAnnotation: ChatAnnotation,
      flowId: 'basic-chat-agent-linear',
    },
    [
      { name: 'preprocess', fn: preprocessNode },
      { name: 'generate', fn: generateResponseNode },
      { name: 'postprocess', fn: postprocessNode },
    ]
  );
}

// --- Usage Example ---

export async function runChatExample() {
  const graph = buildChatGraph();

  const result = await graph.invoke({
    userInput: 'Hello, how are you?',
    messages: [],
    iteration: 0,
  });

  console.log('Response:', result.response);
  console.log('History:', result.messages);
  return result;
}
