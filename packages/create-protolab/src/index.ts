#!/usr/bin/env node

/**
 * create-protolab - Scaffolding tool for protolab projects
 */

import * as fs from 'fs';
import * as path from 'path';

export function detectPackageManager(cwd: string = process.cwd()): 'npm' | 'pnpm' | 'yarn' {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

export function createProject(name: string, cwd: string = process.cwd()): void {

  const projectPath = path.join(cwd, name);

  // Create project directory
  fs.mkdirSync(projectPath, { recursive: true });

  // Create basic package.json
  const packageJson = {
    name,
    version: '0.1.0',
    description: 'A protolab project',
    main: 'index.js',
    scripts: {
      test: 'echo "Error: no test specified" && exit 1'
    },
    keywords: [],
    author: '',
    license: 'ISC'
  };

  fs.writeFileSync(
    path.join(projectPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Create basic README
  const readme = `# ${name}\n\nA protolab project\n`;
  fs.writeFileSync(path.join(projectPath, 'README.md'), readme);

  // Create .gitignore
  const gitignore = `node_modules/\n.DS_Store\ndist/\n*.log\n`;
  fs.writeFileSync(path.join(projectPath, '.gitignore'), gitignore);

  console.log(`Project ${name} created successfully!`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const projectName = args[0] || 'my-protolab-project';
  createProject(projectName);
}
