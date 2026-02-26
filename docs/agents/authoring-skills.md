# Authoring Skills

Skills are reusable prompt templates stored as markdown files in `.automaker/skills/`. They enable self-learning by tracking usage statistics and automatically loading relevant skills based on task context.

## Quick Start

**Create a skill in 5 minutes:**

### 1. Create the skill file

Create `.automaker/skills/code-review-checklist.md`:

```markdown
---
name: code-review-checklist
emoji: 🔍
description: Comprehensive code review checklist for PRs
requires:
  bins: [git]
metadata:
  author: josh
  created: 2026-02-25T00:00:00Z
  usageCount: 0
  successRate: 0
  tags: [code-review, quality]
  source: learned
---

# Code Review Checklist

Use this checklist when reviewing pull requests to ensure comprehensive quality checks.

## Functional Review

- [ ] Code achieves stated objectives
- [ ] Edge cases handled appropriately
- [ ] Error handling is comprehensive
- [ ] User-facing changes match requirements

## Code Quality

- [ ] Code follows repository conventions
- [ ] Functions are focused and single-purpose
- [ ] Variable names are descriptive
- [ ] No commented-out code or TODOs
- [ ] No obvious performance issues

## Testing

- [ ] New code has test coverage
- [ ] Tests are meaningful (not just for coverage)
- [ ] CI passes all checks
- [ ] Manual testing documented

## Security

- [ ] No hardcoded secrets or credentials
- [ ] Input validation present
- [ ] No SQL injection risks
- [ ] No XSS vulnerabilities

## Documentation

- [ ] Code is self-documenting where possible
- [ ] Complex logic has comments
- [ ] README updated if needed
- [ ] API docs updated if needed

## Review Actions

1. Read PR description and requirements
2. Review changed files systematically
3. Check for each item above
4. Leave specific, actionable comments
5. Approve or request changes
```

### 2. Use the skill

Skills are automatically loaded when relevant. You can also manually reference them:

```typescript
// Agent prompt automatically includes relevant skills
const skillsResult = await loadRelevantSkills(projectPath, {
  tags: ['code-review'],
  featureTitle: 'Review PR #123',
});

console.log(skillsResult.formattedPrompt);
// Includes the code-review-checklist skill
```

## Skill File Format

### YAML Frontmatter

Skills use YAML frontmatter for metadata:

```yaml
---
name: skill-name # Required: kebab-case identifier
emoji: 🚀 # Optional: visual identifier
description: Brief desc # Required: when/why to use this skill
requires: # Optional: prerequisites
  bins: [git, npm] # Required executables
  files: [package.json] # Required files
  env: [API_KEY] # Required environment variables
metadata: # Tracking data
  author: username # Who created it
  created: ISO-date # Creation timestamp
  updated: ISO-date # Last update timestamp
  usageCount: 0 # Times used
  successRate: 0.95 # Success rate (0.0-1.0)
  version: 1.0.0 # Semantic version
  tags: [tag1, tag2] # Categorization tags
  source: learned # learned | imported | built-in
---
```

### Markdown Body

The content after frontmatter is the skill prompt/instructions:

```markdown
# Skill Title

Clear description of what this skill does and when to use it.

## Instructions

1. Step-by-step instructions
2. Clear, actionable guidance
3. Code examples if applicable

## Best Practices

- Tip 1
- Tip 2

## Common Pitfalls

- Mistake to avoid 1
- Mistake to avoid 2

## Example

\`\`\`
Code example showing skill usage
\`\`\`
```

## Creating Skills

### Via Filesystem

Manually create `.md` files in `.automaker/skills/`:

```bash
# Create skills directory
mkdir -p .automaker/skills

# Create skill file
cat > .automaker/skills/my-skill.md <<'EOF'
---
name: my-skill
description: Does something useful
metadata:
  author: me
  created: 2026-02-25T00:00:00Z
  usageCount: 0
  successRate: 0
---

# My Skill

Instructions go here.
EOF
```

### Via API (Programmatic)

Use the skills loader utility:

```typescript
import { createSkill } from '@protolabs-ai/utils';
import fs from 'fs/promises';

const skill = await createSkill(
  '/path/to/project',
  {
    name: 'my-skill',
    emoji: '🎯',
    description: 'Does something useful',
    content: `# My Skill

Instructions go here.

## Steps

1. Do this
2. Then this
`,
    requires: {
      bins: ['git'],
      files: ['package.json'],
    },
    author: 'josh',
    tags: ['utility', 'git'],
    source: 'learned',
  },
  fs // File system module
);

console.log('Created:', skill.name);
```

## Skill Requirements

### Executable Requirements

Specify required binaries:

```yaml
requires:
  bins: [git, npm, docker]
```

The skill will only load if these executables are available in PATH.

### File Requirements

Specify required files:

```yaml
requires:
  files: [package.json, tsconfig.json, .git]
```

Files are checked relative to project root.

### Environment Variable Requirements

Specify required environment variables:

```yaml
requires:
  env: [ANTHROPIC_API_KEY, DATABASE_URL]
```

The skill will only load if these variables are set.

### Checking Requirements

```typescript
import { checkRequirements } from '@protolabs-ai/utils';
import fs from 'fs/promises';

const { satisfied, missing } = await checkRequirements(
  {
    bins: ['git', 'npm'],
    files: ['package.json'],
    env: ['API_KEY'],
  },
  '/path/to/project',
  fs
);

if (!satisfied) {
  console.log('Missing requirements:', missing);
  // ['file:tsconfig.json', 'env:API_KEY']
}
```

## Skill Discovery and Loading

### Automatic Loading

Skills are automatically loaded based on relevance to the current task:

```typescript
import { loadRelevantSkills } from '@protolabs-ai/utils';
import fs from 'fs/promises';

const result = await loadRelevantSkills(
  '/path/to/project',
  {
    tags: ['git', 'commit'],
    featureTitle: 'Fix authentication bug',
    featureDescription: 'Update JWT validation logic',
  },
  fs,
  5 // Max skills to load
);

console.log('Loaded skills:', result.totalLoaded);
console.log('Formatted prompt:', result.formattedPrompt);
```

### Relevance Scoring

Skills are scored based on:

1. **Tag matching** (3 points per match) - Highest priority
2. **Keyword matching** (1 point per match) - Match terms in task context
3. **Success rate** (2× success rate) - Prefer proven skills
4. **Usage count** (up to 1 point) - Prefer battle-tested skills

### Manual Loading

Load a specific skill by name:

```typescript
import { getSkill } from '@protolabs-ai/utils';
import fs from 'fs/promises';

const skill = await getSkill('/path/to/project', 'code-review-checklist', fs);

if (skill) {
  console.log(skill.content);
}
```

### List All Skills

```typescript
import { listSkills } from '@protolabs-ai/utils';
import fs from 'fs/promises';

const skills = await listSkills('/path/to/project', fs);

for (const skill of skills) {
  console.log(`${skill.emoji} ${skill.name} - ${skill.description}`);
  console.log(`  Success rate: ${Math.round(skill.metadata.successRate * 100)}%`);
  console.log(`  Used ${skill.metadata.usageCount} times`);
}
```

## Self-Learning System

### Recording Usage

Track skill usage to improve recommendations:

```typescript
import { recordSkillUsage } from '@protolabs-ai/utils';
import fs from 'fs/promises';

// Record successful usage
await recordSkillUsage('/path/to/project', 'code-review-checklist', true, fs);

// Record failed usage
await recordSkillUsage('/path/to/project', 'code-review-checklist', false, fs);
```

**What happens:**

1. `usageCount` increments
2. `successRate` recalculates
3. `updated` timestamp refreshes
4. Future recommendations prioritize successful skills

### Metadata Tracking

Skills track comprehensive metadata:

```typescript
interface SkillMetadata {
  author?: string; // Creator
  created: string; // ISO timestamp
  updated?: string; // Last modified
  usageCount: number; // Times used
  successRate: number; // 0.0 - 1.0
  version?: string; // Semantic version
  tags?: string[]; // Categorization
  source?: 'learned' | 'imported' | 'built-in';
}
```

### Updating Skills

Update skill content or metadata:

```typescript
import { updateSkill } from '@protolabs-ai/utils';
import fs from 'fs/promises';

const updated = await updateSkill(
  '/path/to/project',
  'code-review-checklist',
  {
    description: 'Enhanced code review checklist with security focus',
    content: `# Enhanced Code Review Checklist

Now includes OWASP Top 10 checks...`,
    tags: ['code-review', 'quality', 'security'],
  },
  fs
);

console.log('Updated:', updated?.metadata.updated);
```

## Skill Categories

### Code Quality Skills

```yaml
name: clean-code-review
tags: [code-quality, refactoring, maintainability]
```

**Examples:**

- `code-review-checklist` - Comprehensive PR review
- `refactoring-guidelines` - When and how to refactor
- `naming-conventions` - Variable/function naming standards

### Testing Skills

```yaml
name: test-driven-development
tags: [testing, tdd, quality]
```

**Examples:**

- `unit-testing-guide` - Writing effective unit tests
- `integration-testing-patterns` - Testing service boundaries
- `test-data-factories` - Creating test fixtures

### Git Skills

```yaml
name: commit-message-format
tags: [git, commits, conventional-commits]
```

**Examples:**

- `conventional-commits` - Commit message standards
- `branch-naming` - Feature branch conventions
- `merge-conflict-resolution` - Resolving conflicts

### Debugging Skills

```yaml
name: systematic-debugging
tags: [debugging, troubleshooting, problem-solving]
```

**Examples:**

- `debugging-methodology` - Systematic bug investigation
- `performance-profiling` - Identifying bottlenecks
- `log-analysis` - Reading and analyzing logs

### Documentation Skills

```yaml
name: api-documentation
tags: [documentation, api, openapi]
```

**Examples:**

- `readme-template` - Project README structure
- `api-docs-standards` - API documentation patterns
- `code-comments` - When and how to comment code

## Best Practices

### 1. Write Clear Descriptions

**Do:**

```yaml
description: Comprehensive checklist for reviewing pull requests, covering code quality, testing, security, and documentation
```

**Don't:**

```yaml
description: Review stuff
```

### 2. Use Descriptive Names

**Do:**

```yaml
name: frontend-accessibility-audit
name: database-migration-workflow
```

**Don't:**

```yaml
name: audit
name: migration
```

### 3. Add Relevant Tags

**Do:**

```yaml
tags: [security, authentication, jwt, oauth]
```

**Don't:**

```yaml
tags: [misc, stuff]
```

### 4. Specify Requirements

**Do:**

```yaml
requires:
  bins: [git, gh]
  files: [.git, package.json]
  env: [GITHUB_TOKEN]
```

**Don't:**

```yaml
# No requirements specified
# Skill may fail if prerequisites missing
```

### 5. Provide Examples

**Do:**

```markdown
# Example Usage

\`\`\`bash
git commit -m "feat: add user authentication

Implement JWT-based authentication with refresh tokens.

Closes #123
\`\`\`
```

**Don't:**

```markdown
# Instructions

Do the thing.
```

### 6. Include Success Criteria

**Do:**

```markdown
## Success Criteria

- [ ] All tests pass
- [ ] No linting errors
- [ ] Documentation updated
- [ ] PR approved by 2 reviewers
```

**Don't:**

```markdown
Make sure it works.
```

## Skill Composition

### Referencing Other Skills

Skills can reference other skills:

```markdown
# Deploy to Production

## Prerequisites

Before deploying, ensure:

1. Code review completed (see `code-review-checklist` skill)
2. Tests passing (see `ci-validation` skill)
3. Staging tested (see `staging-smoke-tests` skill)

## Deployment Steps

...
```

### Skill Chains

Create workflow skills that reference multiple sub-skills:

```markdown
---
name: feature-workflow
tags: [workflow, feature, full-cycle]
---

# Feature Development Workflow

Complete workflow from idea to production.

## Phase 1: Planning (see `feature-planning` skill)

- Research requirements
- Create PRD
- Break into phases

## Phase 2: Implementation (see `feature-implementation` skill)

- Write code
- Add tests
- Create PR

## Phase 3: Review (see `code-review-checklist` skill)

- Self-review
- Peer review
- Address feedback

## Phase 4: Deployment (see `deploy-to-production` skill)

- Merge to main
- Deploy
- Monitor
```

## Example Skills

### Example 1: Commit Skill

```markdown
---
name: conventional-commit
emoji: 📝
description: Create git commits following Conventional Commits specification
requires:
  bins: [git]
  files: [.git]
metadata:
  author: automaker
  created: 2026-01-15T00:00:00Z
  usageCount: 42
  successRate: 0.95
  tags: [git, commits, conventional-commits]
  source: built-in
---

# Conventional Commit Messages

Format: `<type>(<scope>): <description>`

## Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semicolons
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Maintenance tasks

## Example

\`\`\`bash
git commit -m "feat(auth): add JWT refresh token support

Implement automatic token refresh when access token expires.
Includes exponential backoff retry logic.

Closes #456
\`\`\`

## Best Practices

- Keep subject line under 72 characters
- Use imperative mood ("add" not "added")
- Include issue number in footer
- Explain "why" in body, not "what"
```

### Example 2: Testing Skill

```markdown
---
name: unit-testing-guide
emoji: 🧪
description: Best practices for writing effective unit tests
requires:
  files: [package.json]
metadata:
  author: josh
  created: 2026-02-01T00:00:00Z
  usageCount: 18
  successRate: 0.89
  tags: [testing, unit-tests, vitest]
---

# Unit Testing Guide

## Test Structure (AAA Pattern)

\`\`\`typescript
describe('MyService', () => {
it('does something specific', () => {
// Arrange - Set up test data
const input = { id: '123', name: 'test' };
const mockDep = vi.fn().mockResolvedValue({ ok: true });
const service = new MyService(mockDep);

    // Act - Execute the code under test
    const result = await service.doThing(input);

    // Assert - Verify the results
    expect(result.success).toBe(true);
    expect(mockDep).toHaveBeenCalledWith(input);

});
});
\`\`\`

## Test Naming

Use descriptive test names that explain:

- **What** is being tested
- **Under what conditions**
- **What the expected outcome is**

Good: `should return error when user is not authenticated`
Bad: `test user error`

## What to Test

✅ **Test:**

- Public API behavior
- Error handling
- Edge cases
- Business logic

❌ **Don't test:**

- Implementation details
- Private methods
- Third-party library internals

## Mocking Guidelines

- Mock external dependencies (APIs, databases)
- Don't mock the system under test
- Use real objects when practical
- Reset mocks between tests

## Coverage Goals

- Aim for 80%+ coverage
- 100% coverage on critical paths
- Coverage is a metric, not a goal
```

## Troubleshooting

### "Skill not loading"

**Issue:** Skill exists but isn't loading automatically.

**Solution:** Check relevance scoring:

```typescript
// Add more specific tags
tags: [specific, relevant, keywords]

// Improve name/description to match task context
name: task-specific-name
description: Include keywords from typical tasks
```

### "Requirements not satisfied"

**Issue:** Skill has unmet requirements.

**Solution:** Check requirements:

```bash
# Check executables
which git npm docker

# Check files
ls package.json tsconfig.json

# Check environment variables
env | grep API_KEY
```

### "Skill not being recommended"

**Issue:** Low success rate or usage count.

**Solution:**

1. Use the skill manually to build statistics
2. Update content to improve success rate
3. Add more specific tags for better matching

### "Duplicate skill content"

**Issue:** Multiple skills with similar content.

**Solution:** Consolidate into one comprehensive skill or create a skill chain that references sub-skills.

## Learn More

- [Agent Templates](./authoring-templates.md) - Creating agent templates that use skills
- [Agent Prompts](./authoring-prompts.md) - Writing effective agent prompts
- [SDK Integration](./sdk-integration.md) - How agents load and use skills
