/**
 * GET /api/roles — list all available agent roles.
 *
 * Response: AgentRole[]
 *
 *   [
 *     { "id": "assistant",     "name": "Assistant",     "systemPrompt": "...", "defaultModel": "..." },
 *     { "id": "code-reviewer", "name": "Code Reviewer", "systemPrompt": "...", "defaultModel": "..." }
 *   ]
 *
 * Wire role selection into a chat request by passing the role's `systemPrompt`
 * (and optionally `defaultModel`) to POST /api/chat as the `system` / `model`
 * fields.  Example client usage:
 *
 *   const roles = await fetch('/api/roles').then(r => r.json());
 *   const role  = roles.find(r => r.id === 'code-reviewer');
 *
 *   fetch('/api/chat', {
 *     method: 'POST',
 *     body: JSON.stringify({
 *       messages,
 *       system: role.systemPrompt,
 *       model:  role.defaultModel,   // omit to use server default
 *     }),
 *   });
 */

import { Router, type Request, type Response } from 'express';
import { listRoles, getRole } from '../roles/index.js';

// Side-effect: ensure the built-in roles (assistant + code-reviewer) are
// registered before any request is handled.
import '../roles/assistant.js';

const router = Router();

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', (_req: Request, res: Response): void => {
  res.json(listRoles());
});

// ── GET /:id ──────────────────────────────────────────────────────────────────

router.get('/:id', (req: Request, res: Response): void => {
  const role = getRole(String(req.params['id'] ?? ''));
  if (!role) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }
  res.json(role);
});

export default router;
