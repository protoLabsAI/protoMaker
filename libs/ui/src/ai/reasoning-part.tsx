/**
 * ReasoningPart — Backward-compatible re-export of ChainOfThought.
 *
 * The reasoning display has been replaced by the ChainOfThought component which
 * parses the reasoning stream into logical step-by-step entries. This module
 * re-exports ChainOfThought under the legacy ReasoningPart name so that
 * existing imports continue to work without changes.
 */

export {
  ChainOfThought as ReasoningPart,
  type ChainOfThoughtProps as ReasoningPartProps,
} from './chain-of-thought.js';
