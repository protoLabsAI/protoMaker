import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { detectPackageManager, createProject } from '../src/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Package Manager Detection', () => {
  it('should detect npm for simple-node fixture', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'simple-node');
    const pm = detectPackageManager(fixturePath);
    expect(pm).toBe('npm');
  });

  it('should detect pnpm for monorepo-pnpm fixture', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'monorepo-pnpm');
    const pm = detectPackageManager(fixturePath);
    expect(pm).toBe('pnpm');
  });

  it('should detect npm for typescript-project fixture', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'typescript-project');
    const pm = detectPackageManager(fixturePath);
    expect(pm).toBe('npm');
  });

  it('should detect npm for nextjs-app fixture', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'nextjs-app');
    const pm = detectPackageManager(fixturePath);
    expect(pm).toBe('npm');
  });

  it('should default to npm when no lockfile exists', () => {
    const pm = detectPackageManager(__dirname);
    expect(pm).toBe('npm');
  });
});

describe('Project Creation', () => {
  const testDir = path.join(__dirname, '.test-temp');
  const projectName = 'test-project';
  const projectPath = path.join(testDir, projectName);

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create a new project with all required files', () => {
    createProject(projectName, testDir);

    // Verify project directory exists
    expect(fs.existsSync(projectPath)).toBe(true);

    // Verify package.json exists and has correct content
    const packageJsonPath = path.join(projectPath, 'package.json');
    expect(fs.existsSync(packageJsonPath)).toBe(true);

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    expect(packageJson.name).toBe(projectName);
    expect(packageJson.version).toBe('0.1.0');

    // Verify README.md exists
    const readmePath = path.join(projectPath, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);

    const readmeContent = fs.readFileSync(readmePath, 'utf-8');
    expect(readmeContent).toContain(projectName);

    // Verify .gitignore exists
    const gitignorePath = path.join(projectPath, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    expect(gitignoreContent).toContain('node_modules/');
  });
});

describe('Cross-platform Path Handling', () => {
  it('should handle paths with forward slashes', () => {
    const fixturePath = path.join(__dirname, 'fixtures/simple-node');
    const pm = detectPackageManager(fixturePath);
    expect(pm).toBe('npm');
  });

  it('should handle absolute paths', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures', 'simple-node');
    const pm = detectPackageManager(fixturePath);
    expect(pm).toBe('npm');
  });
});

describe('Fixture Validation', () => {
  const fixtures = [
    { name: 'simple-node', expectedFiles: ['package.json', 'index.js', 'package-lock.json'] },
    {
      name: 'monorepo-pnpm',
      expectedFiles: ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml'],
    },
    {
      name: 'typescript-project',
      expectedFiles: ['package.json', 'tsconfig.json', 'src/index.ts', 'package-lock.json'],
    },
    {
      name: 'nextjs-app',
      expectedFiles: ['package.json', 'next.config.js', 'app/page.tsx', 'package-lock.json'],
    },
  ];

  fixtures.forEach(({ name, expectedFiles }) => {
    it(`should have all required files in ${name} fixture`, () => {
      const fixturePath = path.join(__dirname, 'fixtures', name);

      expectedFiles.forEach((file) => {
        const filePath = path.join(fixturePath, file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });
});
