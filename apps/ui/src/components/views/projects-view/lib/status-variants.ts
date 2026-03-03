type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'muted'
  | 'brand';

/**
 * Maps project lifecycle status to Badge semantic variant.
 * Uses --status-* CSS variables via Badge's success/warning/error/info/muted variants.
 */
export function getProjectStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'researching':
      return 'info';
    case 'drafting':
      return 'warning';
    case 'reviewing':
      return 'brand';
    case 'approved':
      return 'success';
    case 'scaffolded':
      return 'info';
    case 'active':
      return 'warning';
    case 'completed':
      return 'success';
    default:
      return 'muted';
  }
}

/**
 * Maps feature board status to Badge semantic variant.
 */
export function getFeatureStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'backlog':
      return 'muted';
    case 'in_progress':
      return 'info';
    case 'review':
      return 'brand';
    case 'blocked':
      return 'error';
    case 'done':
      return 'success';
    default:
      return 'muted';
  }
}

/**
 * Maps milestone status to Badge semantic variant.
 */
export function getMilestoneStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'stub':
      return 'muted';
    case 'planning':
      return 'info';
    case 'planned':
      return 'brand';
    case 'pending':
      return 'warning';
    case 'in-progress':
      return 'warning';
    case 'completed':
      return 'success';
    default:
      return 'muted';
  }
}
