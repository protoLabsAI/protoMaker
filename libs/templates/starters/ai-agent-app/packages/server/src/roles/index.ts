/**
 * Agent role system.
 *
 * Each role defines a unique identity for the AI assistant:
 *   - id:            Stable, URL-safe identifier (e.g. "assistant", "code-reviewer")
 *   - name:          Human-readable display name shown in the UI
 *   - systemPrompt:  Injected as the `system` field in every chat request for this role
 *   - defaultModel:  Optional model override; falls back to the server-level default
 *
 * Usage — register built-in roles via side-effect imports in server entry points
 * or route files:
 *
 *   import '../roles/assistant.js';   // registers assistant + code-reviewer roles
 *
 * Then query roles at runtime:
 *
 *   const roles = listRoles();        // all registered roles
 *   const role  = getRole('assistant');
 */

// ─── AgentRole interface ──────────────────────────────────────────────────────

export interface AgentRole {
  /** Stable, URL-safe identifier (e.g. "assistant", "code-reviewer"). */
  id: string;
  /** Human-readable display name shown in the UI. */
  name: string;
  /** System prompt injected into every chat request for this role. */
  systemPrompt: string;
  /**
   * Optional model override for this role.
   * Falls back to the server-level default when omitted.
   */
  defaultModel?: string;
}

// ─── In-memory role registry ─────────────────────────────────────────────────

const roleRegistry = new Map<string, AgentRole>();

/**
 * Register a role.  Calling this with an existing id replaces the previous entry.
 */
export function registerRole(role: AgentRole): void {
  roleRegistry.set(role.id, role);
}

/**
 * Look up a role by id.  Returns `undefined` when the id is not registered.
 */
export function getRole(id: string): AgentRole | undefined {
  return roleRegistry.get(id);
}

/**
 * Return all registered roles in insertion order.
 */
export function listRoles(): AgentRole[] {
  return Array.from(roleRegistry.values());
}
