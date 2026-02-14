/**
 * Pair Configurations
 *
 * Defines the three reviewer pairs for the antagonistic review process:
 * 1. Frank ↔ Chris: Security & Compliance
 * 2. Matt ↔ Cindi: Performance & Scalability
 * 3. Sam ↔ Jake: Integration & Dependencies
 *
 * Each pair has domain-specific prompts that guide their review focus.
 */

import { type PairConfig } from './nodes/pair-review.js';

/**
 * Frank (Security Expert) ↔ Chris (Compliance Analyst)
 * Focus: Security vulnerabilities, data protection, regulatory compliance
 */
export const FRANK_CHRIS_PAIR: PairConfig = {
  section: 'security-compliance',
  reviewerA: {
    name: 'Frank',
    role: 'Security Expert',
    prompt:
      'Evaluate security vulnerabilities, authentication mechanisms, data encryption, input validation, and potential attack vectors. Focus on OWASP Top 10 and secure coding practices.',
  },
  reviewerB: {
    name: 'Chris',
    role: 'Compliance Analyst',
    prompt:
      'Review regulatory compliance requirements (GDPR, CCPA, SOC2), data retention policies, audit trails, and privacy controls. Ensure alignment with industry standards and legal obligations.',
  },
};

/**
 * Matt (Performance Engineer) ↔ Cindi (Scalability Architect)
 * Focus: Performance optimization, resource usage, scalability patterns
 */
export const MATT_CINDI_PAIR: PairConfig = {
  section: 'performance-scalability',
  reviewerA: {
    name: 'Matt',
    role: 'Performance Engineer',
    prompt:
      'Analyze response times, throughput, resource utilization (CPU, memory, I/O), caching strategies, and query optimization. Identify performance bottlenecks and inefficiencies.',
  },
  reviewerB: {
    name: 'Cindi',
    role: 'Scalability Architect',
    prompt:
      'Assess horizontal and vertical scaling capabilities, load distribution, database sharding, microservices architecture, and capacity planning. Focus on handling growth and traffic spikes.',
  },
};

/**
 * Sam (Integration Specialist) ↔ Jake (Dependencies Analyst)
 * Focus: External integrations, third-party dependencies, API contracts
 */
export const SAM_JAKE_PAIR: PairConfig = {
  section: 'integration-dependencies',
  reviewerA: {
    name: 'Sam',
    role: 'Integration Specialist',
    prompt:
      'Review external API integrations, webhook configurations, message queue patterns, and inter-service communication. Evaluate integration points for reliability and error handling.',
  },
  reviewerB: {
    name: 'Jake',
    role: 'Dependencies Analyst',
    prompt:
      'Analyze third-party library dependencies, version compatibility, licensing constraints, security vulnerabilities in dependencies, and maintenance burden. Assess dependency health and update strategies.',
  },
};

/**
 * All three pairs for parallel review
 */
export const ALL_PAIRS: PairConfig[] = [FRANK_CHRIS_PAIR, MATT_CINDI_PAIR, SAM_JAKE_PAIR];

/**
 * Get pair configuration by section name
 */
export function getPairBySection(section: string): PairConfig | undefined {
  return ALL_PAIRS.find((pair) => pair.section === section);
}

/**
 * Get all section names
 */
export function getAllSections(): string[] {
  return ALL_PAIRS.map((pair) => pair.section);
}
