#!/usr/bin/env node

/**
 * create-protolab - Scaffolding tool for creating new Protolab projects
 */

export function main() {
  console.log('create-protolab - Project scaffolding tool');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
