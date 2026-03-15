/**
 * XCL Codec
 *
 * Bidirectional codec between ComponentDef TypeScript types, XCL (XML Component
 * Language) wire format, and TSX (React 19) code generation.
 *
 * Pipeline:
 *   ComponentDef → serializer → XCL string
 *   XCL string   → deserializer → ComponentDef
 *   XCL string   → xcl-to-tsx → TSX React component code
 */

export type { ComponentDef, PropDef, ConditionalClass } from './types.js';
export { serialize, deserialize } from './serializer.js';
export { xclToTsx } from './xcl-to-tsx.js';
