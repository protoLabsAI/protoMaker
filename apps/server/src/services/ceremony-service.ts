/**
 * CeremonyService — thin orchestrator that composes all ceremony sub-classes
 *
 * Inherits from ProjectRetroCeremony, which composes:
 *   ProjectRetroCeremony → RetroCeremony → StandupCeremony → CeremonyBase
 *
 * The full ceremony logic lives in the sub-classes:
 *   ceremony-base.ts         — shared state, event subscription, utility methods
 *   standup-ceremony.ts      — epic kickoff, milestone standup, epic delivery
 *   retro-ceremony.ts        — milestone retro, content briefs, review ceremonies
 *   project-retro-ceremony.ts — project retro, reflection loop, post-project docs
 */

export { ProjectRetroCeremony as CeremonyService } from './project-retro-ceremony.js';

import { ProjectRetroCeremony } from './project-retro-ceremony.js';

// Singleton instance (matches original export shape)
export const ceremonyService = new ProjectRetroCeremony();
