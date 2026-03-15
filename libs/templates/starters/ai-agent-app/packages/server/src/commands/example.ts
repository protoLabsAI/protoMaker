/**
 * Example slash commands.
 *
 * Import this module to register all built-in commands into the registry.
 * The side-effect import pattern ensures commands are available as soon as
 * any route that needs them loads this file.
 *
 * To add a new command:
 *   registerCommand({
 *     name: 'mycommand',
 *     description: 'What this command does',
 *     expand: (args) => `System prompt text injected before the conversation…`,
 *   });
 */

import { registerCommand } from './registry.js';

// ─── /summarize ───────────────────────────────────────────────────────────────

/**
 * /summarize
 *
 * Instructs the model to produce a concise summary of the conversation so far.
 * The expansion is injected as a system-prompt prefix, so the model receives
 * the instruction before seeing any of the conversation messages.
 */
registerCommand({
  name: 'summarize',
  description: 'Summarize the conversation so far with key points and action items.',
  expand: (_args: string): string =>
    'Please provide a concise, well-structured summary of the conversation so far. ' +
    'Include: key topics discussed, decisions made, open questions, and any action items. ' +
    'Use clear headings if there are multiple distinct topics. ' +
    'Keep the summary focused and easy to scan.',
});

// ─── /eli5 ────────────────────────────────────────────────────────────────────

/**
 * /eli5 [topic]
 *
 * Instructs the model to explain a concept in simple, plain language.
 * If args are provided they specify the topic; otherwise the model explains
 * whatever was most recently discussed.
 */
registerCommand({
  name: 'eli5',
  description: "Explain a concept in simple language (Explain Like I'm 5).",
  expand: (args: string): string => {
    const topic = args.trim();
    return topic
      ? `Please explain "${topic}" in very simple, plain language that anyone can understand. ` +
          'Avoid jargon. Use short sentences, everyday analogies, and concrete examples.'
      : 'Please re-explain the most recent concept in very simple, plain language that anyone can understand. ' +
          'Avoid jargon. Use short sentences, everyday analogies, and concrete examples.';
  },
});

// ─── /bullets ─────────────────────────────────────────────────────────────────

/**
 * /bullets
 *
 * Instructs the model to respond using bullet points instead of prose.
 */
registerCommand({
  name: 'bullets',
  description: 'Ask the assistant to respond in concise bullet points.',
  expand: (_args: string): string =>
    'Respond using concise bullet points. ' +
    'Each bullet should be one clear, self-contained idea. ' +
    'Avoid long paragraphs or unnecessary filler text.',
});
