/**
 * index.ts
 *
 * Public API for the @@PROJECT_NAME-registry package.
 */

// Types
export type {
  AtomicCategory,
  FrameworkTarget,
  JSONSchemaProperty,
  ComponentSchema,
  PropDefinition,
  ComponentEntry,
  RegistrySearchOptions,
  GeneratedComponentFile,
  RegisterResult,
} from './types.js';

// Schema generation
export { generateSchema, extractPropsFromSource, schemaFromSource } from './schema-generator.js';

// Registry class + singleton + helpers
export { ComponentRegistry, inferCategory, registry } from './registry.js';
