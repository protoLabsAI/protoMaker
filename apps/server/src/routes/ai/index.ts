/**
 * AI Routes — Streaming endpoints for editor AI features
 *
 * Three endpoints powering the notes panel AI:
 * - POST /api/ai/complete — Ghost text autocomplete (short predictions)
 * - POST /api/ai/rewrite — Selection-based rewrite/shorten/fix
 * - POST /api/ai/generate — Slash command generation
 *
 * All endpoints stream responses via SSE for real-time UX.
 * Uses Vercel AI SDK with @ai-sdk/anthropic.
 */

import { Router, type Request, type Response } from 'express';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createLogger } from '@automaker/utils';

const logger = createLogger('AIRoutes');

/** Strip HTML tags for plain-text context */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createAIRoutes(): Router {
  const router = Router();

  /**
   * POST /api/ai/complete
   *
   * Ghost text autocomplete — returns a short continuation (5-15 words).
   * Uses Haiku for low latency.
   *
   * Body: { context: string, currentLine: string }
   * Response: SSE text stream
   */
  router.post('/complete', async (req: Request, res: Response) => {
    try {
      const { context, currentLine, projectContext } = req.body as {
        context?: string;
        currentLine?: string;
        projectContext?: string;
      };

      if (!currentLine && !context) {
        res.status(400).json({ error: 'context or currentLine is required' });
        return;
      }

      // Build a focused prompt for short completions
      const contextText = context ? stripHtml(context) : '';
      const lineText = currentLine ? stripHtml(currentLine) : '';

      // Limit context to last ~2000 chars to keep latency low
      const trimmedContext = contextText.slice(-2000);

      // Optionally include project context for domain-aware predictions
      const projectHint = projectContext
        ? `\n- Use the project context to make relevant predictions that fit the project domain`
        : '';
      const projectSection = projectContext
        ? `Project context:\n${stripHtml(projectContext).slice(0, 500)}\n\n`
        : '';

      logger.debug(
        `AI complete: context=${trimmedContext.length}chars, line="${lineText.slice(0, 50)}", projectContext=${projectContext ? 'yes' : 'no'}`
      );

      const result = streamText({
        model: anthropic('claude-haiku-4-5-20251001'),
        system: `You are an inline text autocomplete engine. Given the preceding text and the current line being typed, predict the next 5-15 words that naturally continue the thought. Rules:
- Output ONLY the predicted continuation text, nothing else
- Do not repeat any text already written
- Match the tone, style, and vocabulary of the existing text
- Keep predictions concise and natural
- Do not include any formatting, markdown, or HTML
- If the context is too ambiguous, output nothing${projectHint}`,
        messages: [
          {
            role: 'user',
            content: trimmedContext
              ? `${projectSection}Preceding text:\n${trimmedContext}\n\nCurrent line being typed:\n${lineText}\n\nContinue naturally:`
              : `${projectSection}Current line being typed:\n${lineText}\n\nContinue naturally:`,
          },
        ],
        maxOutputTokens: 60,
        temperature: 0.3,
        experimental_telemetry: {
          isEnabled: true,
          metadata: { route: '/api/ai/complete' },
        },
      });

      result.pipeTextStreamToResponse(res);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('AI complete error:', error);
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/ai/rewrite
   *
   * Rewrite selected text based on an instruction.
   * Returns streaming HTML compatible with TipTap.
   *
   * Body: { text: string, instruction: string, surroundingContext?: string }
   * Response: SSE text stream (HTML)
   */
  router.post('/rewrite', async (req: Request, res: Response) => {
    try {
      const { text, instruction, surroundingContext } = req.body as {
        text?: string;
        instruction?: string;
        surroundingContext?: string;
      };

      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }
      if (!instruction) {
        res.status(400).json({ error: 'instruction is required' });
        return;
      }

      const contextSnippet = surroundingContext ? stripHtml(surroundingContext).slice(-1000) : '';

      logger.info(`AI rewrite: instruction="${instruction}", text=${text.length}chars`);

      const result = streamText({
        model: anthropic('claude-sonnet-4-5-20250929'),
        system: `You are an inline text editor. You receive selected text and an instruction for how to transform it. Rules:
- Output ONLY the rewritten text, nothing else
- Preserve the general formatting intent (paragraphs, lists, emphasis)
- Use simple HTML tags that TipTap supports: <p>, <strong>, <em>, <s>, <code>, <ul>, <ol>, <li>, <blockquote>, <h1>-<h3>, <pre><code>
- Do not wrap output in markdown code fences
- Do not add explanations, preambles, or commentary
- Match the voice and register of the surrounding context when available`,
        messages: [
          {
            role: 'user',
            content: contextSnippet
              ? `Surrounding context:\n${contextSnippet}\n\nSelected text:\n${text}\n\nInstruction: ${instruction}`
              : `Selected text:\n${text}\n\nInstruction: ${instruction}`,
          },
        ],
        temperature: 0.4,
        experimental_telemetry: {
          isEnabled: true,
          metadata: { route: '/api/ai/rewrite', instruction },
        },
      });

      result.pipeTextStreamToResponse(res);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('AI rewrite error:', error);
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/ai/generate
   *
   * Generate content from a slash command.
   * Returns streaming HTML compatible with TipTap.
   *
   * Body: { command: string, context: string, selection?: string }
   * Response: SSE text stream (HTML)
   */
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const { command, context, selection } = req.body as {
        command?: string;
        context?: string;
        selection?: string;
      };

      if (!command) {
        res.status(400).json({ error: 'command is required' });
        return;
      }

      const contextText = context ? stripHtml(context).slice(-3000) : '';
      const selectionText = selection ? stripHtml(selection) : '';

      logger.info(`AI generate: command="${command}", context=${contextText.length}chars`);

      // Map commands to specific instructions
      const commandInstructions: Record<string, string> = {
        summarize: 'Summarize the following text concisely, capturing the key points.',
        expand: 'Expand on the following text with more detail, examples, and explanation.',
        translate:
          'Translate the following text to English (or from English to the detected target language).',
        continue: 'Continue writing naturally from where the text leaves off.',
        'fix-grammar': 'Fix all grammar, spelling, and punctuation errors in the text.',
        'professional-tone': 'Rewrite the text in a professional, polished tone.',
        'casual-tone': 'Rewrite the text in a casual, conversational tone.',
        simplify: 'Simplify the text to be more readable and accessible.',
      };

      const specificInstruction = commandInstructions[command] || command;

      const result = streamText({
        model: anthropic('claude-sonnet-4-5-20250929'),
        system: `You are an AI writing assistant integrated into a rich text editor. You receive a command and document context, and generate content accordingly. Rules:
- Output ONLY the generated content, nothing else
- Use simple HTML tags that TipTap supports: <p>, <strong>, <em>, <s>, <code>, <ul>, <ol>, <li>, <blockquote>, <h1>-<h3>, <pre><code>
- Do not wrap output in markdown code fences
- Do not add explanations, preambles, or commentary
- Match the tone and style of the surrounding document context
- For "continue" commands, seamlessly extend the existing content`,
        messages: [
          {
            role: 'user',
            content: selectionText
              ? `Document context:\n${contextText}\n\nSelected text:\n${selectionText}\n\nCommand: ${specificInstruction}`
              : `Document context:\n${contextText}\n\nCommand: ${specificInstruction}`,
          },
        ],
        temperature: 0.5,
        experimental_telemetry: {
          isEnabled: true,
          metadata: { route: '/api/ai/generate', command },
        },
      });

      result.pipeTextStreamToResponse(res);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('AI generate error:', error);
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  return router;
}
