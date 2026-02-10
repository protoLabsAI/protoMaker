# SetupLab Audit & Improvement Plan

**Date**: 2026-02-09
**Status**: Current Implementation Review

---

## Current Implementation

### Command Flow

```
User: /setuplab <path>
  ↓
Skill: packages/mcp-server/plugins/automaker/commands/setuplab.md (haiku)
  ↓
MCP Tool: mcp__automaker__setup_lab({ projectPath })
  ↓
API Endpoint: POST /api/setup/project
  ↓
Handler: apps/server/src/routes/setup/routes/project.ts
```

### What It Currently Does

**File Structure Created:**

```
<projectPath>/
├── .automaker/
│   ├── features/         ✅ Created
│   ├── context/          ✅ Created
│   │   └── CLAUDE.md     ✅ Created (basic template)
│   └── memory/           ✅ Created
├── protolab.config       ✅ Created (JSON format)
└── [project adds to settings.json]
```

**Project Registration:**

- ✅ Adds project to global settings with UUID
- ✅ Tracks project name, path, lastOpened timestamp
- ✅ Handles duplicate detection (skips if exists)

**Security:**

- ✅ Path validation (exists, is directory)
- ✅ Symlink resolution
- ✅ ALLOWED_ROOT_DIRECTORY enforcement
- ✅ Permission checking

---

## Gaps & Missing Features

### 1. **No Git Repository Detection**

**Current**: No git awareness
**Impact**: Misses opportunity to:

- Validate project is in a git repo (Automaker requires git for worktrees)
- Warn if `.git` doesn't exist
- Suggest `git init` if needed
- Detect existing branches/remotes

**Recommendation**: Add git detection to setuplab flow

### 2. **No Codebase Analysis**

**Current**: Creates generic CLAUDE.md template
**Available**: `analyzeProject()` in AutoModeService (uses spec generation)
**Gap**: SetupLab doesn't leverage existing analysis capabilities

**What's Possible:**

```typescript
// apps/server/src/routes/auto-mode/routes/analyze-project.ts
autoModeService.analyzeProject(projectPath)
  ↓
// Uses generateSpec() with project analysis
// Can detect: tech stack, architecture, patterns, conventions
```

**Recommendation**: Optionally trigger codebase analysis during setup

### 3. **Generic CLAUDE.md Template**

**Current Template** (lines 133-160 of project.ts):

```markdown
# ${projectName}

## Project Overview

${projectName} is a project managed with Automaker ProtoLab.

## Important Guidelines

- Follow coding standards and best practices for this project
- Document significant architectural decisions
- Keep code clean, tested, and maintainable

## Common Commands

\`\`\`bash

# Add your common commands here

\`\`\`

## Architecture

Describe your project architecture here.

## Development Workflow

Describe your development workflow here.
```

**Problem**: Too generic, requires manual filling

**Better Approach**: Use spec generation to auto-populate:

- Detected tech stack
- Project structure
- Build commands (from package.json, Makefile, etc.)
- Test commands
- Existing architecture

### 4. **No App Spec Generation**

**Current**: No app_spec.txt created
**Available**: Full spec generation system exists (`generate-spec.ts`)
**Gap**: Manual spec creation required

**Recommendation**: Optionally generate app_spec.txt during setup

### 5. **No Package Manager Detection**

**Current**: No awareness of npm/yarn/pnpm/bun
**Impact**: Can't populate common commands automatically

**Easy Wins:**

- Check for `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`
- Auto-populate common commands in CLAUDE.md

### 6. **No Monorepo Detection**

**Current**: Treats all projects the same
**Impact**: Misses important monorepo patterns

**Detection Opportunities:**

- Check for `pnpm-workspace.yaml`, `lerna.json`, `nx.json`
- Check for `packages/`, `apps/` directories
- Document workspace structure in CLAUDE.md

### 7. **No Language/Framework Detection**

**Current**: No language awareness
**Available**: Spec generation does this
**Impact**: Generic setup for all project types

**Detection Opportunities:**

- TypeScript: `tsconfig.json`
- Python: `pyproject.toml`, `requirements.txt`, `setup.py`
- Rust: `Cargo.toml`
- Go: `go.mod`
- Ruby: `Gemfile`
- Java: `pom.xml`, `build.gradle`

### 8. **No Interactive Setup Wizard**

**Current**: Single step, all-or-nothing
**Better UX**: Multi-step wizard

**Proposed Flow:**

```
Step 1: Path validation
Step 2: Git check (offer init if needed)
Step 3: Analysis options
  [ ] Analyze codebase (uses opus, ~2-5min)
  [ ] Generate app spec
  [ ] Generate features from spec
  [ ] Skip analysis (quick setup)
Step 4: Customization
  [ ] Add coding standards
  [ ] Add test requirements
  [ ] Add commit conventions
Step 5: Confirmation & execution
```

### 9. **No protolab.config Schema or Validation**

**Current**: Minimal JSON structure (lines 110-119):

```json
{
  "name": "project-name",
  "version": "0.1.0",
  "protolab": {
    "enabled": true
  },
  "settings": {}
}
```

**Issues**:

- No schema documentation
- No validation
- Unclear what settings are supported
- JSON format (not YAML/TOML which are more user-friendly)

### 10. **No Context File Seeding**

**Current**: Only creates CLAUDE.md
**Opportunity**: Seed common context files

**Potential Seeds:**

- `coding-standards.md` - Language-specific best practices
- `git-workflow.md` - Branch naming, PR templates
- `testing-requirements.md` - Test coverage, patterns
- `architecture.md` - System design, patterns
- `api-conventions.md` - REST/GraphQL standards

### 11. **No .gitignore Integration**

**Current**: No .gitignore management
**Issue**: `.automaker/` might not be ignored correctly

**Recommendation**:

- Check if `.automaker/events/`, `.automaker/notifications.json` are gitignored
- Suggest adding runtime files to .gitignore

### 12. **No Status Reporting**

**Current**: Returns simple JSON response
**UI Gap**: No progress UI in setup flow

**Better UX**: Stream events like spec generation does

```typescript
events.emit('setup:progress', { step: 'git-check', status: 'complete' });
events.emit('setup:progress', { step: 'analysis', status: 'running' });
```

---

## Improvement Priorities

### P0: Critical for External Projects

1. **Git Repository Detection** - Block if no git repo
2. **Package Manager Detection** - Auto-populate commands
3. **Smart CLAUDE.md Generation** - Use detected info

### P1: Major Value Add

4. **Optional Codebase Analysis** - Leverage existing spec generation
5. **Interactive Setup Wizard** - Better UX
6. **Framework Detection** - Better templates

### P2: Nice to Have

7. **Context File Seeding** - Pre-populate best practices
8. **Monorepo Detection** - Special handling
9. **Progress Streaming** - Better feedback

### P3: Future Enhancement

10. **protolab.config Schema** - Formal spec
11. **.gitignore Integration** - Auto-suggest additions
12. **Multi-Language Support** - Templates per language

---

## Proposed Enhanced Flow

### Quick Setup (Default)

```
1. Validate path
2. Check git repo (error if missing)
3. Detect package manager
4. Detect language/framework
5. Create .automaker/ with smart CLAUDE.md
6. Create protolab.config
7. Add to settings
8. Done! (~5 seconds)
```

### Deep Setup (Optional)

```
1-7. (same as quick setup)
8. Analyze codebase (opus, 2-5min)
9. Generate app_spec.txt
10. Optionally generate features from spec
11. Seed context files (coding standards, etc.)
12. Done! (~2-5 minutes)
```

---

## Technical Implementation Plan

### Phase 1: Foundation (P0)

**File**: `apps/server/src/routes/setup/routes/project.ts`

```typescript
// Add git detection
import { execSync } from 'child_process';

function isGitRepository(projectPath: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: projectPath, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Add package manager detection
function detectPackageManager(projectPath: string): string | null {
  if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) return 'npm';
  return null;
}

// Enhance CLAUDE.md generation
function generateSmartClaudeMd(opts: {
  projectName: string;
  packageManager: string | null;
  hasGit: boolean;
  hasTsConfig: boolean;
}): string {
  // Generate based on detected environment
}
```

### Phase 2: Analysis Integration (P1)

**New Option**: `analyzeCodebase?: boolean`

```typescript
interface ProjectSetupRequest {
  projectPath: string;
  analyzeCodebase?: boolean; // Default: false
  generateSpec?: boolean; // Default: false (requires analyze)
  generateFeatures?: boolean; // Default: false (requires spec)
}
```

**Implementation**:

- If `analyzeCodebase: true`, call `autoModeService.analyzeProject()`
- Use spec generation results to populate CLAUDE.md
- Optionally generate app_spec.txt
- Optionally create features from spec

### Phase 3: Interactive Wizard (P1)

**New Command**: `/setuplab --interactive <path>`

```typescript
// In setuplab.md skill
AskUserQuestion({
  questions: [
    {
      question: 'Should we analyze your codebase?',
      header: 'Analysis',
      multiSelect: false,
      options: [
        {
          label: 'Quick setup',
          description: 'Create structure only (~5 seconds)',
        },
        {
          label: 'Deep setup',
          description: 'Analyze codebase and generate spec (~2-5 minutes)',
        },
      ],
    },
  ],
});
```

---

## Testing Strategy

### Unit Tests

```typescript
// apps/server/tests/unit/routes/setup/project.test.ts

describe('setuplab', () => {
  it('should detect git repository', async () => {
    const result = await setupProject({ projectPath: '/path/with/git' });
    expect(result.gitDetected).toBe(true);
  });

  it('should error if no git repository', async () => {
    await expect(setupProject({ projectPath: '/path/without/git' })).rejects.toThrow(
      'Git repository required'
    );
  });

  it('should detect package manager', async () => {
    const result = await setupProject({ projectPath: '/path/with/pnpm' });
    expect(result.packageManager).toBe('pnpm');
  });

  it('should generate smart CLAUDE.md', async () => {
    const result = await setupProject({
      projectPath: '/path/to/ts-project',
      analyzeCodebase: true,
    });
    expect(result.claudeMd).toContain('TypeScript');
  });
});
```

### E2E Tests

```typescript
// Test setuplab command end-to-end
test('setuplab creates project structure', async () => {
  const tempDir = await createTempProject();
  await runCommand(`/setuplab ${tempDir}`);

  expect(fs.existsSync(path.join(tempDir, '.automaker'))).toBe(true);
  expect(fs.existsSync(path.join(tempDir, 'protolab.config'))).toBe(true);
});
```

---

## Documentation Needs

1. **User Guide**: `docs/setuplab.md`
   - Quick start guide
   - Interactive mode walkthrough
   - Advanced options

2. **API Reference**: `docs/api/setup-project.md`
   - Request/response schema
   - Options documentation
   - Error codes

3. **Developer Guide**: `docs/dev/setuplab-internals.md`
   - Architecture
   - Extension points
   - Adding new detectors

---

## Questions for Josh

1. **Git Requirement**: Should we enforce git repository existence, or allow non-git projects?

2. **Default Behavior**: Quick or deep setup by default?
   - Quick = fast, minimal
   - Deep = thorough, slow

3. **Codebase Analysis**: Should analysis be:
   - Always off (manual trigger)
   - Opt-in (ask user)
   - Opt-out (run by default)

4. **protolab.config Format**: JSON, YAML, or TOML?
   - JSON: Current, consistent with other configs
   - YAML: More readable, supports comments
   - TOML: Cargo/Rust style

5. **Context File Seeding**: Which context files should we seed?
   - Just CLAUDE.md (current)
   - Add coding-standards.md, git-workflow.md?
   - Language-specific templates?

6. **Interactive vs CLI Args**: Should we support both?
   ```bash
   /setuplab . --analyze --spec --features
   /setuplab . --interactive
   ```

---

## Success Metrics

**Before Enhancement**:

- Generic CLAUDE.md (requires manual editing)
- No git awareness
- No codebase intelligence
- Single-step, all-or-nothing

**After Enhancement**:

- Smart CLAUDE.md (pre-populated from analysis)
- Git repo validation
- Optional deep codebase analysis
- Multi-step wizard with options
- Faster time-to-first-feature for new projects

---

## Next Steps

1. ✅ Audit complete - document created
2. ⏳ **Get Josh's input on questions above**
3. ⏳ Design API changes (request/response schema)
4. ⏳ Implement Phase 1 (git detection, package manager, smart CLAUDE.md)
5. ⏳ Test on real external projects
6. ⏳ Implement Phase 2 (analysis integration)
7. ⏳ Implement Phase 3 (interactive wizard)
8. ⏳ Update documentation
9. ⏳ Ship it!
