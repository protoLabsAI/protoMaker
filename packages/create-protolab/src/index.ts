/**
 * @automaker/create-protolab
 *
 * Package for scaffolding ProtoLab projects.
 */

export { init } from './phases/init.js';
export type { InitOptions, InitResult } from './phases/init.js';

export { setupCI } from './phases/ci.js';
export type { CIOptions, CIResult } from './phases/ci.js';
