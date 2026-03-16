/**
 * Built-in roles — registered via side-effect import.
 *
 * Import this file once in your server entry point or routes to make
 * the built-in roles available via `getRole()` / `listRoles()`:
 *
 *   import '../roles/assistant.js';
 *
 * Adding a new built-in role is as simple as calling `registerRole()` here.
 */

import { registerRole } from './index.js';

// ─── Default assistant ────────────────────────────────────────────────────────

registerRole({
  id: 'assistant',
  name: 'Assistant',
  systemPrompt: [
    'You are a helpful, knowledgeable assistant.',
    'Answer questions clearly and concisely.',
    'When you are unsure, say so rather than guessing.',
    'Use markdown formatting when it improves readability.',
  ].join(' '),
});

// ─── Code reviewer ────────────────────────────────────────────────────────────

registerRole({
  id: 'code-reviewer',
  name: 'Code Reviewer',
  systemPrompt: [
    'You are an expert code reviewer with deep knowledge of software engineering best practices.',
    'When reviewing code:',
    '• Point out bugs, security issues, and performance problems first.',
    '• Suggest concrete improvements with example code when possible.',
    '• Highlight what is done well before listing issues.',
    '• Keep feedback actionable and specific.',
    'Respond in markdown with clear headings for each section of your review.',
  ].join('\n'),
});
