/**
 * Verification test for phaseToFeatureDescription guardrails
 *
 * Verifies that feature descriptions generated from project phases include
 * the guardrails section (testing and docs stipulation).
 */

import { describe, it, expect } from 'vitest';
import { phaseToFeatureDescription } from '../src/project-parser.js';
import type { Phase, Milestone } from '@protolabs-ai/types';

describe('phaseToFeatureDescription guardrails', () => {
  const baseMilestone: Milestone = {
    number: 1,
    slug: 'foundation',
    title: 'Foundation',
    description: 'Core infrastructure setup.',
    phases: [],
    status: 'pending',
  };

  it('includes guardrails section with testing reminder', () => {
    const phase: Phase = {
      number: 1,
      name: 'add-types',
      title: 'Add Types',
      description: 'Create TypeScript types for the feature.',
      complexity: 'small',
    };

    const description = phaseToFeatureDescription(phase, baseMilestone);

    expect(description).toContain('Guardrails');
    expect(description).toContain('tests');
  });

  it('includes documentation reminder in guardrails', () => {
    const phase: Phase = {
      number: 2,
      name: 'implement-api',
      title: 'Implement API',
      description: 'Build the REST endpoint.',
      complexity: 'medium',
    };

    const description = phaseToFeatureDescription(phase, baseMilestone);

    expect(description).toContain('documentation');
    expect(description).toContain('docs/');
  });

  it('guardrails appear after acceptance criteria', () => {
    const phase: Phase = {
      number: 1,
      name: 'add-service',
      title: 'Add Service',
      description: 'Create the service class.',
      acceptanceCriteria: ['Service responds', 'Error handling works'],
      complexity: 'medium',
    };

    const description = phaseToFeatureDescription(phase, baseMilestone);
    const guardrailsIndex = description.indexOf('Guardrails');
    const criteriaIndex = description.indexOf('Acceptance Criteria');

    expect(guardrailsIndex).toBeGreaterThan(-1);
    expect(criteriaIndex).toBeGreaterThan(-1);
    expect(guardrailsIndex).toBeGreaterThan(criteriaIndex);
  });

  it('guardrails appear even without optional fields', () => {
    const phase: Phase = {
      number: 1,
      name: 'simple-phase',
      title: 'Simple Phase',
      description: 'A minimal phase with no extra fields.',
    };

    const description = phaseToFeatureDescription(phase);

    expect(description).toContain('Guardrails');
    expect(description).toContain('tests');
    expect(description).toContain('docs/');
  });
});
