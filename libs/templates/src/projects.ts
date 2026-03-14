/**
 * Persistent Project Templates
 *
 * Canonical shapes for always-present projects that every protoLabs installation gets.
 */

import type { ProjectTemplate } from './types.js';

/**
 * Bugs project — persistent container for all bug reports and fixes.
 */
export function getBugsProject(): ProjectTemplate {
  return {
    slug: 'bugs',
    title: 'Bugs',
    goal: 'Persistent project for tracking all bug reports, investigations, and fixes.',
    type: 'ongoing',
    status: 'drafting',
    milestones: [],
  };
}

/**
 * System Improvements project — persistent container for friction-driven improvements.
 */
export function getSystemImprovementsProject(): ProjectTemplate {
  return {
    slug: 'system-improvements',
    title: 'System Improvements',
    goal: 'Continuous system improvement tickets filed by agents from observed friction patterns.',
    type: 'ongoing',
    status: 'drafting',
    priority: 'medium',
    color: '#8b5cf6',
    milestones: [],
  };
}

/**
 * Returns all persistent projects that should exist in every protoLabs installation.
 */
export function getAllPersistentProjects(): ProjectTemplate[] {
  return [getBugsProject(), getSystemImprovementsProject()];
}
