/**
 * Goal Satisfied Guard — pre-dispatch goal predicate evaluation.
 *
 * Evaluates whether the target goal predicate for a GOAP action is already
 * satisfied in the current world state snapshot before allowing dispatch.
 *
 * This is architecturally distinct from the existing protection mechanisms:
 * - Cooldown: prevents repeated dispatches within a time window
 * - Dedup: prevents duplicate in-flight incidents
 * - Registry: blocks phantom agent targets
 * - Circuit breaker: pauses routing after consecutive failures
 *
 * The goal-satisfied guard addresses a different failure mode: dispatching
 * corrective actions when the condition they correct is already resolved.
 * Confirmed instances: GitHub #147 (investigate_orphaned_skills dispatched
 * with orphanedSkillCount=0) and #148 (fleet_incident_response re-dispatched
 * after fleet.no_agent_stuck was already resolved).
 */

import { createLogger } from '@protolabsai/utils';

const logger = createLogger('GoalSatisfiedGuard');

/**
 * A flat snapshot of the current world state.
 * Keys are world state property names; values are primitive types only.
 */
export type WorldStateSnapshot = Record<string, boolean | number | string | undefined>;

/**
 * A function that evaluates whether a goal predicate is satisfied given
 * the current world state snapshot.
 *
 * Returns true if the goal IS already satisfied (dispatch should be skipped).
 */
export type GoalPredicate = (state: WorldStateSnapshot) => boolean;

export interface GoalSatisfiedResult {
  /** Whether the goal is already satisfied (dispatch should be blocked). */
  satisfied: boolean;
  /** The skill ID that was evaluated. */
  skillId: string;
  /** Human-readable reason when satisfied=true. */
  reason?: string;
  /** The GOAP goal name (e.g. "fleet.no_skill_orphaned"). */
  goalName?: string;
}

interface RegisteredGoal {
  predicate: GoalPredicate;
  goalName: string;
  description: string;
}

/**
 * GoalSatisfiedGuard — maps GOAP skill IDs to goal predicates and evaluates
 * them against a live world state snapshot before dispatch proceeds.
 *
 * Usage:
 *   const guard = createGoalSatisfiedGuard();
 *   const result = guard.evaluate('investigate_orphaned_skills', worldState);
 *   if (result.satisfied) { // skip dispatch }
 */
export class GoalSatisfiedGuard {
  private goals = new Map<string, RegisteredGoal>();

  /**
   * Register a goal predicate for a skill.
   *
   * @param skillId    The GOAP skill / action identifier
   * @param predicate  Function returning true when goal is already satisfied
   * @param goalName   GOAP goal name (e.g. "fleet.no_skill_orphaned")
   * @param description Human-readable description for log messages
   */
  register(skillId: string, predicate: GoalPredicate, goalName: string, description: string): void {
    this.goals.set(skillId, { predicate, goalName, description });
    logger.debug(`Registered goal predicate for skill "${skillId}": ${goalName}`);
  }

  /**
   * Evaluate whether the goal for a skill is already satisfied.
   *
   * If no predicate is registered for the skill, returns satisfied=false
   * (allow dispatch — unknown skill is not blocked).
   */
  evaluate(skillId: string, worldState: WorldStateSnapshot): GoalSatisfiedResult {
    const goal = this.goals.get(skillId);
    if (!goal) {
      return { satisfied: false, skillId };
    }

    const satisfied = goal.predicate(worldState);
    if (satisfied) {
      logger.info(
        `Goal "${goal.goalName}" for skill "${skillId}" already satisfied in world state — blocking dispatch. ${goal.description}`
      );
      return {
        satisfied: true,
        skillId,
        goalName: goal.goalName,
        reason: `Goal "${goal.goalName}" is already satisfied: ${goal.description}`,
      };
    }

    return { satisfied: false, skillId, goalName: goal.goalName };
  }

  /**
   * Returns the list of skill IDs that have registered goal predicates.
   */
  getRegisteredSkills(): string[] {
    return Array.from(this.goals.keys());
  }

  /**
   * Returns the goal name for a skill, or undefined if not registered.
   */
  getGoalName(skillId: string): string | undefined {
    return this.goals.get(skillId)?.goalName;
  }

  /**
   * Clear all registered predicates (admin/testing).
   */
  clear(): void {
    this.goals.clear();
  }
}

// ─── Built-in goal predicates ─────────────────────────────────────────────────
//
// These match the confirmed bug instances from GitHub #147 and #148.
// The world state keys correspond to values the GOAP planner includes in
// the worldState snapshot passed to POST /api/world/check-dispatch.

export const BUILTIN_GOAL_PREDICATES: ReadonlyArray<{
  skillId: string;
  goalName: string;
  description: string;
  predicate: GoalPredicate;
}> = [
  {
    // GitHub #147: investigate_orphaned_skills dispatched with orphanedSkillCount=0
    skillId: 'investigate_orphaned_skills',
    goalName: 'fleet.no_skill_orphaned',
    description: 'orphaned_skill_count is 0 — fleet has no orphaned skills, no action needed',
    predicate: (state) => {
      const count = state['orphaned_skill_count'];
      if (typeof count === 'number') return count === 0;
      // Accept boolean shorthand: fleet_no_skill_orphaned=true
      const noOrphaned = state['fleet_no_skill_orphaned'];
      if (typeof noOrphaned === 'boolean') return noOrphaned;
      return false;
    },
  },
  {
    // GitHub #148: fleet_incident_response re-dispatched after fleet.no_agent_stuck resolved
    skillId: 'fleet_incident_response',
    goalName: 'fleet.no_agent_stuck',
    description: 'stuck_agent_count is 0 — no agents are stuck, fleet is healthy',
    predicate: (state) => {
      const count = state['stuck_agent_count'];
      if (typeof count === 'number') return count === 0;
      // Accept boolean shorthand: fleet_no_agent_stuck=true
      const noStuck = state['fleet_no_agent_stuck'];
      if (typeof noStuck === 'boolean') return noStuck;
      return false;
    },
  },
] as const;

/**
 * Create a GoalSatisfiedGuard pre-populated with built-in predicates
 * for all known GOAP skills.
 */
export function createGoalSatisfiedGuard(): GoalSatisfiedGuard {
  const guard = new GoalSatisfiedGuard();
  for (const { skillId, goalName, description, predicate } of BUILTIN_GOAL_PREDICATES) {
    guard.register(skillId, predicate, goalName, description);
  }
  return guard;
}
