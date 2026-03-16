/**
 * GET /api/commands — List registered slash commands.
 *
 * Returns the name and description of every registered slash command.
 * The `expand` function is server-side only and is intentionally omitted
 * from the response.
 *
 * Response:
 *   {
 *     commands: Array<{ name: string; description: string }>
 *   }
 *
 * Used by the client's SlashCommandDropdown to populate the autocomplete list
 * when the user types a leading `/` in the chat input.
 *
 * Example response:
 *   {
 *     "commands": [
 *       { "name": "bullets",   "description": "Ask the assistant to respond in concise bullet points." },
 *       { "name": "eli5",      "description": "Explain a concept in simple language (Explain Like I'm 5)." },
 *       { "name": "summarize", "description": "Summarize the conversation so far with key points and action items." }
 *     ]
 *   }
 */

import { Router, type Request, type Response } from 'express';
import { listCommands } from '../commands/registry.js';

// Side-effect import: registers all built-in commands into the registry
import '../commands/example.js';

const router = Router();

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', (_req: Request, res: Response): void => {
  const commands = listCommands().map(({ name, description }) => ({ name, description }));
  res.json({ commands });
});

export default router;
