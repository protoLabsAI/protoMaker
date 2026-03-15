/**
 * POST /chat — multi-turn chat endpoint with tool use.
 *
 * Accepts an array of messages and returns a single assistant reply.
 * Tools are sourced from the ToolRegistry and automatically converted to
 * the Anthropic API format.
 *
 * ## Request body
 * ```json
 * {
 *   "messages": [{ "role": "user", "content": "What's the weather in Paris?" }],
 *   "model": "claude-3-5-haiku-20241022",
 *   "profile": "chat"
 * }
 * ```
 *
 * ## Response
 * ```json
 * {
 *   "role": "assistant",
 *   "content": "The current weather in Paris is 22°C and partly cloudy.",
 *   "model": "claude-3-5-haiku-20241022",
 *   "usage": { "input_tokens": 412, "output_tokens": 38 }
 * }
 * ```
 *
 * ## Tool use
 * The route runs a standard agentic loop: it calls the model, detects
 * `tool_use` blocks, executes each tool via the ToolRegistry, feeds the
 * results back, and repeats until the model returns `stop_reason: "end_turn"`.
 *
 * ## Tool profiles (optional)
 * Supply `"profile": "chat" | "execution" | "review"` in the request body to
 * restrict which tools are available. Defaults to all registered tools.
 * See `src/tools/registry.ts` for profile definitions.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Request, Response } from 'express';
import {
  registry,
  getAnthropicTools,
  getAnthropicToolsForProfile,
  type ToolProfile,
} from '../tools/registry.js';

const anthropic = new Anthropic();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  /** Optional tool profile — restricts available tools to a named subset. */
  profile?: ToolProfile;
}

/**
 * Express route handler for the chat endpoint.
 *
 * Mount with:
 * ```typescript
 * import express from 'express';
 * import { chatHandler } from './routes/chat.js';
 *
 * const app = express();
 * app.use(express.json());
 * app.post('/chat', chatHandler);
 * ```
 */
export async function chatHandler(req: Request, res: Response): Promise<void> {
  const { messages, model = 'claude-3-5-haiku-20241022', profile } = req.body as ChatRequest;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages must be a non-empty array' });
    return;
  }

  // Resolve tools based on optional profile
  const tools = profile ? getAnthropicToolsForProfile(profile) : getAnthropicTools();

  // Build the conversation history for the Anthropic API
  const conversationMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    let response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      tools,
      messages: conversationMessages,
    });

    // Agentic tool loop — keep running until the model stops using tools
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Append the assistant's tool-use turn to the conversation
      conversationMessages.push({
        role: 'assistant',
        content: response.content,
      });

      // Execute each tool in parallel via the ToolRegistry
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const result = await registry.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );

          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: result.success
              ? JSON.stringify(result.data)
              : `Error: ${result.error ?? 'Tool execution failed'}`,
          };
        })
      );

      // Feed tool results back to the model
      conversationMessages.push({
        role: 'user',
        content: toolResults,
      });

      // Continue the conversation
      response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        tools,
        messages: conversationMessages,
      });
    }

    // Extract the final text response
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    res.json({
      role: 'assistant',
      content: textContent,
      model: response.model,
      usage: response.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[chat] Error:', message);
    res.status(500).json({ error: 'Chat failed', message });
  }
}
