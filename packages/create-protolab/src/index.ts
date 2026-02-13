/**
 * create-protolab
 *
 * Scan any repo, compare against the ProtoLabs gold standard,
 * and scaffold the full automation stack.
 */

export { init } from './phases/init.js';
export type { InitOptions, InitResult } from './phases/init.js';

export { setupCI } from './phases/ci.js';
export type { CIOptions, CIResult } from './phases/ci.js';
