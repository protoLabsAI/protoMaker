/**
 * Linear State Mapper
 *
 * Pure functions that map between Automaker feature/project statuses
 * and Linear workflow state names. No side effects, no I/O.
 */

import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('LinearStateMapper');

/**
 * Map an Automaker feature status to a Linear workflow state name.
 */
export function mapAutomakerStatusToLinear(status: string): string {
  switch (status) {
    case 'backlog':
      return 'Backlog';
    case 'in_progress':
      return 'In Progress';
    case 'review':
      return 'In Review';
    case 'done':
      return 'Done';
    case 'blocked':
      return 'Blocked';
    case 'verified':
      return 'Done'; // Map verified to Done
    default:
      logger.warn(`Unknown Automaker status: ${status}, defaulting to Backlog`);
      return 'Backlog';
  }
}

/**
 * Map a Linear workflow state name to an Automaker feature status (reverse mapping).
 */
export function mapLinearStateToAutomaker(stateName: string): string {
  const normalized = stateName.toLowerCase();

  if (normalized.includes('backlog') || normalized.includes('todo')) {
    return 'backlog';
  } else if (normalized.includes('in progress') || normalized.includes('started')) {
    return 'in_progress';
  } else if (normalized.includes('in review') || normalized.includes('review')) {
    return 'review';
  } else if (normalized.includes('done') || normalized.includes('completed')) {
    return 'done';
  } else if (normalized.includes('blocked')) {
    return 'blocked';
  } else if (normalized.includes('cancel') || normalized.includes('duplicate')) {
    // Terminal states — must not recycle into backlog
    return 'done';
  } else if (normalized.includes('triage')) {
    // Intentionally backlog, but log explicitly (not silent fallback)
    logger.info(`Linear state "${stateName}" mapped to backlog (triage)`);
    return 'backlog';
  } else {
    logger.warn(`Unknown Linear state: ${stateName}, defaulting to backlog`);
    return 'backlog';
  }
}

/**
 * Map an Automaker project status to a Linear project status.
 */
export function mapProjectStatusToLinear(status: string): string {
  switch (status) {
    case 'researching':
    case 'drafting':
      return 'planned';
    case 'reviewing':
      return 'planned';
    case 'approved':
    case 'scaffolded':
      return 'started';
    case 'active':
      return 'started';
    case 'completed':
      return 'completed';
    default:
      logger.warn(`Unknown project status: ${status}, defaulting to planned`);
      return 'planned';
  }
}
