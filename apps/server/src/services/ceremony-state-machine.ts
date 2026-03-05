import type { CeremonyPhase, CeremonyState, CeremonyTransition } from '@protolabsai/types';

/**
 * Pure transition function for the ceremony state machine.
 * Takes the current state, an event string, and an optional payload,
 * and returns the next state. Unknown event+phase combinations return
 * state unchanged. All transitions are appended to state.history.
 *
 * Transition rules:
 *   awaiting_kickoff + project:lifecycle:launched  → milestone_active
 *   milestone_active + milestone:completed         → milestone_retro
 *   milestone_retro  + ceremony:fired(retro)       → milestone_active | project_retro
 *   project_retro    + ceremony:fired(project_retro) → project_complete
 *
 * The ceremony:fired(retro) event moves to project_retro when the payload
 * indicates no remaining milestones ({ remainingMilestones: 0 }), otherwise
 * it moves back to milestone_active for the next milestone.
 */
export function transition(state: CeremonyState, event: string, payload: unknown): CeremonyState {
  const { phase } = state;
  let nextPhase: CeremonyPhase | null = null;

  if (phase === 'awaiting_kickoff' && event === 'project:lifecycle:launched') {
    nextPhase = 'milestone_active';
  } else if (phase === 'milestone_active' && event === 'milestone:completed') {
    nextPhase = 'milestone_retro';
  } else if (phase === 'milestone_retro' && event === 'ceremony:fired(retro)') {
    const remaining =
      payload !== null &&
      typeof payload === 'object' &&
      'remainingMilestones' in (payload as object)
        ? (payload as { remainingMilestones: number }).remainingMilestones
        : 1;
    nextPhase = remaining <= 0 ? 'project_retro' : 'milestone_active';
  } else if (phase === 'project_retro' && event === 'ceremony:fired(project_retro)') {
    nextPhase = 'project_complete';
  }

  if (nextPhase === null) {
    return state;
  }

  const transition: CeremonyTransition = {
    from: phase,
    to: nextPhase,
    trigger: event,
    timestamp: new Date().toISOString(),
  };

  return {
    ...state,
    phase: nextPhase,
    history: [...state.history, transition],
  };
}
