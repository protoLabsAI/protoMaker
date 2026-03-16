import { describe, it, expect } from 'vitest';
import {
  getBugsProject,
  getSystemImprovementsProject,
  getAllPersistentProjects,
  getStarterFeatures,
  getUniversalFeatures,
  getWelcomeNote,
  getDefaultSettings,
  getDefaultCategories,
  getBaseClaudeMd,
  getGitWorkflowSection,
  getAgentGuidelinesSection,
  getDocsCommandsSection,
  getExtensionCommandsSection,
  getCodingRules,
  getDocsCI,
  getExtensionCI,
} from '../index.js';

describe('projects', () => {
  it('returns bugs project with correct shape', () => {
    const bugs = getBugsProject();
    expect(bugs.slug).toBe('bugs');
    expect(bugs.title).toBe('Bugs');
    expect(bugs.type).toBe('ongoing');
    expect(bugs.status).toBe('drafting');
    expect(bugs.milestones).toEqual([]);
    expect(bugs.goal).toBeTruthy();
  });

  it('returns system improvements project with correct shape', () => {
    const si = getSystemImprovementsProject();
    expect(si.slug).toBe('system-improvements');
    expect(si.title).toBe('System Improvements');
    expect(si.type).toBe('ongoing');
    expect(si.status).toBe('drafting');
    expect(si.milestones).toEqual([]);
    expect(si.priority).toBe('medium');
    expect(si.color).toBe('#8b5cf6');
  });

  it('getAllPersistentProjects returns both', () => {
    const projects = getAllPersistentProjects();
    expect(projects).toHaveLength(2);
    expect(projects.map((p) => p.slug)).toEqual(['bugs', 'system-improvements']);
  });
});

describe('features', () => {
  it('returns universal features for general type', () => {
    const features = getStarterFeatures('general');
    expect(features.length).toBeGreaterThanOrEqual(3);
    expect(features.every((f) => f.title && f.description && f.complexity)).toBe(true);
  });

  it('returns universal + docs features for docs type', () => {
    const universal = getUniversalFeatures();
    const docs = getStarterFeatures('docs');
    expect(docs.length).toBeGreaterThan(universal.length);
  });

  it('returns universal + extension features for extension type', () => {
    const universal = getUniversalFeatures();
    const ext = getStarterFeatures('extension');
    expect(ext.length).toBeGreaterThan(universal.length);
  });

  it('all features have valid complexity values', () => {
    for (const type of ['docs', 'extension', 'general'] as const) {
      const features = getStarterFeatures(type);
      for (const f of features) {
        expect(['small', 'medium', 'large']).toContain(f.complexity);
      }
    }
  });
});

describe('welcome note', () => {
  it('includes project name', () => {
    const note = getWelcomeNote({ projectName: 'Test Project' });
    expect(note).toContain('Test Project');
    expect(note).toContain('protoLabs Studio');
  });
});

describe('settings', () => {
  it('returns default settings', () => {
    const settings = getDefaultSettings();
    expect(settings.version).toBe(1);
    expect(settings.worktreePanelVisible).toBe(false);
  });

  it('returns default categories', () => {
    const categories = getDefaultCategories();
    expect(categories).toEqual(['Uncategorized']);
  });
});

describe('claude-md', () => {
  it('getBaseClaudeMd includes project name', () => {
    const md = getBaseClaudeMd({ projectName: 'My App' });
    expect(md).toContain('# My App');
    expect(md).toContain('protoLabs Studio');
  });

  it('getGitWorkflowSection is non-empty', () => {
    const section = getGitWorkflowSection();
    expect(section).toContain('three-branch');
    expect(section).toContain('dev');
    expect(section).toContain('staging');
    expect(section).toContain('main');
  });

  it('getAgentGuidelinesSection is non-empty', () => {
    const section = getAgentGuidelinesSection();
    expect(section).toContain('coding-rules.md');
  });

  it('getDocsCommandsSection is non-empty', () => {
    const section = getDocsCommandsSection();
    expect(section).toContain('npm run dev');
    expect(section).toContain('npm run build');
  });

  it('getExtensionCommandsSection is non-empty', () => {
    const section = getExtensionCommandsSection();
    expect(section).toContain('pnpm dev');
    expect(section).toContain('pnpm build');
  });
});

describe('coding-rules', () => {
  it('returns docs rules', () => {
    const rules = getCodingRules('docs');
    expect(rules).toContain('Diataxis');
    expect(rules).toContain('Prettier');
  });

  it('returns extension rules', () => {
    const rules = getCodingRules('extension');
    expect(rules).toContain('Browser Extension');
    expect(rules).toContain('web-ext');
  });

  it('returns typescript rules', () => {
    const rules = getCodingRules('typescript');
    expect(rules).toContain('strict mode');
    expect(rules).toContain('kebab-case');
  });

  it('returns react rules', () => {
    const rules = getCodingRules('react');
    expect(rules).toContain('React Components');
    expect(rules).toContain('Tailwind');
  });

  it('all types return non-empty strings', () => {
    for (const type of ['docs', 'extension', 'typescript', 'react'] as const) {
      const rules = getCodingRules(type);
      expect(rules.length).toBeGreaterThan(100);
    }
  });
});

describe('ci', () => {
  it('returns docs CI YAML', () => {
    const ci = getDocsCI();
    expect(ci).toContain('name: CI');
    expect(ci).toContain('npm run build');
    expect(ci).toContain('Cloudflare Pages');
  });

  it('returns extension CI YAML', () => {
    const ci = getExtensionCI();
    expect(ci).toContain('name: CI');
    expect(ci).toContain('pnpm install');
    expect(ci).toContain('pnpm lint');
    expect(ci).toContain('pnpm test');
  });
});
